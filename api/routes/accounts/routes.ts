/* eslint-disable unicorn/prefer-structured-clone -- JSON normalization preserves stored historical extension fields. */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { adminAccountPatch, profilePatch, position } from '@napl/contracts';
import { awardIdSchema } from '@napl/contracts/accounts';
import type { Dependencies } from '../../app.js';
import { params as parameters, query, clientIp } from '../../plugins/request.js';
import { HttpError, actor, actorName, isAdmin } from '../../plugins/auth/identity.js';
import { RateLimiter } from '../../plugins/limits/auth.js';
import type { Prisma } from '../../plugins/db/client.js';
import { string, array, object } from '../../plugins/db/records.js';
import { accountDto, currentAccountDto, positionRequestDto, playerCard, playerSummary } from './dto.js';
import { provisionAccount, getCurrentAccount, listAccounts, loadRankedAccounts, findAccountByUsername, requireAccount, updateAccount, listPositionRequests, hasPendingPositionRequest, createPositionRequest, lockPositionRequest, reviewPositionRequest, deletePositionRequest } from './queries.js';
import { pathSegment, detailUrl, page, pageInput, textPage } from '../payload/page.js';
const awardSeason = z.string().trim().min(1).max(64);
const historicalAwardId = z.string().trim().min(1).max(160);
export function registerAccounts(app: FastifyInstance, { db, auth }: Dependencies): void {
    const limiter = new RateLimiter(auth.authStore);
    app.get('/api/accounts', {
        config: {
            public: true
        }
    }, async (request) => {
        const filters = z.object({ season: z.string().max(160).optional(), search: z.string().max(100).optional(), position: position.optional(), teamId: z.string().max(160).optional(), pendingImage: z.literal('1').optional() }).parse(request.query);
        if (filters.pendingImage && !isAdmin(request)) throw new HttpError(403, 'admin_required');
        const accounts = await listAccounts(db, isAdmin(request));
        const rows = accounts.filter(row => (!filters.search || string(row.username).toLowerCase().includes(filters.search.toLowerCase()))
            && (!filters.position || row.position === filters.position) && (!filters.teamId || (filters.teamId === 'unassigned' ? !row.teamId : row.teamId === filters.teamId)) && (!filters.pendingImage || Boolean(row.pendingImageUrl)));
        return page(rows.map(row => ({ ...playerSummary(row, filters.season ?? 'all'), strikersId: row.strikersId, cheater: row.cheater,
            ...(isAdmin(request) && { pendingImageUrl: row.pendingImageUrl }) })), `accounts:${JSON.stringify(filters)}:${isAdmin(request)}`, pageInput(request));
    });
    app.get('/api/accounts/id/:id', async (request) => {
        const id = z.uuid().parse(parameters(request).id);
        if (actor(request).id !== id && !isAdmin(request))
            throw new HttpError(403, 'forbidden');
        const row = await requireAccount(db, id);
        request.resource = { type: 'account', id: row.id };
        const population = await loadRankedAccounts(db);
        const calculated = population.find(account => account.id === id);
        if (!calculated) throw new HttpError(503, 'account_stats_unavailable');
        return { ...playerCard(calculated, query(request).season ?? 'all'), email: row.email,
            pendingImageUrl: accountDto(row, true).pendingImageUrl,
            statsUrl: detailUrl(`/api/accounts/${id}/stats`, row.stats) };
    });
    app.get('/api/accounts/:username', {
        config: {
            public: true
        }
    }, async (request) => {
        const row = await findAccountByUsername(db, parameters(request).username!);
        if (!row) return null;
        request.resource = { type: 'account', id: row.id };
        const population = await loadRankedAccounts(db);
        const calculated = population.find(account => account.id === row.id);
        if (!calculated) throw new HttpError(503, 'account_stats_unavailable');
        return playerCard(calculated, query(request).season ?? 'all');
    });
    app.get('/api/users/me', async (request) => {
        const me = currentAccountDto(await getCurrentAccount(db, actor(request).id), request.userRoles);
        if (me) request.resource = { type: 'account', id: String(me.id) };
        return me ? { ...playerCard(me, query(request).season ?? 'all'), email: me.email, pendingImageUrl: me.pendingImageUrl, roles: me.roles } : null;
    });
    app.post('/api/users/me', async (request) => {
        const input = z.strictObject({ providerToken: z.string().min(1).max(4096).optional() }).parse(request.body === undefined ? {} : request.body);
        const identity = actor(request);
        await limiter.provision(clientIp(request), identity.id, identity.sessionId);
        let username: string | undefined;
        if (input.providerToken) {
            const user = await auth.supabase.user(request.headers.authorization!.slice(7));
            const profile = await auth.discord.identity(input.providerToken);
            if (user.id !== identity.id || user.identities.every(item => item.provider !== 'discord' || item.id !== profile.id))
                throw new HttpError(401, 'discord_identity_mismatch');
            username = profile.username;
        }
        const row = await provisionAccount(db, identity, username);
        request.resource = { type: 'account', id: row.id };
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
            request.resource = { type: 'account', id: existing.id };
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
            request.resource = { type: 'account', id: account.id };
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
            request.resource = { type: 'account', id: account.id };
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
    app.get('/api/position-requests', async (request) => {
        const q = query(request);
        const scope = z.enum(['mine']).optional().parse(q.scope);
        const rows = await listPositionRequests(db, { accountId: scope !== 'mine' && isAdmin(request) ? undefined : actor(request).id, status: q.status });
        return page(rows.map(row => { const { reason: _reason, ...summary } = positionRequestDto(row); return { ...summary, reasonUrl: `/api/position-requests/${pathSegment(row.id)}/reason` }; }), `position-requests:${q.status ?? ''}:${scope ?? ''}:${actor(request).id}`, pageInput(request));
    });
    app.get('/api/position-requests/:id/reason', async request => {
        const rows = await listPositionRequests(db, { accountId: isAdmin(request) ? undefined : actor(request).id });
        const row = rows.find(value => value.id === parameters(request).id);
        if (!row) throw new HttpError(404, 'not_found');
        request.resource = { type: 'position_request', id: row.id };
        return textPage(row.reason ?? '', `position-request:${row.id}`, pageInput(request).after);
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
            request_.resource = { type: 'position_request', id: request.id };
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
                status: input.status, reviewed_by: reviewer, reviewed_by_account_id: actor(request_).id,
                review_note: input.reviewNote, reviewed_at: new Date()
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
