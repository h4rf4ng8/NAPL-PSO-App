import type { Account,Attributes,Ranking,Rankings,Stats,Weightings } from '../api/models';
import { POS, POSITIONS } from '@napl/contracts/league';

// Returns array of awards a player has won. Each award = {awardId, season, assignedBy, assignedAt}
export const getPlayerAwards = (account: Account) => account?.awards || [];

export const hasAnyAward = (account: Account) => (account?.awards?.length || 0) > 0;

export const emptyStats = () => ({
  games: 0, goals: 0, assists: 0, tackles: 0,
  passes: 0, cleanSheets: 0, deflects: 0, catches: 0,
  motm: 0, wins: 0, losses: 0, draws: 0,
});

export const getStatsForSeason = (account: Account, season: string) => {
  if (season === 'all') return account.stats || emptyStats();
  if (account.seasonStats) return account.seasonStats[season] || emptyStats();
  const matches = (account.matches || []).filter(m => (m.season || 'S1') === season);
  if (matches.length === 0) return emptyStats();
  const s = emptyStats();
  let totalPasses = 0;
  for (const m of matches) {
    s.games += 1;
    s.goals += m.goals || 0;
    s.assists += m.assists || 0;
    s.tackles += m.tackles || 0;
    s.deflects += m.deflects || 0;
    s.catches += m.catches || 0;
    if (m.cleanSheet) s.cleanSheets += 1;
    if (m.motm) s.motm += 1;
    if (m.result === 'W') s.wins += 1;
    else if (m.result === 'L') s.losses += 1;
    else s.draws += 1;
    totalPasses += m.passes || 0;
  }
  s.passes = Math.round(totalPasses / s.games);
  return s;
};

export const calcAttributes = (stats: Stats, position: string) => {
  const games = Math.max(stats.games || 0, 1);
  const goals = stats.goals || 0;
  const assists = stats.assists || 0;
  const tackles = stats.tackles || 0;
  const passes = stats.passes || 0;
  const cleanSheets = stats.cleanSheets || 0;
  const deflects = stats.deflects || 0;
  const catches = stats.catches || 0;
  const motm = stats.motm || 0;

  const clamp = (n: number) => Math.min(99, Math.max(40, Math.round(n)));

  // Rewritten to use only Strikers-Club-tracked stats. Numeric weights are
  // starting values — super admins can dial them via ADMIN → WEIGHTINGS.
  const pace = clamp(55 + (assists / games) * 12 + (motm / games) * 10 + ((position === POS.ST || position === POS.DEF) ? 8 : 0));
  const shooting = clamp(50 + (goals / games) * 25 + (position === POS.ST ? 12 : 0));
  const passing = clamp(50 + (assists / games) * 15 + Math.min(passes / games, 50) * 0.5 + (position === POS.CM ? 10 : 0));
  const dribbling = clamp(55 + ((goals + assists) / games) * 10 + (motm / games) * 8 + ((position === POS.ST || position === POS.CM) ? 8 : 0));
  const defending = clamp(45 + (tackles / games) * 10 + (cleanSheets / games) * 20 + (position === POS.DEF ? 14 : 0));
  const physical = clamp(60 + (tackles / games) * 5 + (motm / games) * 8 + ((position === POS.DEF || position === POS.ST) ? 6 : 0));

  if (position === POS.GK) {
    const gkRating = clamp(55 + (cleanSheets / games) * 25 + (deflects / games) * 4 + (catches / games) * 3 + (motm / games) * 10);
    return {
      pace: clamp(50 + (deflects / games) * 2),
      shooting: clamp(40 + (cleanSheets / games) * 10),
      passing: clamp(50 + Math.min(passes / games, 40) * 0.5),
      dribbling: clamp(45 + (deflects / games) * 1.5),
      defending: gkRating,
      physical: clamp(60 + (deflects / games) * 3 + (catches / games) * 2),
    };
  }
  return { pace, shooting, passing, dribbling, defending, physical };
};

