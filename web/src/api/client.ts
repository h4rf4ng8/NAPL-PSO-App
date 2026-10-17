import { ApolloClient, InMemoryCache } from '@apollo/client';
import { gatewayLink } from './link';

export function createClient() {
  return new ApolloClient({
    link: gatewayLink,
    cache: new InMemoryCache({ typePolicies: {
      // Public and private account types intentionally remain separate entities.
      CurrentAccount: { keyFields: ['id'] },
    } }),
    defaultOptions: {
      // Apollo's default errorPolicy `none` rejects partial results.
      query: { fetchPolicy: 'cache-first' },
      watchQuery: { fetchPolicy: 'cache-first' },
    },
  });
}

const client = createClient();
export const getClient = () => client;

// Stop departing observers so an already queued resetStore cannot refetch them.
export function resetClient() {
  for (const observable of client.getObservableQueries('all')) observable.stop();
  return client.clearStore();
}

export async function resetQueries() {
  try { await client.resetStore(); }
  catch { /* Refetch errors belong to query subscribers; the REST command succeeded. */ }
}
