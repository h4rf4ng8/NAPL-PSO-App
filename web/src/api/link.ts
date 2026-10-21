import { ApolloLink } from '@apollo/client';
import { Observable } from 'rxjs';
import { graphqlEndpoints } from '@napl/contracts';
import { request } from './http';
import { mapCurrentCard, mapCardAccount, mapAccountMatchPage, mapAccountOpponents, mapAccountCardPreviews, mapDefaultPositionWeights } from '../features/accounts/api';
import { accountStatsSchema, accountRankingSchema } from '@napl/contracts/accounts';
import { z } from 'zod';
import type { LeagueOverviewQuery, LeaderboardQuery, PlayerCardQuery, HomeNewsQuery } from './generated/graphql';
import { newsSummarySchema } from '../features/content/models';
import { mapTeamRecords } from '../features/matches/api';

const endpoints = new Map<string, string>(Object.entries(graphqlEndpoints));
const validate = {
  LeagueOverview: (data: LeagueOverviewQuery) => { if (data.leagueOverview.me) mapCurrentCard(data.leagueOverview.me); },
  Leaderboard: (data: LeaderboardQuery) => { for (const row of data.leaderboard.nodes) { accountStatsSchema.parse(row.stats); accountRankingSchema.parse(row.ranking); } },
  VotingCandidates: (data: import('./generated/graphql').VotingCandidatesQuery) => { for (const row of data.votingCandidates.nodes) { accountStatsSchema.parse(row.stats); accountRankingSchema.parse(row.ranking); } },
  PlayerCard: (data: PlayerCardQuery) => { if (data.accountCard) mapCardAccount(data.accountCard); },
  HomeNews: (data: HomeNewsQuery) => { for (const row of data.homeNews.nodes) newsSummarySchema.parse(row); },
  Seasons: (data: import('./generated/graphql').SeasonsQuery) => z.array(z.string()).parse(data.seasons.nodes),
  TeamRecords: mapTeamRecords, AccountMatches: mapAccountMatchPage,
  AccountOpponents: mapAccountOpponents, AccountCardPreviews: mapAccountCardPreviews,
  DefaultPositionWeights: mapDefaultPositionWeights,
};

// Named reads use Apollo preflight protection and share session renewal with REST.
export const gatewayLink = new ApolloLink(operation => new Observable(subscriber => {
  const path = endpoints.get(operation.operationName ?? '');
  if (!path) {
    subscriber.error(new Error(`Unknown GraphQL operation: ${operation.operationName}`));
    return;
  }
  const controller = new AbortController();
  void request<ApolloLink.Result>(path, 'POST', {
    variables: operation.variables,
  }, controller.signal).then(result => {
    // Decode opaque JSON before Apollo can notify subscribers or write the cache.
    if (!result.errors?.length) {
      if (!result.data) throw new Error('GraphQL response did not include data.');
      validate[operation.operationName as keyof typeof validate]?.(result.data as never);
    }
    subscriber.next(result);
    subscriber.complete();
  }).catch((error: unknown) => subscriber.error(error));
  return () => controller.abort();
}));
