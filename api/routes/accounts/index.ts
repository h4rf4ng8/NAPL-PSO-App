import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { adminAccountPatch, profilePatch, username, position } from '@napl/contracts';
import { awardIdSchema } from '@napl/contracts/accounts';
import type { Dependencies } from '../../app.js';
import { params as parameters, query } from '../../plugins/request.js';
import { provisionAccount } from './provision.js';
import { HttpError, actor, actorName, isAdmin } from '../../plugins/auth/identity.js';
import { Prisma, type Database } from '../../plugins/db/client.js';
import { list, get, need, insert, patch, remove, dto, string, array, object, toColumns } from '../../plugins/db/records.js';
import { accountDto } from './dto.js';
import { getCurrentAccount, listAccounts, loadRankedAccounts } from './queries.js';
import { checkBlockedName } from '../name-validation.js';
const accountColumns = {
    country: 'country', steamUrl: 'steam_url', pendingImageUrl: 'pending_image_url', strikersId: 'strikers_id', position: 'position', imageUrl: 'image_url', stats: 'stats', matches: 'matches', championships: 'championships', totwUntil: 'totw_until', cheater: 'cheater'
};
const awardSeason = z.string().trim().min(1).max(64);
const historicalAwardId = z.string().trim().min(1).max(160);
async function rename(database: Database, id: string, name: string): Promise<void> {
    const current = await need(database, 'accounts', id, true), old = string(current.username).toLowerCase();
    const replace = (value: unknown): unknown => typeof value === 'string' && value.toLowerCase() === old ? name : value;
    const renameEntry = (value: unknown) => {
        const entry = object(value);
        return {...entry, username:replace(entry.username)};
    };
    await patch(database, 'accounts', id, {
        username: name, username_lower: name.toLowerCase()
    });
    const teams = await database.query(Prisma.sql `SELECT * FROM public.teams FOR UPDATE`);
    for (const team of teams)
        await patch(database, 'teams', string(team.id), {
            owner_username: replace(team.owner_username),
            members: array(team.members).map(value=>replace(value)),
            pending_members:array(team.pending_members).map(value=>typeof value==='string'?replace(value):renameEntry(value)),
            lineup:Object.fromEntries(Object.entries(object(team.lineup)).map(([slot,value])=>[slot,replace(value)]))
        });
    for (const [table, column] of [['transfers', 'player_username'], ['transfers', 'created_by'], ['totw_votes', 'voter_username'], ['totw_votes', 'voted_for_username'], ['position_change_requests', 'username'], ['submissions', 'submitted_by'], ['submissions', 'reviewed_by'], ['articles', 'author'], ['news', 'author']] as const) {
        await database.execute(Prisma.sql `UPDATE public.${Prisma.raw(table)} SET ${Prisma.raw(column)}=${name} WHERE lower(${Prisma.raw(column)})=${old}`);
    }
    const periods = await list(database, 'totw_voting_periods');
    for (const period of periods)
        await patch(database, 'totw_voting_periods', string(period.id), {
            eligible_players: array(period.eligible_players).map(value=>replace(value)),
            winners:period.winners===null?null:Object.fromEntries(Object.entries(object(period.winners)).map(([slot,value])=>[slot,typeof value==='string'?replace(value):value]))
        });
    const submissions = await list(database, 'submissions');
    for (const sub of submissions)
        await patch(database, 'submissions', string(sub.id), {
            player_stats: array(sub.player_stats).map(value=>renameEntry(value)), edits: array(sub.edits).map(value=>renameEntry(value))
        });
}
export function registerAccounts(app: FastifyInstance, { db }: Dependencies): void {
    app.get('/api/accounts', {
        config: {
            public: true
        }
    }, async (request) => listAccounts(db, request));
    app.get('/api/accounts/id/:id', async (request) => {
        const id = z.uuid().parse(parameters(request).id);
        if (actor(request).id !== id && !isAdmin(request))
            throw new HttpError(403, 'forbidden');
        const row = await need(db, 'accounts', id);
        const population = await loadRankedAccounts(db);
        const calculated = population.find(account => account.id === id);
        if (!calculated) throw new HttpError(503, 'account_stats_unavailable');
        return { ...accountDto(row, true), ranking: calculated.ranking, cardStats: calculated.cardStats, seasonStats: calculated.seasonStats };
    });
    app.get('/api/accounts/:username', {
        config: {
            public: true
        }
    }, async (request) => {
        const row = await get(db, 'accounts', 'username_lower', parameters(request).username!.toLowerCase());
        if (!row) return null;
        const population = await loadRankedAccounts(db);
        const calculated = population.find(account => account.id === row.id);
        if (!calculated) throw new HttpError(503, 'account_stats_unavailable');
        return { ...accountDto(row), ranking: calculated.ranking, cardStats: calculated.cardStats, seasonStats: calculated.seasonStats };
    });
    app.get('/api/users/me', {
        config: {
            membership: false
        }
    }, async (request) => getCurrentAccount(db, request));
    app.post('/api/users/me', async (request) => {
        z.strictObject({}).parse(request.body ?? {});
        const identity = actor(request);
        const row = await provisionAccount(db, identity);
        const population = await loadRankedAccounts(db);
        const calculated = population.find(account => account.id === row.id);
        if (!calculated) throw new HttpError(503, 'account_stats_unavailable');
        return {
            ...accountDto(row, true), ranking: calculated.ranking, cardStats: calculated.cardStats,
            seasonStats: calculated.seasonStats, roles: request.userRoles
        };
    });
    app.patch('/api/accounts/:id', async (request) => {
        const id = z.uuid().parse(parameters(request).id), admin = isAdmin(request);
        if (!admin && actor(request).id !== id)
            throw new HttpError(403, 'forbidden');
        const input = (admin ? adminAccountPatch : profilePatch).parse(request.body);
        const { row, calculated } = await db.transaction(async (tx) => {
            const existing = await need(tx, 'accounts', id, true);
            if (!admin && input.position !== undefined && (!input.strikersId || existing.strikers_id || existing.team_id || array(existing.matches).length > 0))
                throw new HttpError(403, 'position_review_required');
            if (!admin && input.strikersId !== undefined && existing.strikers_id && input.strikersId !== existing.strikers_id)
                throw new HttpError(403, 'strikers_id_locked');
            if (input.strikersId && !/^\d{2,15}$/.test(input.strikersId))
                throw new HttpError(400, 'invalid_strikers_id');
            const row = await patch(tx, 'accounts', id, toColumns(input, accountColumns));
            const population = await loadRankedAccounts(tx);
            const calculated = population.find(account => account.id === id);
            if (!calculated) throw new HttpError(503, 'account_stats_unavailable');
            return { row, calculated };
        });
        return {
            ...accountDto(row, actor(request).id === id || admin),
            ranking: calculated.ranking, cardStats: calculated.cardStats, seasonStats: calculated.seasonStats,
            ...((actor(request).id === id) && {roles:request.userRoles})
        };
    });
    app.put('/api/accounts/:id/awards/:awardId/:season', {
        config: { role: 'admin' }
    }, async (request, reply) => {
        const id = z.uuid().parse(parameters(request).id);
        const awardId = awardIdSchema.parse(parameters(request).awardId);
        const season = awardSeason.parse(parameters(request).season);
        z.strictObject({}).parse(request.body ?? {});
        const assignedBy = await actorName(db, request);
        await db.transaction(async (tx) => {
            const account = await need(tx, 'accounts', id, true);
            const awards = array(account.awards);
            const exists = awards.some(value => {
                const award = object(value);
                return award.awardId === awardId && award.season === season;
            });
            if (exists)
                return;
            if (awards.length >= 1000)
                throw new HttpError(400, 'award_limit');
            await patch(tx, 'accounts', id, {
                awards: [...awards, { awardId, season, assignedBy, assignedAt: Date.now() }]
            });
        });
        return reply.code(204).send();
    });
    app.delete('/api/accounts/:id/awards/:awardId/:season', {
        config: { role: 'admin' }
    }, async (request, reply) => {
        const id = z.uuid().parse(parameters(request).id);
        const awardId = historicalAwardId.parse(parameters(request).awardId);
        const season = awardSeason.parse(parameters(request).season);
        z.strictObject({}).parse(request.body ?? {});
        await db.transaction(async (tx) => {
            const account = await need(tx, 'accounts', id, true);
            const awards = array(account.awards);
            const retained = awards.filter(value => {
                const award = object(value);
                return award.awardId !== awardId || award.season !== season;
            });
            if (retained.length !== awards.length)
                await patch(tx, 'accounts', id, { awards: retained });
        });
        return reply.code(204).send();
    });
    app.post('/api/accounts/:id/rename', async (request) => {
        const id = z.uuid().parse(parameters(request).id);
        if (actor(request).id !== id && !isAdmin(request))
            throw new HttpError(403, 'forbidden');
        const input = z.strictObject({
            username
        }).parse(request.body);
        if (!isAdmin(request) && checkBlockedName(input.username))
            throw new HttpError(400, 'name_not_allowed', 'That username isn\'t allowed. Please choose a different one.');
        await db.transaction(tx => rename(tx, id, input.username));
        return {
            ok: true
        };
    });
    app.get('/api/position-requests', async (request) => {
        const q = query(request);
        let rows = await list(db, 'position_change_requests');
        if (!isAdmin(request))
            rows = rows.filter(r => r.account_id === actor(request).id);
        if (q.status)
            rows = rows.filter(r => r.status === q.status);
        return rows.map(value => dto(value)).toSorted((a, b) => Number(b.createdAt) - Number(a.createdAt));
    });
    app.post('/api/position-requests', async (request) => {
        const input = z.strictObject({
            toPos: position, reason: z.string().max(2000).default('')
        }).parse(request.body);
        return db.transaction(async (tx) => {
            const self = await need(tx, 'accounts', actor(request).id, true);
            if (self.position === input.toPos)
                throw new HttpError(400, 'position_unchanged');
            const pending = await tx.query(Prisma.sql `SELECT id FROM public.position_change_requests WHERE account_id=${actor(request).id}::uuid AND status='pending'`);
            if (pending.length > 0)
                throw new HttpError(409, 'request_pending');
            return dto(await insert(tx, 'position_change_requests', {
                account_id: self.id, username: self.username, from_pos: self.position, to_pos: input.toPos, reason: input.reason, status: 'pending'
            }));
        });
    });
    app.post('/api/position-requests/:id/review', {
        config: {
            role: 'admin'
        }
    }, async (request_) => {
        const input = z.strictObject({
            status: z.enum(['approved', 'denied']), reviewNote: z.string().max(2000).default('')
        }).parse(request_.body);
        const reviewer = await actorName(db, request_);
        return db.transaction(async (tx) => {
            const request = await need(tx, 'position_change_requests', parameters(request_).id!, true);
            if (request.status !== 'pending')
                throw new HttpError(409, 'already_reviewed');
            if (input.status === 'approved')
                await patch(tx, 'accounts', string(request.account_id), {
                    position: request.to_pos
                });
            return dto(await patch(tx, 'position_change_requests', string(request.id), {
                status: input.status, reviewed_by: reviewer, review_note: input.reviewNote, reviewed_at: new Date()
            }));
        });
    });
    app.delete('/api/position-requests/:id', {
        config: {
            role: 'admin'
        }
    }, async (request) => {
        await remove(db, 'position_change_requests', parameters(request).id!);
        return {
            ok: true
        };
    });
}
