import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { articleInput, newsInput, ruleInput, scheduleInput, transferInput, id } from '@napl/contracts';
import { MAX_SCHEDULE_MATCHES } from '@napl/contracts/league';
import type { Dependencies } from '../../app.js';
import { actorName } from '../../plugins/auth/identity.js';
import { params as parameters, query } from '../../plugins/request.js';
import { Prisma, type Database, type Row } from '../../plugins/db/client.js';
import { list, get, insert, patch, remove, toColumns } from '../../plugins/db/records.js';
import { listNews } from './queries.js';
import { newsDto, ruleDto, articleDto } from './dto.js';
import { scheduleDto } from '../matches/dto.js';
import { transferDto } from '../teams/dto.js';
export async function upsert(database: Database, table: string, key: string, fields: Row): Promise<Row> {
    return (await get(database, table, 'id', key, true)) ? patch(database, table, key, fields) : insert(database, table, {
        id: key, ...fields
    });
}
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
    const resources = [{
            path: 'news', table: 'news', schema: newsInput, patchSchema: newsInput.omit({
                id: true
            }).partial(), map: maps.news, format: newsDto
        }, {
            path: 'rules', table: 'rules_sections', schema: ruleInput, patchSchema: ruleInput.omit({
                id: true
            }).partial(), map: maps.rules, format: ruleDto
        }, {
            path: 'articles', table: 'articles', schema: articleInput, patchSchema: articleInput.omit({
                id: true
            }).partial(), map: maps.articles, format: articleDto
        }, {
            path: 'schedule', table: 'scheduled_matches', schema: scheduleInput, patchSchema: scheduleInput.omit({
                id: true
            }).partial(), map: maps.schedule, format: scheduleDto
        }];
    for (const resource of resources) {
        app.get(`/api/${resource.path}`, {
            config: {
                public: true
            }
        }, async (request) => {
            if (resource.path === 'news')
                return listNews(db);
            let rows = await list(db, resource.table);
            const { season } = query(request);
            if (season && resource.path === 'schedule')
                rows = rows.filter(r => r.season === season);
            if (resource.path === 'rules')
                rows.sort((a, b) => Number(a.sort_order) - Number(b.sort_order));
            return rows.map(value => resource.format(value));
        });
        app.post(`/api/${resource.path}`, {
            config: {
                role: 'admin'
            }
        }, async (request) => {
            const input = resource.schema.parse(request.body);
            const fields = toColumns(input, resource.map);
            if (resource.path === 'articles' || resource.path === 'news')
                fields.author = await actorName(db, request);
            if (resource.path !== 'news')
                fields.updated_at = new Date();
            return db.transaction(async (tx) => resource.format(await upsert(tx, resource.table, input.id, fields)));
        });
        app.patch(`/api/${resource.path}/:id`, {
            config: {
                role: 'admin'
            }
        }, async (request) => {
            const input = resource.patchSchema.parse(request.body);
            const fields = toColumns(input, resource.map);
            if (resource.path !== 'news')
                fields.updated_at = new Date();
            return resource.format(await patch(db, resource.table, parameters(request).id!, fields));
        });
        app.delete(`/api/${resource.path}/:id`, {
            config: {
                role: 'admin'
            }
        }, async (request) => {
            await remove(db, resource.table, parameters(request).id!);
            return {
                ok: true
            };
        });
    }
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