export const calcOverall = (attrs: Attributes, position: string) => {
  // Legacy single-player formula — kept as fallback for previews/demos
  // where a full player pool isn't available. Real ranking happens in calcRankings().
  const w: Record<string,Attributes> = {
    [POS.ST]: { shooting: 0.35, pace: 0.2, dribbling: 0.2, physical: 0.15, passing: 0.05, defending: 0.05 },
    [POS.CM]: { passing: 0.3, dribbling: 0.2, physical: 0.15, defending: 0.15, shooting: 0.15, pace: 0.05 },
    [POS.DEF]: { defending: 0.4, physical: 0.25, pace: 0.15, passing: 0.12, dribbling: 0.04, shooting: 0.04 },
    [POS.GK]: { defending: 0.5, physical: 0.2, passing: 0.15, pace: 0.05, dribbling: 0.05, shooting: 0.05 },
  };
  const weights = w[position] || w.CM;
  let total = 0;
  for (const k in weights) total += attrs[k] * weights[k];
  return Math.round(total);
};

// ============ POSITION-RELATIVE RANKING SYSTEM ============
// Each player's tier is determined by how their per-game stats rank against
// other players AT THE SAME POSITION. Different stats matter for different positions.

// Threshold is set to 1 so a player gets ranked as soon as they have any
// imported match. Set to 0 to rank everyone (including 0-game accounts,
// which will all share the ~52 baseline). Set higher to require a sample.
export const MIN_GAMES_FOR_RANKING = 1;

// Per-position stat weights (must sum to 1.0 each). These are the DEFAULTS —
// super admins can override them via ADMIN → WEIGHTINGS, stored in the DB.
// Only Strikers-Club-tracked stats — no shot%, interceptions, or pass accuracy.
export const DEFAULT_POSITION_WEIGHTS: Weightings = {
  [POS.ST]: { goalsPerGame: 0.55, assistsPerGame: 0.2, passesPerGame: 0.1, tacklesPerGame: 0.15 },
  // Wingers: attack-minded wide players who create and finish. Assist-heavy
  // (set up goals from the flanks) with meaningful goal share.
  [POS.WG]: { assistsPerGame: 0.35, goalsPerGame: 0.3, passesPerGame: 0.2, tacklesPerGame: 0.15 },
  [POS.CM]: { assistsPerGame: 0.35, passesPerGame: 0.3, goalsPerGame: 0.15, tacklesPerGame: 0.2 },
  // Defenders now get credit for clean sheets — if the team shut the other
  // side out, the back line earned it. Rebalanced so tackles still dominate
  // but shutouts carry real weight.
  [POS.DEF]: { tacklesPerGame: 0.4, cleanSheetPct: 0.2, passesPerGame: 0.15, assistsPerGame: 0.15, goalsPerGame: 0.1 },
  [POS.GK]: { deflectsPerGame: 0.35, cleanSheetPct: 0.35, catchesPerGame: 0.3 },
  // FLEX: true even split (25% × 4) for players who play multiple roles
  [POS.FLEX]: { goalsPerGame: 0.25, assistsPerGame: 0.25, tacklesPerGame: 0.25, passesPerGame: 0.25 },
};

// Human-readable labels for each stat key (used in the weightings editor UI)
export const STAT_KEY_LABELS: Record<string,string> = {
  goalsPerGame: 'Goals',
  assistsPerGame: 'Assists',
  tacklesPerGame: 'Tackles',
  passesPerGame: 'Passes',
  deflectsPerGame: 'Deflects',
  catchesPerGame: 'Catches',
  cleanSheetPct: 'Clean Sheets',
};

