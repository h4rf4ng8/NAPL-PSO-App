import { request,segment } from '../../api/http';
import type { AccountCardPreviewsQuery, AccountMatchesQuery, AccountOpponentsQuery, DefaultPositionWeightsQuery, PublicAccountFieldsFragment } from '../../api/generated/graphql';
import { AWARD_IDS, accountCardStatsSchema, accountMatchPageSchema, accountOpponentsSchema, accountRankingSchema, accountStatsSchema, awardSchema, championshipSchema, matchSchema, seasonStatsSchema } from '@napl/contracts/accounts';
import type { Account, Stats } from './models';
import { z } from 'zod';
import { isRole } from '../admin/models';
type AwardId = (typeof AWARD_IDS)[number];
export const accounts={
 reviewImage:(id:string,approve:boolean)=>request<void>(`/api/accounts/${segment(id)}/image/review`,'POST',{approve}),
 patchAccount:(id:string,fields:Partial<Omit<Account,'awards'>>)=>request<void>(`/api/accounts/${segment(id)}`,'PATCH',fields),
 assignAward:(id:string,awardId:AwardId,season:string)=>request<void>(`/api/accounts/${segment(id)}/awards/${segment(awardId)}/${segment(season)}`,'PUT'),
 removeAward:(id:string,awardId:string,season:string)=>request<void>(`/api/accounts/${segment(id)}/awards/${segment(awardId)}/${segment(season)}`,'DELETE'),
 createPositionRequest:({toPos,reason=''}:{toPos:string;reason?:string})=>request<void>('/api/position-requests','POST',{toPos,reason}),
 approvePositionRequest:(id:string,reviewNote='')=>request<void>(`/api/position-requests/${segment(id)}/review`,'POST',{status:'approved',reviewNote}),
 denyPositionRequest:(id:string,reviewNote='')=>request<void>(`/api/position-requests/${segment(id)}/review`,'POST',{status:'denied',reviewNote}),
 deletePositionRequest:(id:string)=>request<void>(`/api/position-requests/${segment(id)}`,'DELETE'),
};

const accountStatDefaults = accountStatsSchema.parse(Object.fromEntries(Object.keys(accountStatsSchema.shape).map(key => [key, 0])));
const accountStatsRecordSchema = z.record(z.string(), z.number());
const invalid = (field: string): never => { throw new Error(`Invalid GraphQL ${field} data.`); };

function accountStats(value: unknown): Stats {
  const parsed = accountStatsRecordSchema.safeParse(value);
  return parsed.success ? { ...accountStatDefaults, ...parsed.data } : invalid('account stats');
}

export function mapAccount(row: PublicAccountFieldsFragment): Account {
  const legacyMatches = (row as PublicAccountFieldsFragment & { matches?: unknown }).matches;
  const matches = matchSchema.array().safeParse(legacyMatches ?? []);
  const seasonStats = row.seasonStats == null ? null : seasonStatsSchema.safeParse(row.seasonStats);
  const awards = awardSchema.array().safeParse(row.awards);
  const championships = championshipSchema.array().safeParse(row.championships);
  const ranking = accountRankingSchema.safeParse(row.ranking);
  const cardStats = accountCardStatsSchema.safeParse(row.cardStats);
  if (!matches.success || (seasonStats && !seasonStats.success) || !awards.success || !championships.success || !ranking.success || !cardStats.success) return invalid('account JSON');
  return {
    id: row.id, username: row.username, position: row.position, teamId: row.teamId,
    imageUrl: row.imageUrl, country: row.country, stats: accountStats(row.stats),
    ...(seasonStats?.data && { seasonStats: seasonStats.data }),
    ranking: ranking.data, cardStats: cardStats.data,
    matches: matches.data, awards: awards.data, championships: championships.data,
    totwUntil: row.totwUntil, cheater: row.cheater, strikersId: row.strikersId,
    steamUrl: row.steamUrl, createdAt: row.createdAt ?? 0,
  };
}

export function mapAccountMatchPage(data: AccountMatchesQuery) {
  const parsed = accountMatchPageSchema.safeParse(data.accountMatches);
  if (!parsed.success) throw new Error('Invalid GraphQL match history data.');
  return parsed.data;
}

export function mapAccountOpponents(data: AccountOpponentsQuery) {
  const parsed = z.object({ nodes: accountOpponentsSchema, pageInfo: z.object({ endCursor: z.string().nullable(), hasNextPage: z.boolean() }), totalCount: z.number() }).safeParse(data.accountOpponents);
  if (!parsed.success) throw new Error('Invalid GraphQL opponent summary data.');
  return parsed.data;
}

export function mapAccountCardPreviews(data: AccountCardPreviewsQuery) {
  return data.accountCardPreviews.map(preview => ({ ...preview, account: mapAccount(preview.account) }));
}

export function mapDefaultPositionWeights(data: DefaultPositionWeightsQuery) {
  const parsed = z.record(z.string(), z.record(z.string(), z.number())).safeParse(data.defaultPositionWeights);
  if (!parsed.success) throw new Error('Invalid GraphQL default position weights data.');
  return parsed.data;
}

export function mapCardAccount(row: Omit<NonNullable<import('../../api/generated/graphql').PlayerCardQuery['accountCard']>, '__typename'>): Account {
  const stats = accountStatsSchema.parse(row.stats);
  const ranking = accountRankingSchema.parse(row.ranking);
  const cardStats = accountCardStatsSchema.parse([{ season: row.season, cells: row.cardStats }]);
  return {
    id: row.id, username: row.username, position: row.position, teamId: row.teamId,
    imageUrl: row.imageUrl, country: row.country, stats, ranking, cardStats,
    seasonStats: { [row.season]: stats },
    totwUntil: row.totwUntil, cheater: row.cheater, strikersId: row.strikersId,
    steamUrl: row.steamUrl, createdAt: row.createdAt ?? 0,
    awardCount: row.awardCount, championshipCount: row.championshipCount,
    awardPreview: awardSchema.array().parse(row.awardPreview),
    championshipPreview: championshipSchema.array().parse(row.championshipPreview),
    _cardSeason: row.season, _team: row.team ? { ...row.team, color: row.team.color ?? '' } : undefined,
  };
}

export type CurrentCard = NonNullable<import('../../api/generated/graphql').LeagueOverviewQuery['leagueOverview']['me']>;
export function mapCurrentCard(row: CurrentCard): Account {
  return { ...mapCardAccount(row), email: row.email, pendingImageUrl: row.pendingImageUrl, roles: row.roles.filter(isRole) };
}
