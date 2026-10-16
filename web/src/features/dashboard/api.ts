import { graphql } from '../../api/graphql';
import {
  MemberLeagueDataDocument,
  PublicLeagueDataDocument,
  type MemberLeagueDataQuery,
  type PublicLeagueDataQuery,
} from '../../api/generated/graphql';
import { isRole } from '../admin/models';
import { mapAccount } from '../accounts/api';
import type { Account } from '../accounts/models';
import { teamRecordsSchema, type TeamRecord } from '@napl/contracts/matches';
import { mapNews } from '../content/api';
import type { News } from '../content/models';
import { mapTeam } from '../teams/api';
import type { Team } from '../teams/models';
import { mapVotingPeriod } from '../voting/api';
import type { VotingPeriod } from '../voting/models';

export function mapPublicLeague(data: PublicLeagueDataQuery): { players: Account[]; teams: Team[]; teamRecords: TeamRecord[] } {
  const records = teamRecordsSchema.safeParse(data.teamRecords);
  if (!records.success) throw new Error('Invalid GraphQL team records data.');
  return { players: data.accounts.map(mapAccount), teams: data.teams.map(mapTeam), teamRecords: records.data };
}

export function mapMemberLeague(data: MemberLeagueDataQuery): {
  players: Account[];
  teams: Team[];
  currentSeason: string;
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
    news, tickerNews: news.slice(0, 8),
    periods: data.votingPeriods.map(mapVotingPeriod), me,
  };
}

export async function loadPublicLeague(): Promise<{ players: Account[]; teams: Team[]; teamRecords: TeamRecord[] }> {
  return mapPublicLeague(await graphql(PublicLeagueDataDocument, {}));
}

export async function loadMemberLeague() {
  return mapMemberLeague(await graphql(MemberLeagueDataDocument, {}));
}
