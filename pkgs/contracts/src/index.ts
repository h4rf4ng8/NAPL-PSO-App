import { z } from 'zod';
import { ALL_POSITIONS, SLOT, VOTE_FIELDS } from './league/positions.js';
import { matchSchema, championshipSchema } from './accounts/index.js';
export * from './league/positions.js';
export * from './league/formations.js';
export * from './accounts/index.js';
export * from './matches/index.js';
export const id = z.string().min(1).max(160);
const season = id;
export const username = z.string().trim().min(2).max(64).regex(/^[\p{L}\p{N}_. -]+$/u);
export const position = z.enum(ALL_POSITIONS);
export const httpUrl = z.string().max(2048).refine(v => {
    try {
        return ['http:', 'https:'].includes(new URL(v).protocol);
    }
    catch {
        return false;
    }
}, 'Expected HTTP(S) URL');
export const imageUrl = z.union([httpUrl, z.string().max(1_500_000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/)]).nullable();
export const jsonObject = z.record(z.string(), z.json());
export const stats = z.record(z.string(), z.number().nonnegative());
export const profilePatch = z.strictObject({
    country: z.string().max(80).nullable().optional(), steamUrl: z.union([httpUrl, z.literal('')]).nullable().optional(), imageUrl: z.null().optional(), pendingImageUrl: imageUrl.optional(), strikersId: z.string().max(100).nullable().optional(), position: position.optional()
});
export const adminAccountPatch = profilePatch.extend({
    position: position.optional(), imageUrl: imageUrl.optional(), stats: stats.optional(), matches: z.array(matchSchema).max(10_000).optional(), championships: z.array(championshipSchema).max(1000).optional(), totwUntil: z.number().nullable().optional(), cheater: z.boolean().optional()
});
export const matchInfo = z.looseObject({
    homeTeamId: id, awayTeamId: id, homeScore: z.int().min(0).max(1000), awayScore: z.int().min(0).max(1000), date: z.union([z.number(), z.string()]), season: id
});
export const playerStat = z.strictObject({
    username, position, goals: z.number().nonnegative().default(0), assists: z.number().nonnegative().default(0), passes: z.number().nonnegative().default(0), tackles: z.number().nonnegative().default(0), deflects: z.number().nonnegative().default(0), catches: z.number().nonnegative().default(0), cleanSheet: z.boolean().default(false)
});
export const submissionInput = z.strictObject({
    id, matchInfo, playerStats: z.array(playerStat).min(1).max(30), edits: z.array(jsonObject).max(1000).optional()
});
export const approveSubmission = submissionInput.omit({
    id: true
});
export const teamInput = z.strictObject({
    id, name: z.string().trim().min(3).max(100), tag: z.string().min(2).max(5), color: z.string().regex(/^#[a-fA-F0-9]{6}$/).nullable().optional(), description: z.string().max(5000).nullable().optional(), logoUrl: imageUrl.optional(), pendingMembers: z.array(username).max(14).optional(), seasons: z.array(id).max(100).optional(), formation: z.string().max(30).optional(), lineup: z.partialRecord(z.enum(SLOT), username).optional()
});
export const teamPatch = teamInput.omit({
    id: true, pendingMembers: true
}).partial().extend({
    totw: z.boolean().optional(), totwSetAt: z.number().nullable().optional()
});
export const newsInput = z.strictObject({
    id, type: z.enum(['announcement', 'matchup', 'result']), title: z.string().max(500).nullable().optional(), body: z.string().max(100_000).nullable().optional(), pinned: z.boolean().optional(), homeTeamId: id.nullable().optional(), awayTeamId: id.nullable().optional(), homeScore: z.int().nonnegative().nullable().optional(), awayScore: z.int().nonnegative().nullable().optional(), date: z.number().nullable().optional(), notes: z.string().max(10_000).nullable().optional(), autoFromSubmission: id.nullable().optional()
});
export const ruleInput = z.strictObject({
    id, title: z.string().min(1).max(500), body: z.string().max(100_000).default(''), sortOrder: z.int().nonnegative().default(0)
});
export const articleInput = z.strictObject({
    id, slug: z.string().regex(/^[a-z0-9-]+$/).max(150), title: z.string().min(1).max(500), coverImageUrl: imageUrl.optional(), body: z.string().max(200_000).default(''), excerpt: z.string().max(10_000).nullable().optional(), publishedAt: z.number().nullable().optional()
});
export const scheduleInput = z.strictObject({
    id, season, week: z.int().min(1).max(10_000), homeTeamId: id, awayTeamId: id, scheduledDate: z.number().nullable().optional(), streamUrl: z.union([httpUrl, z.literal('')]).nullable().optional(), matchType: z.enum(['regular', 'playoff']).optional(), playoffRound: z.string().max(100).nullable().optional(), status: z.enum(['scheduled', 'completed', 'cancelled', 'postponed']).optional(), homeScore: z.int().nonnegative().nullable().optional(), awayScore: z.int().nonnegative().nullable().optional(), linkedMatchId: id.nullable().optional(), notes: z.string().max(10_000).nullable().optional()
});
export const transferInput = z.strictObject({
    id: id.optional(), season, playerUsername: username, fromTeamId: id.nullable().optional(), toTeamId: id.nullable().optional(), kind: z.enum(['signing', 'transfer', 'release']), windowType: z.enum(['league', 'cross_league']).nullable().optional()
});
export const periodInput = z.strictObject({
    closesAt: z.number(), eligiblePlayers: z.array(username).max(10_000)
});
export const periodPatch = periodInput.partial().extend({
    status: z.enum(['open', 'closed', 'resolved']).optional(), winners: jsonObject.nullable().optional(), resolvedAt: z.number().nullable().optional()
});
export const voteInput = z.strictObject({
    [VOTE_FIELDS[0].key]: username,
    [VOTE_FIELDS[1].key]: username,
    [VOTE_FIELDS[2].key]: username,
    [VOTE_FIELDS[3].key]: username,
});
