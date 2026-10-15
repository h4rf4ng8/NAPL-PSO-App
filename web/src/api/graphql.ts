import type { OperationVariables, TypedDocumentNode } from '@apollo/client';
import { print } from 'graphql';
import { getClient } from './client';

const freshness = new WeakMap<ReturnType<typeof getClient>, Map<string, number>>();

export async function graphql<T, V extends OperationVariables>(query: TypedDocumentNode<T, V>, variables: V, options: { force?: boolean } = {}): Promise<T> {
  const client = getClient();
  let entries = freshness.get(client);
  if (!entries) { entries = new Map(); freshness.set(client, entries); }
  const key = print(query) + JSON.stringify(variables);
  const fresh = !options.force && (entries.get(key) ?? 0) > Date.now();
  if (fresh) {
    const cached = client.cache.readQuery<T, V>({ query, variables });
    if (cached !== null) return cached;
  }
  // Cache only completed successful reads, after enforcing the entry bound.
  const { data } = await client.query({ query, variables, fetchPolicy: 'no-cache' });
  if (data == null) throw new Error('GraphQL response did not include data.');
  // Check at completion too: distinct concurrent requests can all start below the cap.
  if (!entries.has(key) && entries.size >= 32) {
    entries.clear();
    client.cache.restore({});
  }
  client.cache.writeQuery({ query, variables, data });
  entries.set(key, Date.now() + 30_000);
  return data;
}
