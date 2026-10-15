import type { OperationVariables, TypedDocumentNode } from '@apollo/client';
import { getClient } from './client';

export async function graphql<T, V extends OperationVariables>(query: TypedDocumentNode<T, V>, variables: V, _options: { force?: boolean } = {}): Promise<T> {
  const { data } = await getClient().query({ query, variables, fetchPolicy: 'no-cache' });
  if (data == null) throw new Error('GraphQL response did not include data.');
  return data;
}
