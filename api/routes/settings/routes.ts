import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { id, jsonObject } from '@napl/contracts';
import type { Dependencies } from '../../app.js';
import { params as parameters } from '../../plugins/request.js';
import { HttpError } from '../../plugins/auth/identity.js';
import type { Database, Prisma } from '../../plugins/db/client.js';
import { string, object, array } from '../../plugins/db/records.js';
import { getSetting, settingKey, readSetting, saveSetting, championshipTeam, lockChampionshipAccounts, saveChampionships } from './queries.js';

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
                const team = await championshipTeam(tx, teamId);
                for (const member of array(team.members)) {
                    const key = string(member).toLowerCase();
                    awards.set(key, [...(awards.get(key) ?? []), { season, placement, teamId, awardedAt: champions.setAt }]);
                }
            }
        }
        const accounts = await lockChampionshipAccounts(tx);
        for (const account of accounts) {
            const previousAwards = Array.isArray(account.championships) ? account.championships.map(value =>
                typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {}) : [];
            const retained = previousAwards.filter(a => !changed.includes(string(a.season)));
            const granted = awards.get(string(account.username_lower)) ?? [];
            if (retained.length !== previousAwards.length || granted.length > 0)
                await saveChampionships(tx, account.id, [...retained, ...granted]);
        }
        await saveSetting(tx, 'season_champions', JSON.stringify(next));
    });
}

export function registerSettings(app: FastifyInstance, { db }: Dependencies): void {
    app.get('/api/settings/:key', { config: { public: true } }, async (request) => {
        return getSetting(db, settingKey.parse(parameters(request).key));
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
