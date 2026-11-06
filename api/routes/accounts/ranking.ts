import { z } from 'zod';
import { POS, POSITIONS } from '@napl/contracts/league';
import { accountStatsSchema, type AccountCardStatSeason, type AccountRanking, type AccountStats } from '@napl/contracts/accounts';
import { HttpError } from '../../plugins/auth/identity.js';
import type { Row } from '../../plugins/db/client.js';

export const DEFAULT_POSITION_WEIGHTS: Record<string, Record<string, number>> = {
  [POS.ST]: { goalsPerGame: 0.55, assistsPerGame: 0.2, passesPerGame: 0.1, tacklesPerGame: 0.15 },
  [POS.WG]: { assistsPerGame: 0.35, goalsPerGame: 0.3, passesPerGame: 0.2, tacklesPerGame: 0.15 },
  [POS.CM]: { assistsPerGame: 0.35, passesPerGame: 0.3, goalsPerGame: 0.15, tacklesPerGame: 0.2 },
  [POS.DEF]: { tacklesPerGame: 0.4, cleanSheetPct: 0.2, passesPerGame: 0.15, assistsPerGame: 0.15, goalsPerGame: 0.1 },
  [POS.GK]: { deflectsPerGame: 0.35, cleanSheetPct: 0.35, catchesPerGame: 0.3 },
  [POS.FLEX]: { goalsPerGame: 0.25, assistsPerGame: 0.25, tacklesPerGame: 0.25, passesPerGame: 0.25 },
};

const weightsSchema = z.record(z.string(), z.record(z.string(), z.number()));
const emptyStats: AccountStats = accountStatsSchema.parse(
  Object.fromEntries(Object.keys(accountStatsSchema.shape).map(key => [key, 0])),
);
const partialStatsSchema = accountStatsSchema.partial();
const partialSeasonStatsSchema = z.record(z.string(), partialStatsSchema);
const parsedStats = (value: unknown): AccountStats => accountStatsSchema.parse({ ...emptyStats, ...partialStatsSchema.parse(value ?? {}) });
const parsedSeasonStats = (value: unknown): Record<string, AccountStats> => Object.fromEntries(
  Object.entries(partialSeasonStatsSchema.parse(value ?? {})).map(([season, stats]) => [season, parsedStats(stats)]),
);

function statValues(stats: AccountStats): Record<string, number> {
  const games = Math.max(stats.games, 1);
  return {
    goalsPerGame: stats.goals / games,
    assistsPerGame: stats.assists / games,
    tacklesPerGame: stats.tackles / games,
    passesPerGame: stats.passes / games,
    deflectsPerGame: stats.deflects / games,
    catchesPerGame: stats.catches / games,
    cleanSheetPct: stats.cleanSheets / games,
  };
}

// Each stat's benchmark is the league-wide maximum per-game value for that
// stat. A player's contribution to that stat = (their value / benchmark) *
// weight, capped at the weight itself. This makes OVR strictly monotonic in
// absolute stats within a position — more of a weighted stat always means
// more OVR — while still being comparable across positions, since every
// stat is scored on the same 0-100%-of-league-leader scale.
const STAT_KEYS = ['goalsPerGame', 'assistsPerGame', 'tacklesPerGame', 'passesPerGame', 'deflectsPerGame', 'catchesPerGame', 'cleanSheetPct'] as const;
type StatKey = typeof STAT_KEYS[number];

function leagueBenchmarks(accounts: Row[]): Record<StatKey, number> {
  const parsed = accounts.map(account => parsedStats(account.stats));
  const perGame = parsed.filter(stats => stats.games >= 1).map(stats => statValues(stats));
  const bench = {} as Record<StatKey, number>;
  for (const key of STAT_KEYS) {
    let max = 0;
    for (const row of perGame) if (row[key] > max) max = row[key];
    // Floor at a tiny positive number so (value / bench) stays finite when
    // no one has recorded that stat yet. OVR will just be 0 for everyone
    // on that component rather than NaN.
    bench[key] = max > 0 ? max : 1;
  }
  return bench;
}

