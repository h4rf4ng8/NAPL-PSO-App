import { diagnose } from '../../plugins/logging.js';
import type { FastifyRequest } from 'fastify';
import { GraphQLError } from 'graphql';
import { ZodError } from 'zod';
import { HttpError } from '../../plugins/auth/identity.js';
import type { Database } from '../../plugins/db/client.js';

export type GraphQLContext = {
  db: Database;
  request: FastifyRequest;
  reads: Map<string, Promise<unknown>>;
};

export async function read<T>(context: GraphQLContext, key: string, load: () => Promise<T>): Promise<T> {
  let result = context.reads.get(key);
  if (!result) {
    result = (async () => {
      try { return await load(); }
      catch (error: unknown) {
        const expected = error instanceof HttpError;
        const status = error instanceof ZodError ? 400 : (expected && error.status < 500 ? error.status : 503);
        diagnose(context.request, error, status === 503 ? 'service_unavailable' : (expected ? error.code : 'invalid_request'), status >= 500 ? 'error' : 'info');
        throw new GraphQLError('Request failed', { extensions: {
          status,
          code: status === 503 ? 'service_unavailable' : (expected ? error.code : 'invalid_request'),
          ...(expected && error.retryAfter !== undefined && { retryAfter: error.retryAfter }),
        } });
      }
    })();
    context.reads.set(key, result);
  }
  return result as Promise<T>;
}
