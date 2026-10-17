/* eslint-disable unicorn/prefer-structured-clone -- JSON normalization preserves stored historical extension fields. */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { adminAccountPatch, profilePatch, username, position } from '@napl/contracts';
import { awardIdSchema } from '@napl/contracts/accounts';
import type { Dependencies } from '../../app.js';
import { params as parameters, query } from '../../plugins/request.js';
import { HttpError, actor, actorName, isAdmin } from '../../plugins/auth/identity.js';
import type { Prisma } from '../../plugins/db/client.js';
import { string, array, object } from '../../plugins/db/records.js';
import { accountDto, currentAccountDto, positionRequestDto } from './dto.js';
import { provisionAccount, getCurrentAccount, listAccounts, loadRankedAccounts, findAccountByUsername, requireAccount, updateAccount, renameAccount, listPositionRequests, hasPendingPositionRequest, createPositionRequest, lockPositionRequest, reviewPositionRequest, deletePositionRequest } from './queries.js';
import { checkBlockedName } from '../name-validation.js';
const awardSeason = z.string().trim().min(1).max(64);
const historicalAwardId = z.string().trim().min(1).max(160);
export function registerAccounts(app: FastifyInstance, { db }: Dependencies): void {
    app.get('/api/accounts', {
        config: {
            public: true
        }
    }, async (request) => listAccounts(db, isAdmin(request)));
    app.get('/api/accounts/id/:id', async (request) => {
        const id = z.uuid().parse(parameters(request).id);
        if (actor(request).id !== id && !isAdmin(request))
            throw new HttpError(403, 'forbidden');
        const row = await requireAccount(db, id);
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
        const row = await findAccountByUsername(db, parameters(request).username!);
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
    }, async (request) => currentAccountDto(await getCurrentAccount(db, actor(request).id), request.userRoles));
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
            const existing = await requireAccount(tx, id, true);
            if (!admin && input.position !== undefined && (!input.strikersId || existing.strikers_id || existing.team_id || array(existing.matches).length > 0))
                throw new HttpError(403, 'position_review_required');
            if (!admin && input.strikersId !== undefined && existing.strikers_id && input.strikersId !== existing.strikers_id)
                throw new HttpError(403, 'strikers_id_locked');
            if (input.strikersId && !/^\d{2,15}$/.test(input.strikersId))
                throw new HttpError(400, 'invalid_strikers_id');
            const data = {
                country: input.country, steam_url: input.steamUrl, pending_image_url: input.pendingImageUrl,
                strikers_id: input.strikersId, position: input.position,
                ...('imageUrl' in input && { image_url: input.imageUrl }),
                ...('stats' in input && { stats: input.stats }), ...('matches' in input && { matches: input.matches === undefined ? undefined : JSON.parse(JSON.stringify(input.matches)) }),
                ...('championships' in input && { championships: input.championships === undefined ? undefined : JSON.parse(JSON.stringify(input.championships)) }),
                ...('totwUntil' in input && { totw_until: input.totwUntil == null ? input.totwUntil : new Date(input.totwUntil) }),
                ...('cheater' in input && { cheater: input.cheater }),
            } satisfies Prisma.AccountUpdateManyMutationInput;
            const row = await updateAccount(tx, id, data);
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
            const account = await requireAccount(tx, id, true);
            const awards = Array.isArray(account.awards) ? account.awards : [];
            const exists = awards.some(value => {
                const award = object(value);
                return award.awardId === awardId && award.season === season;
            });
            if (exists)
                return;
            if (awards.length >= 1000)
                throw new HttpError(400, 'award_limit');
            await updateAccount(tx, id, {
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
            const account = await requireAccount(tx, id, true);
            const awards = Array.isArray(account.awards) ? account.awards : [];
            const retained = awards.filter(value => {
                const award = object(value);
                return award.awardId !== awardId || award.season !== season;
            });
            if (retained.length !== awards.length)
                await updateAccount(tx, id, { awards: retained });
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
        await db.transaction(tx => renameAccount(tx, id, input.username));
        return {
            ok: true
        };
    });
    app.get('/api/position-requests', async (request) => {
        const q = query(request);
        const rows = await listPositionRequests(db, { accountId: isAdmin(request) ? undefined : actor(request).id, status: q.status });
        return rows.map(row => positionRequestDto(row));
    });
    app.post('/api/position-requests', async (request) => {
        const input = z.strictObject({
            toPos: position, reason: z.string().max(2000).default('')
        }).parse(request.body);
        return db.transaction(async (tx) => {
            const self = await requireAccount(tx, actor(request).id, true);
            if (self.position === input.toPos)
                throw new HttpError(400, 'position_unchanged');
            const pending = await hasPendingPositionRequest(tx, actor(request).id);
            if (pending)
                throw new HttpError(409, 'request_pending');
            return positionRequestDto(await createPositionRequest(tx, {
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
            const request = await lockPositionRequest(tx, parameters(request_).id!);
            if (request.status !== 'pending')
                throw new HttpError(409, 'already_reviewed');
            if (input.status === 'approved') {
                if (request.to_pos === null) {
                    await requireAccount(tx, string(request.account_id));
                    throw new Error('Stored position request has no target position');
                }
                await updateAccount(tx, string(request.account_id), {
                    position: request.to_pos
                });
            }
            return positionRequestDto(await reviewPositionRequest(tx, request.id, {
                status: input.status, reviewed_by: reviewer, review_note: input.reviewNote, reviewed_at: new Date()
            }));
        });
    });
    app.delete('/api/position-requests/:id', {
        config: {
            role: 'admin'
        }
    }, async (request) => {
        await deletePositionRequest(db, parameters(request).id!);
        return {
            ok: true
        };
    });
}
