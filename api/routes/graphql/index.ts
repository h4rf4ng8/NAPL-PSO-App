import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { GraphQLError, execute, getVariableValues, Kind } from 'graphql';
import { z } from 'zod';
import { graphqlEndpoints } from '@napl/contracts';
import type { GraphQLContext } from './context.js';
import { schema } from './schema.js';
import { trustedOperations } from './generated/operations.js';
import type { Database } from '../../plugins/db/client.js';

function errorPayload(error: GraphQLError, status?: number) {
  const suppliedStatus = status ?? (typeof error.extensions.status === 'number' ? error.extensions.status : 503);
  const errorStatus = suppliedStatus >= 500 ? 503 : suppliedStatus;
  const code = typeof error.extensions.code === 'string' ? error.extensions.code : (status ? 'invalid_query' : 'internal_error');
  const message = status || typeof error.extensions.code === 'string' ? error.message : 'Request failed';
  return { message, extensions: { code, status: errorStatus } };
}

function failed(code: string, message = code) {
  return { errors: [{ message, extensions: { code, status: 400 } }] };
}

export function registerGraphQL(app: FastifyInstance, db: Database): void {
  for (const [name, url] of Object.entries(graphqlEndpoints)) {
    const document = trustedOperations[name as keyof typeof trustedOperations];
    const operation = document.definitions.find(definition => definition.kind === Kind.OPERATION_DEFINITION)!;
    const variables = z.strictObject(Object.fromEntries((operation.variableDefinitions ?? []).map(variable => [variable.variable.name.value, z.unknown().optional()])));
    const requestBody = z.strictObject({ variables });
    app.post(url, { config: { public: true } }, async (request: FastifyRequest, reply: FastifyReply) => {
      const input = requestBody.safeParse(request.body);
      if (!input.success) return reply.code(400).send(failed('invalid_request', 'Invalid operation request'));

      const coerced = getVariableValues(schema, operation.variableDefinitions ?? [], input.data.variables);
      if (coerced.errors) return reply.code(400).send({ errors: coerced.errors.map(error => errorPayload(error, 400)) });
      const result = await execute({
        schema,
        document,
        rootValue: undefined,
        contextValue: { db, request, reads: new Map<string, Promise<unknown>>() } satisfies GraphQLContext,
        variableValues: input.data.variables,
        operationName: name,
      });
      const errors = result.errors?.map(error => errorPayload(error)) ?? [];
      const authStatus = errors.find(error => error.extensions.status === 401 || error.extensions.status === 403)?.extensions.status;
      const retryStatus = errors.find(error => [400, 404, 409, 429, 503].includes(error.extensions.status))?.extensions.status;
      const retryAfter = result.errors?.find(error => error.extensions.retryAfter)?.extensions.retryAfter;
      if (retryAfter) reply.header('retry-after', retryAfter);
      return authStatus || retryStatus
        ? reply.code(authStatus ?? retryStatus!).send({ ...result, errors })
        : reply.send({ ...result, ...(errors.length > 0 && { errors }) });
    });
  }
}
