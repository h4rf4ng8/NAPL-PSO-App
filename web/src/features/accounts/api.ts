import { optional,request,segment } from '../../api/http';
import { graphql } from '../../api/graphql';
import { AccountMatchesDocument, AccountOpponentsDocument, type PublicAccountFieldsFragment } from '../../api/generated/graphql';
import { AWARD_IDS, accountMatchPageSchema, accountOpponentsSchema, awardSchema, championshipSchema, matchSchema, seasonStatsSchema } from '@napl/contracts/accounts';
import type { Account, Championship, Match, PlayerAward, PositionRequest, Stats } from './models';
type AwardId = (typeof AWARD_IDS)[number];
export const accounts={
 getAccount:(username:string)=>optional<Account>(`/api/accounts/${segment(username)}`),
 getAccountById:(id:string)=>optional<Account>(`/api/accounts/id/${segment(id)}`),
 listAccounts:()=>request<Account[]>('/api/accounts'),
 patchAccount:(id:string,fields:Partial<Omit<Account,'awards'>>)=>request<Account>(`/api/accounts/${segment(id)}`,'PATCH',fields),
 assignAward:(id:string,awardId:AwardId,season:string)=>request<void>(`/api/accounts/${segment(id)}/awards/${segment(awardId)}/${segment(season)}`,'PUT'),
 removeAward:(id:string,awardId:string,season:string)=>request<void>(`/api/accounts/${segment(id)}/awards/${segment(awardId)}/${segment(season)}`,'DELETE'),
 renameAccount:(id:string,username:string)=>request<void>(`/api/accounts/${segment(id)}/rename`,'POST',{username}),
 listPositionRequests:(status:string|null=null)=>request<PositionRequest[]>(`/api/position-requests${status?`?status=${segment(status)}`:''}`),
 createPositionRequest:({toPos,reason=''}:{toPos:string;reason?:string})=>request<PositionRequest>('/api/position-requests','POST',{toPos,reason}),
 approvePositionRequest:(id:string,reviewNote='')=>request<PositionRequest>(`/api/position-requests/${segment(id)}/review`,'POST',{status:'approved',reviewNote}),
 denyPositionRequest:(id:string,reviewNote='')=>request<PositionRequest>(`/api/position-requests/${segment(id)}/review`,'POST',{status:'denied',reviewNote}),
 deletePositionRequest:(id:string)=>request<void>(`/api/position-requests/${segment(id)}`,'DELETE'),
};

type JsonRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is JsonRecord => value !== null && typeof value === 'object' && !Array.isArray(value);
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const invalid = (field: string): never => { throw new Error(`Invalid GraphQL ${field} data.`); };

function accountStats(value: unknown): Stats {
  const required = ['games', 'wins', 'draws', 'losses', 'goals', 'assists', 'passes', 'tackles', 'deflects', 'catches', 'cleanSheets', 'motm'];
  return isRecord(value) && Object.values(value).every(isFiniteNumber)
    ? { ...Object.fromEntries(required.map(key => [key, value[key] ?? 0])), ...value } as Stats
    : invalid('account stats');
}

export function mapAccount(row: PublicAccountFieldsFragment): Account {
  const legacyMatches = (row as PublicAccountFieldsFragment & { matches?: unknown }).matches;
  const matches = matchSchema.array().safeParse(legacyMatches ?? []);
  const seasonStats = row.seasonStats == null ? null : seasonStatsSchema.safeParse(row.seasonStats);
  const awards = awardSchema.array().safeParse(row.awards);
  const championships = championshipSchema.array().safeParse(row.championships);
  if (!matches.success || (seasonStats && !seasonStats.success) || !awards.success || !championships.success) return invalid('account JSON');
  return {
    id: row.id, username: row.username, position: row.position, teamId: row.teamId,
    imageUrl: row.imageUrl, country: row.country, stats: accountStats(row.stats),
    ...(seasonStats?.data && { seasonStats: seasonStats.data }),
    matches: matches.data as Match[], awards: awards.data as PlayerAward[], championships: championships.data as Championship[],
    totwUntil: row.totwUntil, cheater: row.cheater, strikersId: row.strikersId,
    steamUrl: row.steamUrl, createdAt: row.createdAt ?? 0,
  };
}

export async function loadAccountMatchPage(id: string, after: string | null, season: string | null = null, opponent: string | null = null, force = false) {
  const data = await graphql(AccountMatchesDocument, { id, first: 25, after, season, opponent }, { force });
  const parsed = accountMatchPageSchema.safeParse(data.accountMatches);
  if (!parsed.success) throw new Error('Invalid GraphQL match history data.');
  return parsed.data;
}

export async function loadAccountOpponents(id: string, force = false) {
  const data = await graphql(AccountOpponentsDocument, { id }, { force });
  const parsed = accountOpponentsSchema.safeParse(data.accountOpponents);
  if (!parsed.success) throw new Error('Invalid GraphQL opponent summary data.');
  return parsed.data;
}
