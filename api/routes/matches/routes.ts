import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { submissionInput, approveSubmission, id, username } from '@napl/contracts';
import type { Dependencies } from '../../app.js';
import { params as parameters } from '../../plugins/request.js';
import { HttpError, actor, actorName, isAdmin } from '../../plugins/auth/identity.js';
import { type Row } from '../../plugins/db/client.js';
import { object, array } from '../../plugins/db/records.js';
import { submissionDto } from './dto.js';
import { listSubmissions, getSubmission, needSubmission, saveSubmission, updateSubmission, deleteSubmission, needMatchTeam, findPlayer, savePlayerMatches, saveResultNews, findMatchParticipants, deleteMatchFromAllPlayers, findPlayerMatch, findAccountsWithMatch, syncScheduledMatchScore } from './queries.js';
import { pathSegment, detailUrl, page, pageInput } from '../payload/page.js';
export function aggregate(matches: Row[]): Record<string, number> {
    const totals: Record<string, number> = {
        games: 0, wins: 0, draws: 0, losses: 0, goals: 0, assists: 0, passes: 0, tackles: 0, deflects: 0, catches: 0, cleanSheets: 0, motm: 0
    };
    for (const m of matches) {
        totals.games!++;
        for (const key of ['goals', 'assists', 'passes', 'tackles', 'deflects', 'catches'])
            totals[key]! += typeof m[key] === 'number' ? m[key] : 0;
        totals.cleanSheets! += m.cleanSheet ? 1 : 0;
        totals.motm! += m.motm ? 1 : 0;
        totals[m.result === 'W' ? 'wins' : (m.result === 'L' ? 'losses' : 'draws')]!++;
    }
    return totals;
}
const stat = z.number().nonnegative().max(100_000);
const importInput = z.strictObject({
    matchData: z.object({
        match_id: z.union([id, z.int().nonnegative()]), score: z.object({
            home: stat, away: stat
        }), stadium: z.string().max(500).optional(), match_length: stat.optional(), players: z.array(z.object({
            player_id: z.union([id, z.int().nonnegative()]), username: z.string().max(100), team: z.enum(['home', 'away']), stats: z.record(z.string(), z.number().nonnegative()).default({})
        })).max(30)
    }), playerMap: z.record(z.string(), z.union([username, z.literal('')])), tackleOverrides: z.record(z.string(), z.union([stat, z.string().regex(/^\d*$/)])), homeTeamId: id, awayTeamId: id, season: id
});
export function registerMatches(app: FastifyInstance, { db }: Dependencies): void {
    app.get('/api/submissions', async (request) => {
        await actorName(db, request);
        const rows = await listSubmissions(db, isAdmin(request) ? undefined : actor(request).id);
        return page(rows.map(row => ({ id: row.id, status: row.status, submittedBy: row.submitted_by,
            submittedAt: row.submitted_at?.getTime() ?? null, reviewedBy: row.reviewed_by, reviewedAt: row.reviewed_at?.getTime() ?? null,
            detailUrl: detailUrl(`/api/submissions/${pathSegment(row.id)}/detail`, submissionDto(row)),
        })), `submissions:${isAdmin(request) ? 'admin' : actor(request).id}`, pageInput(request));
    });
    app.post('/api/submissions', {
        config: {
            role: 'admin'
        }
    }, async (request) => {
        const input = submissionInput.parse(request.body), reviewer = await actorName(db, request);
        return db.transaction(async (tx) => {
            const old = await getSubmission(tx, input.id, true);
            if (old && old.status !== 'pending')
                throw new HttpError(409, 'already_reviewed');
            return submissionDto(await saveSubmission(tx, input.id, {
                match_info: input.matchInfo, player_stats: input.playerStats, edits: input.edits ?? [], status: 'pending', submitted_by: old?.submitted_by ?? reviewer, submitted_by_account_id: old?.submitted_by_account_id ?? actor(request).id
            }));
        });
    });
    app.patch('/api/submissions/:id', {
        config: {
            role: 'admin'
        }
    }, async (request) => {
        const input = approveSubmission.parse(request.body);
        return db.transaction(async (tx) => {
            const old = await needSubmission(tx, parameters(request).id!, true);
            request.resource = { type: 'submission', id: old.id };
            if (old.status !== 'pending')
                throw new HttpError(409, 'already_reviewed');
            return submissionDto(await updateSubmission(tx, old.id, {
                match_info: input.matchInfo, player_stats: input.playerStats, edits: input.edits ?? []
            }));
        });
    });
    app.delete('/api/submissions/:id', {
        config: {
            role: 'admin'
        }
    }, async (request) => {
        await db.transaction(async (tx) => {
            const row = await needSubmission(tx, parameters(request).id!, true);
            request.resource = { type: 'submission', id: row.id };
            if (row.status === 'approved')
                throw new HttpError(409, 'approved_submission');
            await deleteSubmission(tx, row.id);
        });
        return {
            ok: true
        };
    });
    app.post('/api/submissions/:id/reject', {
        config: {
            role: 'admin'
        }
    }, async (request) => {
        const { reason } = z.strictObject({
            reason: z.string().max(2000).default('')
        }).parse(request.body), reviewer = await actorName(db, request);
        return db.transaction(async (tx) => {
            const row = await needSubmission(tx, parameters(request).id!, true);
            request.resource = { type: 'submission', id: row.id };
            if (row.status !== 'pending')
                throw new HttpError(409, 'already_reviewed');
            return submissionDto(await updateSubmission(tx, row.id, {
                status: 'rejected', reviewed_by: reviewer, reviewed_by_account_id: actor(request).id, reviewed_at: new Date(), rejection_reason: reason
            }));
        });
    });
    app.post('/api/submissions/:id/approve', {
        config: {
            role: 'admin'
        }
    }, async (request) => {
        const input = approveSubmission.parse(request.body), reviewer = await actorName(db, request);
        return db.transaction(async (tx) => {
            const sub = await needSubmission(tx, parameters(request).id!, true);
            request.resource = { type: 'submission', id: sub.id };
            if (sub.status === 'approved')
                return submissionDto(sub);
            if (sub.status !== 'pending')
                throw new HttpError(409, 'already_reviewed');
            const info = input.matchInfo;
            if (info.homeTeamId === info.awayTeamId)
                throw new HttpError(400, 'same_team');
            const home = await needMatchTeam(tx, info.homeTeamId), away = await needMatchTeam(tx, info.awayTeamId);
            const seen = new Set<string>();
            for (const ps of input.playerStats) {
                const key = ps.username.toLowerCase();
                if (seen.has(key))
                    throw new HttpError(400, 'duplicate_player');
                seen.add(key);
                const player = await findPlayer(tx, key);
                if (!player)
                    throw new HttpError(409, 'player_missing');
                if (player.team_id !== home.id && player.team_id !== away.id)
                    throw new HttpError(409, 'player_team_mismatch');
                const isHome = player.team_id === home.id, my = isHome ? info.homeScore : info.awayScore, other = isHome ? info.awayScore : info.homeScore;
                const record = {
                    id: `m_${sub.id}_${player.id}`, date: info.date, season: info.season, opponent: isHome ? away.name : home.name, ownTeamId: player.team_id, opponentTeamId: isHome ? away.id : home.id, result: my > other ? 'W' : (my < other ? 'L' : 'D'), goalsFor: my, goalsAgainst: other, goals: ps.goals, assists: ps.assists, passes: ps.passes, tackles: ps.tackles, deflects: ps.deflects, catches: ps.catches, cleanSheet: ps.cleanSheet, motm: false
                };
                const matches = [...array(player.matches).map(value => object(value)), record];
                await savePlayerMatches(tx, player.id, {
                    matches, stats: aggregate(matches)
                });
            }
            await saveResultNews(tx, `n_result_${sub.id}`, {
                type: 'result', home_team_id: home.id, away_team_id: away.id, home_score: info.homeScore, away_score: info.awayScore, event_date: new Date(info.date), author: reviewer, auto_from_submission: sub.id
            });
            return submissionDto(await updateSubmission(tx, sub.id, {
                status: 'approved', reviewed_by: reviewer, reviewed_by_account_id: actor(request).id, reviewed_at: new Date(), match_info: info, player_stats: input.playerStats, edits: input.edits ?? []
            }));
        });
    });
    app.post('/api/match-imports', {
        config: {
            role: 'admin'
        }
    }, async (request) => {
        const input = importInput.parse(request.body);
        return db.transaction(async (tx) => {
            if (input.homeTeamId === input.awayTeamId)
                throw new HttpError(400, 'same_team');
            const home = await needMatchTeam(tx, input.homeTeamId), away = await needMatchTeam(tx, input.awayTeamId);
            let updated = 0, skipped = 0, alreadyImported = 0;
            const skippedIndexes: number[] = [];
            const mapped = new Set<string>();
            const md = input.matchData;
            for (const [index, p] of md.players.entries()) {
                const name = input.playerMap[String(p.player_id)];
                if (!name) {
                    skipped++;
                    skippedIndexes.push(index);
                    continue;
                }
                if (mapped.has(name.toLowerCase()))
                    throw new HttpError(400, 'duplicate_player_mapping');
                mapped.add(name.toLowerCase());
                const player = await findPlayer(tx, name.toLowerCase());
                if (!player)
                    throw new HttpError(409, 'mapped_player_missing');
                const matches = array(player.matches).map(value => object(value));
                if (matches.some(m => String(m.strikersMatchId) === String(md.match_id))) {
                    alreadyImported++;
                    continue;
                }
                const own = p.team === 'home' ? home : away, opponent = p.team === 'home' ? away : home, my = p.team === 'home' ? md.score.home : md.score.away, other = p.team === 'home' ? md.score.away : md.score.home, override = input.tackleOverrides[String(p.player_id)], s = p.stats;
                matches.push({
                    id: `sc_${md.match_id}_${p.player_id}`, strikersMatchId: md.match_id, date: Date.now(), season: input.season, opponent: opponent.name, opponentTeamId: opponent.id, ownTeamId: own.id, result: my > other ? 'W' : (my < other ? 'L' : 'D'), goalsFor: my, goalsAgainst: other, stadium: md.stadium ?? '', matchLength: md.match_length ?? 0, goals: s.goals ?? 0, assists: s.assists ?? 0, passes: s.passes ?? 0, tackles: override === undefined || override === '' ? (s.poke_tackles_won ?? 0) + (s.slide_tackles_won ?? 0) : Number(override), deflects: s.deflects ?? 0, catches: s.catches ?? 0, cleanSheet: other === 0, motm: false, source: 'strikers-club-import'
                });
                await savePlayerMatches(tx, player.id, {
                    matches, stats: aggregate(matches), ...(!player.strikers_id && {
                        strikers_id: String(p.player_id)
                    })
                });
                updated++;
            }
            return {
                ok: true, matchId: md.match_id, updated, skipped, alreadyImported, skippedIndexes, homeTeam: home.name, awayTeam: away.name, score: `${md.score.home} - ${md.score.away}`
            };
        });
    });
    // GET /api/matches/:id — return every player's stats for a specific match.
    // Public: match results are already visible on each player's own match log.
    app.get('/api/matches/:id', { config: { public: true } }, async (request) => {
        const matchId = parameters(request).id!;
        const participants = await findMatchParticipants(db, matchId);
        if (participants.length === 0) throw new HttpError(404, 'match_not_found');
        return { id: matchId, participants };
    });
    // DELETE /api/matches/:id — admin-only. Removes the match entry from every
    // account that recorded it, for admins who want to erase a mis-entered match.
    app.delete('/api/matches/:id', { config: { role: 'admin' } }, async (request) => {
        const matchId = parameters(request).id!;
        const removed = await deleteMatchFromAllPlayers(db, matchId);
        if (removed === 0) throw new HttpError(404, 'match_not_found');
        return { ok: true, removedFrom: removed };
    });
    // PATCH /api/matches/:id/players/:username — admin-only. Overwrites the
    // numeric stats for one player within a single recorded match. The rest
    // of the match entry (opponent, teammates, result, date) is preserved.
    // The player's aggregate stats are recomputed across all their matches
    // so season totals stay consistent with the edited numbers.
    const editableStats = z.strictObject({
        goals: stat.optional(), assists: stat.optional(), passes: stat.optional(),
        tackles: stat.optional(), deflects: stat.optional(), catches: stat.optional(),
        cleanSheet: z.boolean().optional(),
    });
    app.patch('/api/matches/:id/players/:username', { config: { role: 'admin' } }, async (request) => {
        const input = editableStats.parse(request.body);
        const { id: matchId, username: targetUsername } = parameters(request);
        return db.transaction(async (tx) => {
            const found = await findPlayerMatch(tx, matchId!, targetUsername!);
            if (!found) throw new HttpError(404, 'match_or_player_not_found');
            const currentMatches = found.account.matches as Row[];
            const existing = object(currentMatches[found.matchIndex]);
            const nextMatches = [...currentMatches];
            nextMatches[found.matchIndex] = { ...existing, ...input };
            await savePlayerMatches(tx, found.account.id, { matches: nextMatches, stats: aggregate(nextMatches) });
            request.resource = { type: 'account', id: found.account.id };
            return { ok: true };
        });
    });
    // PATCH /api/matches/:id/score — admin edits the match's final score. The
    // body says what each team scored, keyed by teamId. The server rewrites
    // every participant's goalsFor / goalsAgainst / result from their own
    // team's perspective, recomputes their aggregate stats, and if the match
    // is linked to a scheduled fixture syncs its home/away scores too.
    const scoreInput = z.strictObject({ scores: z.record(id, stat) });
    app.patch('/api/matches/:id/score', { config: { role: 'admin' } }, async (request) => {
        const input = scoreInput.parse(request.body);
        const matchId = parameters(request).id!;
        return db.transaction(async (tx) => {
            const accounts = await findAccountsWithMatch(tx, matchId);
            if (accounts.length === 0) throw new HttpError(404, 'match_not_found');
            let updated = 0;
            for (const account of accounts) {
                const currentMatches = array(account.matches).map(value => object(value));
                const matchIndex = currentMatches.findIndex(row => String(row.strikersMatchId) === matchId);
                if (matchIndex === -1) continue;
                const existing = currentMatches[matchIndex]!;
                const ownTeamId = String(existing.ownTeamId ?? ''), opponentTeamId = String(existing.opponentTeamId ?? '');
                const my = input.scores[ownTeamId], other = input.scores[opponentTeamId];
                // Both team IDs must appear in the scores map; otherwise we
                // can't tell which side of the match this player was on.
                if (typeof my !== 'number' || typeof other !== 'number') throw new HttpError(400, 'missing_team_score');
                const nextMatches = [...currentMatches];
                nextMatches[matchIndex] = { ...existing, goalsFor: my, goalsAgainst: other,
                    result: my > other ? 'W' : (my < other ? 'L' : 'D'), cleanSheet: other === 0 };
                await savePlayerMatches(tx, account.id, { matches: nextMatches, stats: aggregate(nextMatches) });
                updated++;
            }
            await syncScheduledMatchScore(tx, matchId, input.scores);
            return { ok: true, updatedPlayers: updated };
        });
    });
}
