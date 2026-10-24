import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { id, jsonObject } from '@napl/contracts';
import type { Dependencies } from '../../app.js';
import { params as parameters } from '../../plugins/request.js';
import { HttpError } from '../../plugins/auth/identity.js';
import type { Database, Prisma } from '../../plugins/db/client.js';
import { string, object } from '../../plugins/db/records.js';
import { getSetting, settingKey, readSetting, saveSetting, championshipTeam, lockChampionshipAccounts, saveChampionships } from './queries.js';
import { fieldPage, fieldValue } from '../payload/details.js';

const championsInput = z.record(z.string().min(1).max(160), z.strictObject({
    winnerTeamId: id.nullable(), runnerUpTeamId: id.nullable(), setAt: z.number()
}));

async function setChampions(database: Database, next: z.infer<typeof championsInput>): Promise<void> {
    await database.transaction(async (tx) => {
        const previous = await readSetting(tx, 'season_champions', true);
        const old = previous?.value ? object(JSON.parse(previous.value)) : {};
        const seasons = new Set([...Object.keys(old), ...Object.keys(next)]);
        const changed = [...seasons].filter(season => JSON.stringify(old[season]) !== JSON.stringify(next[season]));
        const awards = new Map<string, Prisma.InputJsonObject[]>();
        for (const season of changed) {
            const champions = next[season];
            if (!champions) continue;
            if (champions.winnerTeamId && champions.winnerTeamId === champions.runnerUpTeamId)
                throw new HttpError(400, 'same_champion_team');
            for (const [teamId, placement] of [[champions.winnerTeamId, 'winner'], [champions.runnerUpTeamId, 'runner_up']] as const) {
                if (!teamId) continue;
                await championshipTeam(tx, teamId);
                awards.set(teamId, [...(awards.get(teamId) ?? []), { season, placement, teamId, awardedAt: champions.setAt }]);
            }
        }
        const accounts = await lockChampionshipAccounts(tx);
        for (const account of accounts) {
            const previousAwards = Array.isArray(account.championships) ? account.championships.map(value =>
                typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {}) : [];
            const retained = previousAwards.filter(a => !changed.includes(string(a.season)));
            const granted = awards.get(string(account.team_id)) ?? [];
            if (retained.length !== previousAwards.length || granted.length > 0)
                await saveChampionships(tx, account.id, [...retained, ...granted]);
        }
        await saveSetting(tx, 'season_champions', JSON.stringify(next));
    });
}

export function registerSettings(app: FastifyInstance, { db }: Dependencies): void {
    app.get('/api/settings/:key', { config: { public: true } }, async (request, reply) => {
        const key = settingKey.parse(parameters(request).key);
        const value = await getSetting(db, key);
        // Fastify sends raw strings as text/plain by default, which breaks the
        // frontend's response.json() parser. Serialize current_season explicitly
        // so the body is a valid JSON string ("S1") with the correct type header.
        if (key === 'current_season') return reply.type('application/json').send(JSON.stringify(value));
        return fieldPage(value, `/api/settings/${key}`, request);
    });
    app.get('/api/settings/:key/fields/:field', { config: { public: true } }, async request => {
        const key = settingKey.parse(parameters(request).key);
        return fieldValue(await getSetting(db, key), parameters(request).field!, `setting:${key}`, request);
    });
    app.put('/api/settings/:key', { config: { role: 'admin' } }, async (request) => {
        const key = settingKey.parse(parameters(request).key);
        if (key === 'position_weights' && !request.userRoles.includes('super_admin'))
            throw new HttpError(403, 'super_admin_required');
        const { value } = z.strictObject({ value: z.json() }).parse(request.body);
        if (key === 'season_champions') {
            await setChampions(db, championsInput.parse(value));
        } else {
            const result = key === 'current_season' ? id.parse(value) : JSON.stringify(jsonObject.parse(value));
            await saveSetting(db, key, result);
        }
        return { ok: true };
    });
}
