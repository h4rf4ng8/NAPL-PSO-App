import { ApolloLink } from '@apollo/client';
import { Observable } from 'rxjs';
import { graphqlEndpoints } from '@napl/contracts';
import { request } from './http';
import { mapPublicLeague, mapMemberLeague } from '../features/dashboard/api';
import { mapAccountMatchPage, mapAccountOpponents, mapAccountCardPreviews, mapDefaultPositionWeights } from '../features/accounts/api';
import { mapTeamRecords } from '../features/matches/api';

const endpoints = new Map<string, string>(Object.entries(graphqlEndpoints));
const validate = {
  Standings: mapPublicLeague, MemberLeagueData: mapMemberLeague,
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
      validate[operation.operationName as keyof typeof validate](result.data as never);
    }
    subscriber.next(result);
    subscriber.complete();
  }).catch((error: unknown) => subscriber.error(error));
  return () => controller.abort();
}));
