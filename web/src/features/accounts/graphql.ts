import type { PublicAccountFieldsFragment } from '../../api/generated/graphql';
import { awardSchema, championshipSchema, matchSchema, seasonStatsSchema } from '@napl/contracts/accounts';
import type { Account, Championship, Match, PlayerAward, Stats } from './models';

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
