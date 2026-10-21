import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { articleInput, newsInput, ruleInput, scheduleInput, transferInput, id } from '@napl/contracts';
import { MAX_SCHEDULE_MATCHES } from '@napl/contracts/league';
import type { Dependencies } from '../../app.js';
import { actor, actorName } from '../../plugins/auth/identity.js';
import { params as parameters, query } from '../../plugins/request.js';
import * as queries from './queries.js';
import { newsDto, ruleDto, articleDto, scheduleDto, transferDto } from './dto.js';
export function registerContent(app: FastifyInstance, { db, webhookUrl }: Dependencies): void {
    app.get('/api/news', { config: { public: true } }, async () => {
        const rows = await queries.listNews(db);
        return rows.map(row => newsDto(row));
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
        return rows.map(value => ruleDto(value));
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
        return rows.map(value => articleDto(value));
    });
    app.post('/api/articles', { config: { role: 'admin' } }, async (request) => {
        const input = articleInput.parse(request.body);
        const author = await actorName(db, request);
        return db.transaction(async (tx) => articleDto(await queries.upsertArticle(tx, input, author)));
    });
    app.patch('/api/articles/:id', { config: { role: 'admin' } }, async (request) => {
        const input = articleInput.omit({ id: true }).partial().parse(request.body);
        return articleDto(await queries.patchArticle(db, parameters(request).id!, input));
    });
    app.delete('/api/articles/:id', { config: { role: 'admin' } }, async (request) => {
        await queries.deleteArticle(db, parameters(request).id!);
        return { ok: true };
    });

    app.get('/api/schedule', { config: { public: true } }, async (request) => {
        const { season } = query(request);
        const rows = await queries.listSchedule(db, season);
        return rows.map(value => scheduleDto(value));
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
    }, async (request) => { const season = query(request).season; const rows = await queries.listTransfers(db, season); return rows.map(value => transferDto(value)); });
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
