import { ApolloLink } from '@apollo/client';
import { print } from 'graphql';
import { Observable } from 'rxjs';
import { request } from './http';

// Keep cookie, CSRF and single-refresh handling shared with REST commands.
export const gatewayLink = new ApolloLink(operation => new Observable(subscriber => {
  const controller = new AbortController();
  void request<ApolloLink.Result>('/api/graphql', 'POST', {
    query: print(operation.query),
    variables: operation.variables,
    operationName: operation.operationName,
  }, true, undefined, controller.signal).then(result => {
    subscriber.next(result);
    subscriber.complete();
  }).catch((error: unknown) => subscriber.error(error));
  return () => controller.abort();
}));
