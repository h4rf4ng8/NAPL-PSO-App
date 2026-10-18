import { ApolloClient, InMemoryCache } from '@apollo/client';
import { gatewayLink } from './link';

export const client = new ApolloClient({
  link: gatewayLink,
  cache: new InMemoryCache({ typePolicies: {
    // Public and private account types intentionally remain separate entities.
    CurrentAccount: { keyFields: ['id'] },
  } }),
});

// Stop departing observers so an already queued resetStore cannot refetch them.
export function resetClient() {
  for (const observable of client.getObservableQueries('all')) observable.stop();
  return client.clearStore();
}

export async function resetQueries() {
  try { await client.resetStore(); }
  catch { /* Refetch errors belong to query subscribers; the REST command succeeded. */ }
}
