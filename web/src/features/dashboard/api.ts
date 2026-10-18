import {
  type MemberLeagueDataQuery,
  type StandingsQuery,
} from '../../api/generated/graphql';
import { isRole } from '../admin/models';
import { mapAccount } from '../accounts/api';
import type { Account } from '../accounts/models';
import type { TeamRecord } from '@napl/contracts/matches';
import { mapTeamRecords } from '../matches/api';
import { mapNews } from '../content/api';
import type { News } from '../content/models';
import { mapTeam } from '../teams/api';
import type { Team } from '../teams/models';
import { mapVotingPeriod } from '../voting/api';
import type { VotingPeriod } from '../voting/models';

export function mapPublicLeague(data: StandingsQuery): { players: Account[]; teams: Team[]; teamRecords: TeamRecord[] } {
  const records = mapTeamRecords(data);
  return { players: data.accounts.map(mapAccount), teams: data.teams.map(mapTeam), teamRecords: records };
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
