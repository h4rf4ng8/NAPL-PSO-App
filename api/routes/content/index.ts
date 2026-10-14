import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { articleInput, newsInput, ruleInput, scheduleInput, transferInput, id } from '@napl/contracts';
import { MAX_SCHEDULE_MATCHES } from '@napl/contracts/league';
import type { Dependencies } from '../../app.js';
import { actorName } from '../../plugins/auth/identity.js';
import { params as parameters, query } from '../../plugins/request.js';
import { Prisma } from '../../plugins/db/client.js';
import { list, get, insert, patch, remove, toColumns, upsert } from '../../plugins/db/records.js';
import { listNews } from './queries.js';
import { newsDto, ruleDto, articleDto } from './dto.js';
import { scheduleDto } from '../matches/dto.js';
import { transferDto } from '../teams/dto.js';
const maps = {
    news: {
        type: 'type', title: 'title', body: 'body', pinned: 'pinned', homeTeamId: 'home_team_id', awayTeamId: 'away_team_id', homeScore: 'home_score', awayScore: 'away_score', date: 'event_date', notes: 'notes', autoFromSubmission: 'auto_from_submission'
    },
    rules: {
        title: 'title', body: 'body', sortOrder: 'sort_order'
    },
    articles: {
        slug: 'slug', title: 'title', coverImageUrl: 'cover_image_url', body: 'body', excerpt: 'excerpt', publishedAt: 'published_at'
    },
    schedule: {
        season: 'season', week: 'week', homeTeamId: 'home_team_id', awayTeamId: 'away_team_id', scheduledDate: 'scheduled_date', streamUrl: 'stream_url', matchType: 'match_type', playoffRound: 'playoff_round', status: 'status', homeScore: 'home_score', awayScore: 'away_score', linkedMatchId: 'linked_match_id', notes: 'notes'
    },
    transfers: {
        season: 'season', playerUsername: 'player_username', fromTeamId: 'from_team_id', toTeamId: 'to_team_id', kind: 'kind', windowType: 'window_type'
    },
};
export function registerContent(app: FastifyInstance, { db, webhookUrl }: Dependencies): void {
    app.get('/api/news', { config: { public: true } }, async () => listNews(db));
    app.post('/api/news', { config: { role: 'admin' } }, async (request) => {
        const input = newsInput.parse(request.body);
        const fields = toColumns(input, maps.news);
        fields.author = await actorName(db, request);
        return db.transaction(async (tx) => newsDto(await upsert(tx, 'news', input.id, fields)));
    });
    app.patch('/api/news/:id', { config: { role: 'admin' } }, async (request) => {
        const input = newsInput.omit({ id: true }).partial().parse(request.body);
        return newsDto(await patch(db, 'news', parameters(request).id!, toColumns(input, maps.news)));
    });
    app.delete('/api/news/:id', { config: { role: 'admin' } }, async (request) => {
        await remove(db, 'news', parameters(request).id!);
        return { ok: true };
    });

    app.get('/api/rules', { config: { public: true } }, async (request) => {
        const rows = await list(db, 'rules_sections');
        query(request);
        rows.sort((a, b) => Number(a.sort_order) - Number(b.sort_order));
        return rows.map(value => ruleDto(value));
    });
    app.post('/api/rules', { config: { role: 'admin' } }, async (request) => {
        const input = ruleInput.parse(request.body);
        const fields = toColumns(input, maps.rules);
        fields.updated_at = new Date();
        return db.transaction(async (tx) => ruleDto(await upsert(tx, 'rules_sections', input.id, fields)));
    });
    app.patch('/api/rules/:id', { config: { role: 'admin' } }, async (request) => {
        const input = ruleInput.omit({ id: true }).partial().parse(request.body);
        const fields = toColumns(input, maps.rules);
        fields.updated_at = new Date();
        return ruleDto(await patch(db, 'rules_sections', parameters(request).id!, fields));
    });
    app.delete('/api/rules/:id', { config: { role: 'admin' } }, async (request) => {
        await remove(db, 'rules_sections', parameters(request).id!);
        return { ok: true };
    });

    app.get('/api/articles', { config: { public: true } }, async (request) => {
        const rows = await list(db, 'articles');
        query(request);
        return rows.map(value => articleDto(value));
    });
    app.post('/api/articles', { config: { role: 'admin' } }, async (request) => {
        const input = articleInput.parse(request.body);
        const fields = toColumns(input, maps.articles);
        fields.author = await actorName(db, request);
        fields.updated_at = new Date();
        return db.transaction(async (tx) => articleDto(await upsert(tx, 'articles', input.id, fields)));
    });
    app.patch('/api/articles/:id', { config: { role: 'admin' } }, async (request) => {
        const input = articleInput.omit({ id: true }).partial().parse(request.body);
        const fields = toColumns(input, maps.articles);
        fields.updated_at = new Date();
        return articleDto(await patch(db, 'articles', parameters(request).id!, fields));
    });
    app.delete('/api/articles/:id', { config: { role: 'admin' } }, async (request) => {
        await remove(db, 'articles', parameters(request).id!);
        return { ok: true };
    });

    app.get('/api/schedule', { config: { public: true } }, async (request) => {
        let rows = await list(db, 'scheduled_matches');
        const { season } = query(request);
        if (season) rows = rows.filter(row => row.season === season);
        return rows.map(value => scheduleDto(value));
    });
    app.post('/api/schedule', { config: { role: 'admin' } }, async (request) => {
        const input = scheduleInput.parse(request.body);
        const fields = toColumns(input, maps.schedule);
        fields.updated_at = new Date();
        return db.transaction(async (tx) => scheduleDto(await upsert(tx, 'scheduled_matches', input.id, fields)));
    });
    app.patch('/api/schedule/:id', { config: { role: 'admin' } }, async (request) => {
        const input = scheduleInput.omit({ id: true }).partial().parse(request.body);
        const fields = toColumns(input, maps.schedule);
        fields.updated_at = new Date();
        return scheduleDto(await patch(db, 'scheduled_matches', parameters(request).id!, fields));
    });
    app.delete('/api/schedule/:id', { config: { role: 'admin' } }, async (request) => {
        await remove(db, 'scheduled_matches', parameters(request).id!);
        return { ok: true };
    });
    app.get('/api/articles/slug/:slug', {
        config: {
            public: true
        }
    }, async (request) => {
        const row = await get(db, 'articles', 'slug', parameters(request).slug!);
        return row ? articleDto(row) : null;
    });
    app.put('/api/rules/order', {
        config: {
            role: 'admin'
        }
    }, async (request) => {
        const { ids } = z.object({
            ids: z.array(id).max(1000)
        }).strict().parse(request.body);
        await db.transaction(async (tx) => {
            for (const [index, key] of ids.entries())
                await patch(tx, 'rules_sections', key, {
                    sort_order: index, updated_at: new Date()
                });
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
        const { matches } = z.object({
            matches: z.array(scheduleInput).max(MAX_SCHEDULE_MATCHES)
        }).strict().parse(request.body);
        return db.transaction(async (tx) => {
            const rows = [];
            for (const m of matches)
                rows.push(scheduleDto(await upsert(tx, 'scheduled_matches', m.id, toColumns(m, maps.schedule))));
            return rows;
        });
    });
    app.put('/api/schedule/season/:season', {
        config: {
            role: 'admin'
        }
    }, async (request) => {
        const season = id.trim().min(1).parse(parameters(request).season);
        const { matches } = z.object({
            matches: z.array(scheduleInput.omit({ season: true })).min(1).max(MAX_SCHEDULE_MATCHES)
        }).strict().parse(request.body);
        return db.transaction(async (tx) => {
            await tx.execute(Prisma.sql `DELETE FROM public.scheduled_matches WHERE season=${season}`);
            const rows = [];
            for (const match of matches)
                rows.push(scheduleDto(await insert(tx, 'scheduled_matches', {
                    id: match.id, ...toColumns({ ...match, season }, maps.schedule)
                })));
            return rows;
        });
    });
    app.delete('/api/schedule/season/:season', {
        config: {
            role: 'admin'
        }
    }, async (request) => {
        await db.execute(Prisma.sql `DELETE FROM public.scheduled_matches WHERE season=${parameters(request).season}`);
        return {
            ok: true
        };
    });
    app.get('/api/transfers', {
        config: {
            public: true
        }
    }, async (request) => { const season = query(request).season; const rows = await list(db, 'transfers', season ? {column:'season',value:season} : undefined); return rows.map(value => transferDto(value)); });
    app.post('/api/transfers', {
        config: {
            role: 'admin'
        }
    }, async (request) => {
        const input = transferInput.parse(request.body);
        const name = await actorName(db, request);
        return db.transaction(async (tx) => transferDto(await upsert(tx, 'transfers', input.id ?? crypto.randomUUID(), {
            ...toColumns(input, maps.transfers), created_by: name
        })));
    });
    app.patch('/api/transfers/:id', {
        config: {
            role: 'admin'
        }
    }, async (request) => {
        const input = z.object({
            windowType: z.enum(['league', 'cross_league']).nullable()
        }).strict().parse(request.body);
        return transferDto(await patch(db, 'transfers', parameters(request).id!, {
            window_type: input.windowType
        }));
    });
    app.delete('/api/transfers/:id', {
        config: {
            role: 'admin'
        }
    }, async (request) => {
        await remove(db, 'transfers', parameters(request).id!);
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
