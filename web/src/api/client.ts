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
      query: { fetchPolicy: 'network-only' },
    },
  });
}

const state = { client: createClient() };
export const getClient = () => state.client;
export function resetClient() {
  const previous = state.client;
  state.client = createClient();
  // Stop old requests before clearing; late responses cannot populate the new cache.
  previous.stop();
  previous.cache.restore({});
}