// Extract per-game stat values from a player's account
export const playerStatValues = (account: Account): Record<string,number> => {
  const s = account.stats || {};
  const g = Math.max(s.games || 0, 1);
  return {
    goalsPerGame:        (s.goals || 0) / g,
    assistsPerGame:      (s.assists || 0) / g,
    tacklesPerGame:      (s.tackles || 0) / g,
    passesPerGame:       (s.passes || 0) / g,
    deflectsPerGame:        (s.deflects || 0) / g,
    catchesPerGame:      (s.catches || 0) / g,
    cleanSheetPct:       (s.cleanSheets || 0) / g,
  };
};

// Given an array of values, return a function that maps a value to its percentile (0-1)
// Percentile = fraction of players strictly below this value + half of equal players
export const makePercentileFn = (values: number[]) => {
  // Sort a copy while supporting the ES2022 browser baseline.
  // eslint-disable-next-line unicorn/no-array-sort
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return () => 0.5;
  return (v:number) => {
    let below = 0, equal = 0;
    for (const x of sorted) {
      if (x < v) below++;
      else if (x === v) equal++;
      else break;
    }
    return (below + equal / 2) / n;
  };
};

// Main ranking function: given all players, compute each player's tier-score (0-100)
// Returns a Map keyed by username (lowercase) → { score, percentile, ranked, gamesPlayed }
export const calcRankings = (allPlayers: Account[], customWeights: Weightings | null = null) => {
  const result = new Map<string,Ranking>();
  // Use custom weights if provided, else the defaults
  const weightsByPos = customWeights || DEFAULT_POSITION_WEIGHTS;
  // Group players by position. FLEX gets its own pool with its own weights
  // so FLEX players don't go unranked.
  const byPos: Record<string,Account[]> = Object.fromEntries(POSITIONS.map(position => [position, []]));
  for (const p of allPlayers) {
    byPos[p.position]?.push(p);
  }

  for (const [pos, players] of Object.entries(byPos)) {
    const weights = weightsByPos[pos] || DEFAULT_POSITION_WEIGHTS[pos];
    if (!weights) continue;

    // Only "ranked" players (≥ minimum games) count toward the percentile pool
    const eligible = players.filter(p => (p.stats?.games || 0) >= MIN_GAMES_FOR_RANKING);

    // Build per-stat percentile lookup functions, using only the eligible pool
    const pctFns: Record<string,(value:number)=>number> = {};
    for (const statKey of Object.keys(weights)) {
      const values = eligible.map(p => playerStatValues(p)[statKey]);
      pctFns[statKey] = makePercentileFn(values);
    }

    // Score every player (eligible OR not — unranked players get entry with ranked:false)
    const scored = []; // { username, overall, percentile, games } — ranked only, for rank calc below
    for (const p of players) {
      const games = p.stats?.games || 0;
      if (games < MIN_GAMES_FOR_RANKING) {
        result.set(p.username.toLowerCase(), { score: 0, percentile: 0, ranked: false, gamesPlayed: games, tier: 'BRONZE' });
        continue;
      }
      const vals = playerStatValues(p);
      let score = 0;
      for (const [statKey, weight] of Object.entries(weights)) {
        score += pctFns[statKey](vals[statKey]) * weight;
      }
      // Rescale to a 50-100 OVR curve so numbers feel FIFA-like. A player
      // scoring 0.50 (average weighted percentile) → OVR 75 (competent).
      // A player scoring 0.75 (strong) → OVR 87 (star). Perfect 1.00 → 100.
      // Nothing drops below 50 (anyone with ANY activity is at least a baseline).
      // Tiers are rank-based so the overall tier distribution is unchanged.
      const overall = Math.round(50 + score * 50);
      scored.push({ username: p.username.toLowerCase(), overall, percentile: score, games });
    }
    // Rank-based tier assignment within this position pool using ceiling
    // buckets, so even with a tiny pool (1-3 players) the top ranked player
    // always gets Diamond. For large pools this still approximates
    // 10% Diamond / 20% Gold / 30% Silver / 40% Bronze.
    scored.sort((a, b) => b.overall - a.overall);
    const n = scored.length;
    // Count per tier — minimum 1 Diamond, 1 Gold, 1 Silver when the pool
    // is big enough. Bronze catches the remainder (can be 0).
    const nDiamond = Math.max(1, Math.ceil(n * 0.1));
    const nGold    = n > 1 ? Math.max(1, Math.ceil(n * 0.2)) : 0;
    const nSilver  = n > 2 ? Math.max(1, Math.ceil(n * 0.3)) : 0;
    for (const [idx, s] of scored.entries()) {
      let tier;
      if (idx < nDiamond) tier = 'DIAMOND';
      else if (idx < nDiamond + nGold) tier = 'GOLD';
      else if (idx < nDiamond + nGold + nSilver) tier = 'SILVER';
      else tier = 'BRONZE';
      result.set(s.username, {
        score: s.overall, percentile: s.percentile, ranked: true,
        gamesPlayed: s.games, tier,
      });
    }
  }
  return result;
};

