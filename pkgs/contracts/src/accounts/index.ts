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

export const matchSchema = z.object({
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
}).passthrough();

// Historical assignments may contain ids and metadata from older award systems.
export const awardSchema = z.object({
  id: z.string().optional(),
  awardId: z.string().min(1),
  season: z.string(),
  assignedAt: z.number().optional(),
  assignedBy: z.string().optional(),
  awardedAt: z.number().optional(),
  awardedBy: z.string().optional(),
}).passthrough();

export const championshipSchema = z.object({
  season: z.string(),
  placement: z.string(),
  teamId: accountId,
  awardedAt: z.number(),
}).passthrough();

export const accountStatsSchema = z.object({
  games: z.number().finite(), wins: z.number().finite(), draws: z.number().finite(), losses: z.number().finite(),
  goals: z.number().finite(), assists: z.number().finite(), passes: z.number().finite(), tackles: z.number().finite(),
  deflects: z.number().finite(), catches: z.number().finite(), cleanSheets: z.number().finite(), motm: z.number().finite(),
}).catchall(z.number().finite());

export const seasonStatsSchema = z.record(z.string(), accountStatsSchema);

export const accountRankingSchema = z.object({
  score: z.number().finite(), percentile: z.number().finite(), ranked: z.boolean(),
  gamesPlayed: z.number().finite(), tier: z.enum(['DIAMOND', 'GOLD', 'SILVER', 'BRONZE']),
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
  opponent: z.string(), games: z.number().finite(), w: z.number().finite(), d: z.number().finite(), l: z.number().finite(),
  goals: z.number().finite(), assists: z.number().finite(), motm: z.number().finite(),
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
