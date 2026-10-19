import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { articleInput, newsInput, ruleInput, scheduleInput, transferInput, id } from '@napl/contracts';
import { MAX_SCHEDULE_MATCHES } from '@napl/contracts/league';
import { Prisma } from '../../plugins/db/client.js';
import type { Dependencies } from '../../app.js';
import { actor, actorName } from '../../plugins/auth/identity.js';
import { HttpError } from '../../plugins/auth/identity.js';
import { pathSegment, page, pageInput, textPage } from '../payload/page.js';
import { prepareImage, removeUnusedImages } from '../payload/storage.js';
import { listTeams } from '../teams/queries.js';
import { loadTeamRecords } from '../matches/records.js';
import { isAdmin } from '../../plugins/auth/identity.js';
import { params as parameters, query } from '../../plugins/request.js';
import * as queries from './queries.js';
import { newsDto, ruleDto, articleDto, scheduleDto, transferDto } from './dto.js';
export function registerContent(app: FastifyInstance, { db, webhookUrl, storage }: Dependencies): void {
    app.get('/api/news', { config: { public: true } }, async (request) => {
        const rows = await queries.listNews(db);
        return page(rows.map(row => { const { body: _body, notes: _notes, ...summary } = newsDto(row); return { ...summary, bodyUrl: `/api/news/${pathSegment(row.id)}/body`, notesUrl: `/api/news/${pathSegment(row.id)}/notes` }; }), 'news', pageInput(request));
    });
    app.get('/api/news/:id/:field', { config: { public: true } }, async request => {
        const field = z.enum(['body', 'notes']).parse(parameters(request).field);
        const row = await db.client.news.findUnique({ where: { id: parameters(request).id! } });
        if (!row) throw new HttpError(404, 'not_found');
        return textPage(row[field] ?? '', `news:${row.id}:${field}`, pageInput(request).after);
    });
    app.post('/api/news', { config: { role: 'admin' } }, async (request) => {
        const input = newsInput.parse(request.body);
        const author = await actorName(db, request);
        return db.transaction(async (tx) => newsDto(await queries.upsertNews(tx, input, author)));
    });
    app.patch('/api/news/:id', { config: { role: 'admin' } }, async (request) => {
        const input = newsInput.omit({ id: true }).partial().parse(request.body);
        return newsDto(await queries.patchNews(db, parameters(request).id!, input));
    });
    app.delete('/api/news/:id', { config: { role: 'admin' } }, async (request) => {
        await queries.deleteNews(db, parameters(request).id!);
        return { ok: true };
    });

    app.get('/api/rules', { config: { public: true } }, async (request) => {
        const rows = await queries.listRules(db);
        query(request);
        return page(rows.map(value => { const { body: _body, ...summary } = ruleDto(value); return { ...summary, bodyUrl: `/api/rules/${pathSegment(value.id)}` }; }), 'rules', pageInput(request));
    });
    app.get('/api/rules/:id', { config: { public: true } }, async request => {
        const row = await db.client.ruleSection.findUnique({ where: { id: parameters(request).id! } });
        if (!row) throw new HttpError(404, 'not_found');
        return ruleDto(row);
    });
    app.post('/api/rules', { config: { role: 'admin' } }, async (request) => {
        const input = ruleInput.parse(request.body);
        return db.transaction(async (tx) => ruleDto(await queries.upsertRule(tx, input)));
    });
    app.patch('/api/rules/:id', { config: { role: 'admin' } }, async (request) => {
        const input = ruleInput.omit({ id: true }).partial().parse(request.body);
        return ruleDto(await queries.patchRule(db, parameters(request).id!, input));
    });
    app.delete('/api/rules/:id', { config: { role: 'admin' } }, async (request) => {
        await queries.deleteRule(db, parameters(request).id!);
        return { ok: true };
    });

    app.get('/api/articles', { config: { public: true } }, async (request) => {
        const rows = await queries.listArticles(db);
        query(request);
        return page(rows.map(value => { const { body: _body, excerpt: _excerpt, ...summary } = articleDto(value); return { ...summary, bodyUrl: `/api/articles/slug/${pathSegment(value.slug)}`, excerptUrl: `/api/articles/${pathSegment(value.id)}/excerpt` }; }), 'articles', pageInput(request));
    });
    app.get('/api/articles/:id/excerpt', { config: { public: true } }, async request => {
        const row = await db.client.article.findUnique({ where: { id: parameters(request).id! } });
        if (!row) throw new HttpError(404, 'not_found');
        return textPage(row.excerpt ?? '', `article:${row.id}:excerpt`, pageInput(request).after);
    });
    app.post('/api/articles', { config: { role: 'admin' } }, async (request) => {
        const input = articleInput.parse(request.body);
        const author = await actorName(db, request);
        const images: (string | null | undefined)[] = [];
        try { return await db.transaction(async tx => {
            await tx.query(Prisma.sql`SELECT id FROM asl.articles WHERE id=${input.id} FOR UPDATE`);
            const previous = await tx.client.article.findUnique({ where: { id: input.id } });
            if (input.coverImageUrl !== undefined) {
                images.push(previous?.cover_image_url);
                input.coverImageUrl = await prepareImage(storage, input.coverImageUrl, previous?.cover_image_url ?? null, { kind: 'article-cover', entityId: input.id, actorId: actor(request).id, public: input.publishedAt !== null && (input.publishedAt !== undefined || !previous || Boolean(previous.published_at)) });
                images.push(input.coverImageUrl);
            }
            return articleDto(await queries.upsertArticle(tx, input, author, previous));
        }); } finally { await removeUnusedImages(db, storage, request, images); }
    });
    app.patch('/api/articles/:id', { config: { role: 'admin' } }, async (request) => {
        const input = articleInput.omit({ id: true }).partial().parse(request.body);
        const images: (string | null | undefined)[] = [];
        try { return await db.transaction(async tx => {
            await tx.query(Prisma.sql`SELECT id FROM asl.articles WHERE id=${parameters(request).id!} FOR UPDATE`);
            const previous = await tx.client.article.findUnique({ where: { id: parameters(request).id! } });
            if (!previous) throw new HttpError(404, 'not_found');
            if (input.coverImageUrl !== undefined) {
                images.push(previous.cover_image_url);
                input.coverImageUrl = await prepareImage(storage, input.coverImageUrl, previous.cover_image_url, { kind: 'article-cover', entityId: previous.id, actorId: actor(request).id, public: input.publishedAt !== null && (input.publishedAt !== undefined || Boolean(previous.published_at)) });
                images.push(input.coverImageUrl);
            }
            return articleDto(await queries.patchArticle(tx, previous.id, input));
        }); } finally { await removeUnusedImages(db, storage, request, images); }
    });
    app.delete('/api/articles/:id', { config: { role: 'admin' } }, async (request) => {
        const images: (string | null | undefined)[] = [];
        try { await db.transaction(async tx => {
            const articleId = parameters(request).id!;
            await tx.query(Prisma.sql`SELECT id FROM asl.articles WHERE id=${articleId} FOR UPDATE`);
            const previous = await tx.client.article.findUnique({ where: { id: articleId }, select: { cover_image_url: true } });
            images.push(previous?.cover_image_url);
            await queries.deleteArticle(tx, articleId);
        }); } finally { await removeUnusedImages(db, storage, request, images); }
        return { ok: true };
    });
    app.get('/api/schedule', { config: { public: true } }, async (request) => {
        const { season } = query(request);
        const { week } = z.object({ week: z.coerce.number().int().min(1).max(10_000).optional() }).parse(request.query);
        const [rows, teams, records] = await Promise.all([queries.listSchedule(db, season), listTeams(db, { id: request.identity?.id, admin: isAdmin(request) }), request.identity ? loadTeamRecords(db) : []]);
        const byId = new Map(teams.map(team => [team.id, { id: team.id, name: team.name, tag: team.tag, color: team.color }]));
        const recordById = new Map(records.filter(row => row.season === 'all').map(row => [row.teamId, { w: row.w, d: row.d, l: row.l }]));
        const weeks = new Set(rows.map(row => row.week));
        const result = page(rows.filter(row => !week || row.week === week).map(value => { const { notes: _notes, streamUrl, ...summary } = scheduleDto(value); return { ...summary,
            homeTeam: byId.get(value.home_team_id) ?? null, awayTeam: byId.get(value.away_team_id) ?? null,
            homeRecord: request.identity ? recordById.get(value.home_team_id) ?? { w: 0, d: 0, l: 0 } : null,
            awayRecord: request.identity ? recordById.get(value.away_team_id) ?? { w: 0, d: 0, l: 0 } : null,
            streamUrl: streamUrl ? `/api/schedule/${pathSegment(value.id)}/stream` : null,
            notesUrl: `/api/schedule/${pathSegment(value.id)}/notes` }; }), `schedule:${season ?? ''}:${week ?? ''}:${Boolean(request.identity)}`, pageInput(request));
        return { ...result, weekRange: { min: weeks.size > 0 ? Math.min(...weeks) : null, max: weeks.size > 0 ? Math.max(...weeks) : null, count: weeks.size } };
    });
    app.get('/api/schedule/:id/stream', { config: { public: true } }, async (request, reply) => {
        const row = await db.client.scheduledMatch.findUnique({ where: { id: parameters(request).id! } });
        if (!row?.stream_url || !/^https?:\/\//.test(row.stream_url)) throw new HttpError(404, 'not_found');
        return reply.redirect(new URL(row.stream_url).href);
    });
    app.get('/api/schedule/:id/links/streamUrl', { config: { role: 'admin' } }, async request => {
        const row = await db.client.scheduledMatch.findUnique({ where: { id: parameters(request).id! } });
        if (!row) throw new HttpError(404, 'not_found');
        return textPage(row.stream_url ?? '', `schedule:${row.id}:stream`, pageInput(request).after);
    });
    app.get('/api/schedule/:id/notes', { config: { public: true } }, async request => {
        const row = await db.client.scheduledMatch.findUnique({ where: { id: parameters(request).id! } });
        if (!row) throw new HttpError(404, 'not_found');
        return textPage(row.notes ?? '', `schedule:${row.id}:notes`, pageInput(request).after);
    });
    app.post('/api/schedule', { config: { role: 'admin' } }, async (request) => {
        const input = scheduleInput.parse(request.body);
        const updatedAt = new Date();
        return db.transaction(async (tx) => scheduleDto(await queries.upsertScheduledMatch(tx, input, updatedAt)));
    });
    app.patch('/api/schedule/:id', { config: { role: 'admin' } }, async (request) => {
        const input = scheduleInput.omit({ id: true }).partial().parse(request.body);
        return scheduleDto(await queries.patchScheduledMatch(db, parameters(request).id!, input));
    });
    app.delete('/api/schedule/:id', { config: { role: 'admin' } }, async (request) => {
        await queries.deleteScheduledMatch(db, parameters(request).id!);
        return { ok: true };
    });
    app.get('/api/articles/slug/:slug', {
        config: {
            public: true
        }
    }, async (request) => {
        const row = await queries.articleBySlug(db, parameters(request).slug!);
        return row ? articleDto(row) : null;
    });
    app.put('/api/rules/order', {
        config: {
            role: 'admin'
        }
    }, async (request) => {
        const { ids } = z.strictObject({
            ids: z.array(id).max(1000)
        }).parse(request.body);
        await db.transaction(async (tx) => {
            for (const [index, key] of ids.entries())
                await queries.patchRule(tx, key, { sortOrder: index });
        });
        return {
            ok: true
        };
    });
    app.post('/api/rules/:id/move', { config: { role: 'admin' } }, async request => {
        const { direction } = z.strictObject({ direction: z.enum(['up', 'down']) }).parse(request.body);
        const id = parameters(request).id!;
        await db.transaction(async tx => {
            const rows = await tx.client.ruleSection.findMany({ select: { id: true, sort_order: true }, orderBy: [{ sort_order: 'asc' }, { id: 'asc' }] });
            const index = rows.findIndex(row => row.id === id);
            if (index === -1) throw new HttpError(404, 'not_found');
            const current = rows[index]!;
            request.resource = { type: 'rule', id: current.id };
            const adjacent = index + (direction === 'up' ? -1 : 1);
            if (adjacent < 0 || adjacent >= rows.length) return;
            rows[index] = rows[adjacent]!;
            rows[adjacent] = current;
            const updatedAt = new Date();
            for (const [order, row] of rows.entries()) await tx.client.ruleSection.update({ where: { id: row.id }, data: { sort_order: order, updated_at: updatedAt } });
        });
        return { ok: true };
    });
    app.post('/api/schedule/bulk', {
        config: {
            role: 'admin'
        }
    }, async (request) => {
        const { matches } = z.strictObject({
            matches: z.array(scheduleInput).max(MAX_SCHEDULE_MATCHES)
        }).parse(request.body);
        return db.transaction(async (tx) => {
            const rows = [];
            for (const m of matches)
                rows.push(scheduleDto(await queries.upsertScheduledMatch(tx, m)));
            return rows;
        });
    });
    app.put('/api/schedule/season/:season', {
        config: {
            role: 'admin'
        }
    }, async (request) => {
        const season = id.trim().min(1).parse(parameters(request).season);
        const { matches } = z.strictObject({
            matches: z.array(scheduleInput.omit({ season: true })).min(1).max(MAX_SCHEDULE_MATCHES)
        }).parse(request.body);
        return db.transaction(async (tx) => {
            await queries.deleteScheduleSeason(tx, season);
            const rows = [];
            for (const match of matches)
                rows.push(scheduleDto(await queries.createScheduledMatch(tx, { ...match, season })));
            return rows;
        });
    });
    app.delete('/api/schedule/season/:season', {
        config: {
            role: 'admin'
        }
    }, async (request) => {
        await queries.deleteScheduleSeason(db, parameters(request).season!);
        return {
            ok: true
        };
    });
    app.get('/api/transfers', {
        config: {
            public: true
        }
    }, async (request) => {
        const season = query(request).season;
        const [rows, teams] = await Promise.all([queries.listTransfers(db, season), listTeams(db, { id: request.identity?.id, admin: isAdmin(request) })]);
        const byId = new Map(teams.map(team => [team.id, { id: team.id, name: team.name, tag: team.tag, color: team.color, logoUrl: team.logoUrl }]));
        return page(rows.map(value => ({ ...transferDto(value), fromTeam: byId.get(value.from_team_id ?? '') ?? null, toTeam: byId.get(value.to_team_id ?? '') ?? null })), `transfers:${season ?? ''}:${request.identity?.id ?? 'anonymous'}`, pageInput(request));
    });
    app.post('/api/transfers', {
        config: {
            role: 'admin'
        }
    }, async (request) => {
        const input = transferInput.parse(request.body);
        const name = await actorName(db, request);
        return db.transaction(async (tx) => transferDto(await queries.upsertTransfer(tx, { ...input, id: input.id ?? crypto.randomUUID() }, name, actor(request).id)));
    });
    app.patch('/api/transfers/:id', {
        config: {
            role: 'admin'
        }
    }, async (request) => {
        const input = z.strictObject({
            windowType: z.enum(['league', 'cross_league']).nullable()
        }).parse(request.body);
        return transferDto(await queries.patchTransfer(db, parameters(request).id!, input.windowType));
    });
    app.delete('/api/transfers/:id', {
        config: {
            role: 'admin'
        }
    }, async (request) => {
        await queries.deleteTransfer(db, parameters(request).id!);
        return {
            ok: true
        };
    });
    app.get('/api/integrations/discord', {
        config: {
            role: 'super_admin'
        }
    }, async () => ({
        configured: Boolean(webhookUrl)
    }));
}