// Tiers are percentile-based against the pool of players who have actually
// played at least one match (MIN_GAMES_FOR_RANKING). The pool grows naturally
// as more players join — early on, with say 10 players, "top 10%" is 1
// Diamond; later with 40 players it's 4 Diamonds. Position pools are separate
// so a GK ranks against GKs, a ST against STs.
//   Diamond = top 10%
//   Gold    = next 20%
//   Silver  = next 30%
//   Bronze  = bottom 40%
export const tierFromPercentile = (percentile: number) => {
  if (percentile >= 0.9) return 'DIAMOND';
  if (percentile >= 0.7) return 'GOLD';
  return percentile >= 0.4 ? 'SILVER' : 'BRONZE';
};

// Convenience: look up tier for an account using its stored ranking entry.
// The tier is computed once in calcRankings based on the player's rank
// within their position pool (so the top player is always Diamond, the next
// ~20% are Gold, etc.). Just reads the stored value here.
export const tierForAccount = (account: Account, ranking: Ranking | undefined) => {
  return ranking?.ranked ? ranking.tier || tierFromPercentile(ranking.percentile || 0) : 'BRONZE';
};

// Look up a player's ranking; falls back to legacy formula if rankings unavailable
export const getPlayerRanking = (account: Account, rankings: Rankings | null = null) => {
  const games = account.stats?.games || 0;
  if (rankings && rankings.has(account.username.toLowerCase())) {
    return rankings.get(account.username.toLowerCase())!;
  }
  // Fallback: use legacy calcOverall mapped to a percentile-like value
  const attrs = calcAttributes(account.stats, account.position);
  const legacyOverall = calcOverall(attrs, account.position);
  return {
    score: legacyOverall,
    percentile: Math.max(0, Math.min(1, (legacyOverall - 40) / 60)),
    ranked: games >= MIN_GAMES_FOR_RANKING,
    gamesPlayed: games,
  };
};

