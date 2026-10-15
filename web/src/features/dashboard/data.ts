import { graphql } from '../../api/graphql';
import {
  MemberLeagueDataDocument,
  PublicLeagueDataDocument,
  type MemberLeagueDataQuery,
  type PublicLeagueDataQuery,
} from '../../api/generated/graphql';
import { isRole, type Weightings } from '../admin/models';
import { mapAccount } from '../accounts/graphql';
import type { Account } from '../accounts/models';
import { teamRecordsSchema, type TeamRecord } from '@napl/contracts/matches';
import { mapNews } from '../content/graphql';
import type { News } from '../content/models';
import { mapTeam } from '../teams/graphql';
import type { Team } from '../teams/models';
import { mapVotingPeriod } from '../voting/graphql';
import type { VotingPeriod } from '../voting/models';

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function mapWeightings(value: unknown): Weightings | null {
  if (value === null) return null;
  if (!isRecord(value)) throw new Error('Invalid GraphQL weightings data.');
  const positions = Object.entries(value).map(([position, weights]) => {
    if (!isRecord(weights) || Object.values(weights).some(weight => !isNumber(weight))) throw new Error('Invalid GraphQL weightings data.');
    return [position, weights];
  });
  return Object.fromEntries(positions) as Weightings;
}

export function mapPublicLeague(data: PublicLeagueDataQuery): { players: Account[]; teams: Team[]; teamRecords: TeamRecord[] } {
  const records = teamRecordsSchema.safeParse(data.teamRecords);
  if (!records.success) throw new Error('Invalid GraphQL team records data.');
  return { players: data.accounts.map(mapAccount), teams: data.teams.map(mapTeam), teamRecords: records.data };
}

export function mapMemberLeague(data: MemberLeagueDataQuery): {
  players: Account[];
  teams: Team[];
  currentSeason: string;
  weightings: Weightings | null;
  news: News[];
  tickerNews: News[];
  periods: VotingPeriod[];
  me: Account;
} {
  if (!data.me) throw new Error('Signed-in account data is unavailable.');
  const news = data.news.map(mapNews);
  const me: Account = {
    ...mapAccount(data.me), email: data.me.email, pendingImageUrl: data.me.pendingImageUrl,
    roles: data.me.roles.filter(isRole),
  };
  return {
    players: data.accounts.map(mapAccount), teams: data.teams.map(mapTeam), currentSeason: data.season,
    weightings: mapWeightings(data.weightings), news, tickerNews: news.slice(0, 8),
    periods: data.votingPeriods.map(mapVotingPeriod), me,
  };
}

export async function loadPublicLeague(): Promise<{ players: Account[]; teams: Team[]; teamRecords: TeamRecord[] }> {
  return mapPublicLeague(await graphql(PublicLeagueDataDocument, {}));
}

export async function loadMemberLeague() {
  return mapMemberLeague(await graphql(MemberLeagueDataDocument, {}));
}
