import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { id, jsonObject } from '@napl/contracts';
import type { Dependencies } from '../../app.js';
import { params as parameters } from '../../plugins/request.js';
import { HttpError } from '../../plugins/auth/identity.js';
import { Prisma, type Database, type Row } from '../../plugins/db/client.js';
import { get, need, patch, string, object, array } from '../../plugins/db/records.js';
import { getSetting, settingKey } from './queries.js';
async function setChampions(database: Database, value: unknown): Promise<void> {
    const schema = z.record(z.string().min(1).max(160), z.object({
        winnerTeamId: id.nullable(), runnerUpTeamId: id.nullable(), setAt: z.number()
    }).strict());
    const next = schema.parse(value);
    await database.transaction(async (tx) => {
        const previous = await get(tx, 'settings', 'key', 'season_champions', true);
        const old = previous?.value ? object(JSON.parse(string(previous.value))) : {};
        const seasons = new Set([...Object.keys(old), ...Object.keys(next)]);
        const changed = [...seasons].filter(season => JSON.stringify(old[season]) !== JSON.stringify(next[season]));
        const awards = new Map<string, Row[]>();
        for (const season of changed) {
            const champions = next[season];
            if (!champions)
                continue;
            if (champions.winnerTeamId && champions.winnerTeamId === champions.runnerUpTeamId)
                throw new HttpError(400, 'same_champion_team');
            for (const [teamId, placement] of [[champions.winnerTeamId, 'winner'], [champions.runnerUpTeamId, 'runner_up']] as const) {
                if (!teamId)
                    continue;
                const team = await need(tx, 'teams', teamId);
                for (const member of array(team.members)) {
                    const key = string(member).toLowerCase();
                    awards.set(key, [...(awards.get(key) ?? []), {
                            season, placement, teamId, awardedAt: champions.setAt
                        }]);
                }
            }
        }
        const accounts = await tx.query(Prisma.sql `SELECT * FROM public.accounts FOR UPDATE`);
        for (const account of accounts) {
            const previousAwards = array(account.championships).map(value => object(value));
            const retained = previousAwards.filter(a => !changed.includes(string(a.season)));
            const granted = awards.get(string(account.username_lower)) ?? [];
            if (retained.length !== previousAwards.length || granted.length > 0)
                await patch(tx, 'accounts', string(account.id), {
                    championships: [...retained, ...granted]
                });
        }
        await tx.execute(Prisma.sql `INSERT INTO public.settings(key,value) VALUES('season_champions',${JSON.stringify(next)}) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value`);
    });
}
export function registerSettings(app: FastifyInstance, { db }: Dependencies): void {
    app.get('/api/settings/:key', {
        config: {
            public: true
        }
    }, async (request) => {
        const key = settingKey.parse(parameters(request).key);
        return getSetting(db, key);
    });
    app.put('/api/settings/:key', {
        config: {
            role: 'admin'
        }
    }, async (request) => {
        const key = settingKey.parse(parameters(request).key);
        if (key === 'position_weights' && !request.userRoles.includes('super_admin'))
            throw new HttpError(403, 'super_admin_required');
        const { value } = z.object({
            value: z.json()
        }).strict().parse(request.body);
        if (key === 'season_champions') {
            await setChampions(db, value);
            return {
                ok: true
            };
        }
        const result = key === 'current_season' ? id.parse(value) : JSON.stringify(jsonObject.parse(value));
        await db.execute(Prisma.sql `INSERT INTO public.settings(key,value) VALUES(${key},${result}) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value`);
        return {
            ok: true
        };
    });
}