export const cardTier = (overallOrName: string | number) => {
  // Accept either a tier name string ('DIAMOND' / 'GOLD' / 'SILVER' / 'BRONZE')
  // or an overall number (legacy fallback).
  let tierName;
  if (typeof overallOrName === 'string') {
    tierName = overallOrName.toUpperCase();
  } else {
    const overall = overallOrName;
    if (overall >= 85) tierName = 'DIAMOND';
    else if (overall >= 75) tierName = 'GOLD';
    else if (overall >= 65) tierName = 'SILVER';
    else tierName = 'BRONZE';
  }
  if (tierName === 'DIAMOND') return {
    name: 'DIAMOND',
    // Richer, more saturated accents so Diamond pops against the Silver gray
    from: '#4fb5e8', to: '#c8e8ff', accent: '#0a2838', text: '#061826', glow: '#ffffff',
    material: {
      // Holographic prismatic diamond — vivid cyan-blue base with magenta/
      // purple refractions baked in via a second gradient layer. This makes
      // it unmistakably "diamond" rather than looking like extra-shiny silver.
      bg: `linear-gradient(135deg,
        #3fa6e0 0%,
        #7fcbed 18%,
        #e4f4fb 42%,
        #ffffff 52%,
        #d4e8ff 65%,
        #a8b8ff 78%,
        #d8a8ff 92%,
        #4fb5e8 100%
      )`,
      texture: `
        /* Prismatic color sheen — subtle rainbow bands cutting across the card */
        linear-gradient(115deg,
          transparent 0%,
          rgba(255,100,220,0.12) 18%,
          transparent 24%,
          rgba(100,220,255,0.18) 42%,
          transparent 50%,
          rgba(200,180,255,0.15) 70%,
          transparent 76%,
          rgba(255,255,255,0.22) 90%,
          transparent 100%
        ),
        /* Bright sparkle specks for the gem feel */
        radial-gradient(circle at 22% 30%, rgba(255,255,255,0.95) 0px, transparent 1.5px),
        radial-gradient(circle at 73% 18%, rgba(255,255,255,0.9) 0px, transparent 1.5px),
        radial-gradient(circle at 45% 65%, rgba(255,255,255,0.95) 0px, transparent 2px),
        radial-gradient(circle at 88% 78%, rgba(180,230,255,0.9) 0px, transparent 1.5px),
        radial-gradient(circle at 15% 85%, rgba(255,255,255,0.85) 0px, transparent 1.5px),
        radial-gradient(circle at 62% 42%, rgba(255,220,255,0.7) 0px, transparent 1.5px)
      `,
      textureOpacity: 1,
    },
  };
  if (tierName === 'GOLD') return {
    name: 'GOLD',
    from: '#b8801a', to: '#ffd84a', accent: '#5a3e08', text: '#3a2a08', glow: '#ffe680',
    material: {
      // Strong unmistakable yellow-gold — saturated, classic FIFA gold
      bg: `linear-gradient(135deg,
        #a87018 0%,
        #d99c2b 22%,
        #f5cc3e 45%,
        #ffe680 60%,
        #f5cc3e 75%,
        #c98818 100%
      )`,
      texture: `repeating-linear-gradient(90deg,
        transparent 0px,
        rgba(255,235,140,0.08) 0.5px,
        transparent 1.5px
      )`,
      textureOpacity: 0.6,
    },
  };
  if (tierName === 'SILVER') return {
    name: 'SILVER',
    from: '#7a8088', to: '#dee2e6', accent: '#2a2e34', text: '#1a1e22', glow: '#f4f6f8',
    material: {
      // Cool steel — clearly silver/gray, no warm tones
      bg: `linear-gradient(135deg,
        #7a8088 0%,
        #b4bac0 22%,
        #e8ecf0 45%,
        #f4f6f8 55%,
        #ccd0d4 75%,
        #8c9298 100%
      )`,
      texture: `repeating-linear-gradient(0deg,
        transparent 0px,
        rgba(255,255,255,0.1) 0.5px,
        transparent 1.5px,
        rgba(0,0,0,0.05) 2px,
        transparent 2.5px
      )`,
      textureOpacity: 0.7,
    },
  };
  return {
    name: 'BRONZE',
    from: '#7a4818', to: '#d18a4a', accent: '#3a1e08', text: '#2a1408', glow: '#e0a05c',
    material: {
      // Strong reddish-orange copper-bronze — unmistakably warm
      bg: `linear-gradient(135deg,
        #6e3c10 0%,
        #a85c20 22%,
        #d18a4a 45%,
        #e0a05c 55%,
        #b8702a 75%,
        #803c10 100%
      )`,
      texture: `repeating-linear-gradient(45deg,
        transparent 0px,
        rgba(0,0,0,0.05) 1px,
        transparent 2px,
        rgba(255,200,150,0.06) 3px,
        transparent 4px
      )`,
      textureOpacity: 0.5,
    },
  };
};
