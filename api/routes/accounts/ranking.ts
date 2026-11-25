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

// Stat values compared against the league leader. We use season TOTALS
// (not per-game rates), so volume matters: a player with 14 goals is at
// 14/22 of a 22-goal leader for the goals weight. Keys keep their old
// "PerGame" / "Pct" names to stay compatible with the stored position
// weights setting — only the numerator changed.
function statValues(stats: AccountStats): Record<string, number> {
  return {
    goalsPerGame: stats.goals,
    assistsPerGame: stats.assists,
    tacklesPerGame: stats.tackles,
    passesPerGame: stats.passes,
    deflectsPerGame: stats.deflects,
    catchesPerGame: stats.catches,
    cleanSheetPct: stats.cleanSheets,
  };
}

// Each stat's benchmark is the league-wide maximum TOTAL for that stat (e.g.
// most goals scored by any player at that position), scaled down so hitting
// 90% of the league leader = full credit. Using totals means volume counts:
// a 22-goal leader sets the bar; a 14-goal player at the same position gets
// 14 / (0.9 × 22) ≈ 70.7% of the goals weight. Contribution for each stat =
// min(1, player_total / (0.9 × leader_total)) × weight. The games cap below
// still prevents tiny sample sizes from going out of range.
const FULL_CREDIT_SHARE = 0.9;
const STAT_KEYS = ['goalsPerGame', 'assistsPerGame', 'tacklesPerGame', 'passesPerGame', 'deflectsPerGame', 'catchesPerGame', 'cleanSheetPct'] as const;
type StatKey = typeof STAT_KEYS[number];

function leagueBenchmarks(accounts: Row[]): Record<StatKey, number> {
  const parsed = accounts.map(account => parsedStats(account.stats));
  const values = parsed.filter(stats => stats.games >= 1).map(stats => statValues(stats));
  const bench = {} as Record<StatKey, number>;
  for (const key of STAT_KEYS) {
    let max = 0;
    for (const row of values) if (row[key] > max) max = row[key];
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
        const benchmark = (benchmarks[key as StatKey] ?? 1) * FULL_CREDIT_SHARE;
        // Capped at weight: once you clear 90% of the league leader for a
        // stat you get the full weight; going higher doesn't exceed it.
        rawScore += Math.min(1, (playerValues[key] ?? 0) / benchmark) * weight;
      }
      scored.push({ username, score: rawScore, percentile: rawScore, games });
    }
    // OVR = raw weighted score × 100, with a hard ceiling that lifts as the
    // player plays more games: 1 game caps at 50, 2 at 70, 3 at 90, 4+ at
    // 100. A sub can still get a card, but reaching the top of the league
    // takes a real sample size. Each stat contribution is already capped at
    // its weight (above), weights per position sum to 1, so rawScore is in
    // [0, 1] and OVR naturally lands in [0, 100] before the games cap.
    scored.sort((left, right) => right.score - left.score);
    for (const player of scored) {
      const gamesCap = [0, 50, 70, 90, 100][Math.min(4, player.games)] ?? 100;
      player.score = Math.max(0, Math.min(gamesCap, Math.round(player.score * 100)));
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