export function calculateRankings(accounts: Row[], customWeights: unknown): Map<string, AccountRanking> {
  const parsed = customWeights == null ? null : weightsSchema.safeParse(customWeights);
  if (parsed && !parsed.success) throw new HttpError(503, 'invalid_position_weights');
  const weightsByPos: Record<string, Record<string, number>> = parsed?.data ?? DEFAULT_POSITION_WEIGHTS;
  const result = new Map<string, AccountRanking>();
  const benchmarks = leagueBenchmarks(accounts);
  for (const position of POSITIONS) {
    const players = accounts.filter(account => account.position === position);
    const weights = weightsByPos[position] ?? DEFAULT_POSITION_WEIGHTS[position];
    const statsByPlayer = new Map(players.map(account => [account, parsedStats(account.stats)]));
    const scored: Array<{ username: string; score: number; percentile: number; games: number }> = [];
    for (const account of players) {
      const username = String(account.username ?? '').toLowerCase();
      const stats = statsByPlayer.get(account)!;
      const games = stats.games;
      if (games < 1) {
        result.set(username, { score: 0, percentile: 0, ranked: false, gamesPlayed: games, tier: 'BRONZE' });
        continue;
      }
      const playerValues = statValues(stats);
      let rawScore = 0;
      for (const [key, weight] of Object.entries(weights)) {
        const benchmark = benchmarks[key as StatKey] ?? 1;
        // Capped at weight: having 2x the league leader (impossible normally
        // but possible transiently) does not grant OVR beyond the full weight.
        rawScore += Math.min(1, (playerValues[key] ?? 0) / benchmark) * weight;
      }
      // Games-played confidence: a 1-game sub still gets most of their
      // deserved credit but can't quite top a proven 3+ game player.
      // 1 game = 70%, 2 games = 85%, 3+ games = 100%.
      const confidence = Math.min(1, 0.55 + games * 0.15);
      rawScore *= confidence;
      scored.push({ username, score: rawScore, percentile: rawScore, games });
    }
    // Per-position normalization: the strongest raw score at this position
    // anchors to OVR 100. Everyone else scales down from there, keeping
    // within-position comparisons strictly monotonic (more weighted stats =
    // more OVR) while ensuring top players actually reach the 90s and 100s
    // instead of plateauing in the 80s because nobody leads in every stat.
    scored.sort((left, right) => right.score - left.score);
    const topRaw = scored.length > 0 ? scored[0]!.score : 0;
    for (const player of scored) {
      if (topRaw <= 0) {
        // Degenerate case: nobody has any positive weighted contribution
        // (empty league, or every weight is <=0). Fall back to a flat
        // midpoint OVR instead of dividing by a tiny or negative number.
        player.score = 50;
      } else {
        player.score = Math.max(0, Math.min(100, Math.round(50 + 45 * (player.score / topRaw))));
      }
    }
    const count = scored.length;
    const diamond = Math.max(1, Math.ceil(count * 0.1));
    const gold = count > 1 ? Math.max(1, Math.ceil(count * 0.2)) : 0;
    const silver = count > 2 ? Math.max(1, Math.ceil(count * 0.3)) : 0;
    for (const [index, player] of scored.entries()) {
      let tier: AccountRanking['tier'];
      if (index < diamond) tier = 'DIAMOND';
      else if (index < diamond + gold) tier = 'GOLD';
      else if (index < diamond + gold + silver) tier = 'SILVER';
      else tier = 'BRONZE';
      result.set(player.username, { score: player.score, percentile: player.percentile, ranked: true, gamesPlayed: player.games, tier });
    }
  }
  return result;
}

export function calculateCardStats(account: Row): AccountCardStatSeason[] {
  const seasons = parsedSeasonStats(account.seasonStats);
  const allStats = parsedStats(account.stats);
  const seasonRows: Array<[string | null, AccountStats | undefined]> = [
    ...Object.entries(seasons).filter(([season]) => season !== 'all'), ['all', allStats], [null, emptyStats],
  ];
  return seasonRows.map(([season, raw]) => {
    const stats = raw ?? emptyStats;
    const games = stats.games;
    const perGame = (value: number) => (value / Math.max(games, 1)).toFixed(1);
    const suffix = games > 0 ? '/G' : '';
    const goalkeeper = account.position === POS.GK;
    const fourthCell = goalkeeper
      ? { label: `CAT${suffix}`, value: perGame(stats.catches) }
      : { label: 'W-L', value: `${stats.wins}-${stats.losses}` };
    return {
      season,
      cells: [
        { label: 'GOALS', value: String(stats.goals) },
        { label: goalkeeper ? `DFL${suffix}` : `TKL${suffix}`, value: perGame(goalkeeper ? stats.deflects : stats.tackles) },
        { label: 'ASSIST', value: String(stats.assists) },
        fourthCell,
        { label: `PASS${suffix}`, value: perGame(stats.passes) },
        { label: goalkeeper ? 'CS' : 'GP', value: String(goalkeeper ? stats.cleanSheets : games) },
      ],
    };
  });
}

export function enrichAccounts(accounts: Row[], weights: unknown): Row[] {
  const rankings = calculateRankings(accounts, weights);
  return accounts.map(account => ({
    ...account,
    ranking: rankings.get(String(account.username ?? '').toLowerCase()) ?? {
      score: 0, percentile: 0, ranked: false, gamesPlayed: parsedStats(account.stats).games, tier: 'BRONZE',
    },
    cardStats: calculateCardStats(account),
  }));
}
