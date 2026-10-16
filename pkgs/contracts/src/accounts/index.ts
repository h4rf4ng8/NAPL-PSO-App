import { z } from 'zod';

const accountId = z.string().min(1).max(160);

export const AWARD = {
  GLOVE: 'glove',
  STRIKER: 'striker',
  DEFENDER: 'defender',
  PLAYMAKER: 'playmaker',
} as const;
export const AWARD_IDS = [AWARD.GLOVE, AWARD.STRIKER, AWARD.DEFENDER, AWARD.PLAYMAKER] as const;
export const awardIdSchema = z.enum(AWARD_IDS);

export const matchSchema = z.looseObject({
  id: accountId,
  date: z.number(),
  season: z.string(),
  opponent: z.string(),
  opponentTeamId: accountId.nullable().optional(),
  ownTeamId: accountId.nullable().optional(),
  result: z.string(),
  goals: z.number(),
  assists: z.number(),
  passes: z.number(),
  tackles: z.number(),
  deflects: z.number(),
  catches: z.number(),
  cleanSheet: z.boolean(),
  motm: z.union([z.boolean(), z.number()]),
  goalsFor: z.number().optional(),
  goalsAgainst: z.number().optional(),
  teammates: z.array(z.string()).optional(),
  strikersMatchId: z.preprocess(value => typeof value === 'number' && Number.isFinite(value) ? String(value) : value, z.string()).optional(),
  stadium: z.string().optional(),
  matchLength: z.number().optional(),
  source: z.string().optional(),
});

// Historical assignments may contain ids and metadata from older award systems.
export const awardSchema = z.looseObject({
  id: z.string().optional(),
  awardId: z.string().min(1),
  season: z.string(),
  assignedAt: z.number().optional(),
  assignedBy: z.string().optional(),
  awardedAt: z.number().optional(),
  awardedBy: z.string().optional(),
});

export const championshipSchema = z.looseObject({
  season: z.string(),
  placement: z.string(),
  teamId: accountId,
  awardedAt: z.number(),
});

export const accountStatsSchema = z.object({
  games: z.number(), wins: z.number(), draws: z.number(), losses: z.number(),
  goals: z.number(), assists: z.number(), passes: z.number(), tackles: z.number(),
  deflects: z.number(), catches: z.number(), cleanSheets: z.number(), motm: z.number(),
}).catchall(z.number());

export const seasonStatsSchema = z.record(z.string(), accountStatsSchema);

export const accountRankingSchema = z.object({
  score: z.number(), percentile: z.number(), ranked: z.boolean(),
  gamesPlayed: z.number(), tier: z.enum(['DIAMOND', 'GOLD', 'SILVER', 'BRONZE']),
});
export const accountCardStatCellSchema = z.object({ label: z.string(), value: z.string() });
export const accountCardStatSeasonSchema = z.object({
  season: z.string().nullable(), cells: z.array(accountCardStatCellSchema).length(6),
});
export const accountCardStatsSchema = z.array(accountCardStatSeasonSchema);

export const accountMatchPageSchema = z.object({
  nodes: z.array(matchSchema),
  pageInfo: z.object({ endCursor: z.string().nullable(), hasNextPage: z.boolean() }),
});

export const accountOpponentsSchema = z.array(z.object({
  opponent: z.string(), games: z.number(), w: z.number(), d: z.number(), l: z.number(),
  goals: z.number(), assists: z.number(), motm: z.number(),
}));

export type Match = z.infer<typeof matchSchema>;
export type PlayerAward = z.infer<typeof awardSchema>;
export type Championship = z.infer<typeof championshipSchema>;
export type AccountStats = z.infer<typeof accountStatsSchema>;
export type SeasonStats = z.infer<typeof seasonStatsSchema>;
export type AccountRanking = z.infer<typeof accountRankingSchema>;
export type AccountCardStatCell = z.infer<typeof accountCardStatCellSchema>;
export type AccountCardStatSeason = z.infer<typeof accountCardStatSeasonSchema>;
export type AccountCardStats = z.infer<typeof accountCardStatsSchema>;
export type AccountMatchPage = z.infer<typeof accountMatchPageSchema>;
export type AccountOpponent = z.infer<typeof accountOpponentsSchema>[number];
