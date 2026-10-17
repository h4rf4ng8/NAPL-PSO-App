import type { FastifyInstance, FastifyRequest } from 'fastify';
import { GraphQLError, execute, parse, specifiedRules, validate, Lexer, Source, Kind, TokenKind, type DocumentNode, type SelectionSetNode } from 'graphql';
import { z } from 'zod';
import type { GraphQLContext } from './context.js';
import { schema } from './schema.js';
import type { Database } from '../../plugins/db/client.js';

const requestBody = z.strictObject({
  query: z.string().min(1).max(12_000),
  operationName: z.string().max(120).optional(),
  variables: z.record(z.string(), z.unknown()).optional(),
});

function withinTokenLimit(source: string): boolean {
  try {
    const lexer = new Lexer(new Source(source));
    let tokens = 0;
    while (lexer.advance().kind !== TokenKind.EOF) {
      if (++tokens > 500) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function queryLimits(document: DocumentNode): string | null {
  const fragments = new Map(document.definitions.filter(definition => definition.kind === Kind.FRAGMENT_DEFINITION).map(fragment => [fragment.name.value, fragment]));
  if (fragments.size > 8) return 'query_too_complex';
  let fields = 0;
  let rootFields = 0;
  let depthExceeded = false;
  const visit = (selectionSet: SelectionSetNode, depth: number, parents: Set<string>) => {
    for (const selection of selectionSet.selections) {
      if (selection.kind === Kind.FIELD) {
        fields++;
        if (depth === 0) rootFields++;
        if (depth + 1 > 8) depthExceeded = true;
        if (selection.selectionSet) visit(selection.selectionSet, depth + 1, parents);
      } else if (selection.kind === Kind.INLINE_FRAGMENT) {
        visit(selection.selectionSet, depth, parents);
      } else {
        const name = selection.name.value;
        const fragment = fragments.get(name);
        if (fragment && !parents.has(name)) {
          const next = new Set(parents);
          next.add(name);
          visit(fragment.selectionSet, depth, next);
        }
      }
      if (fields > 200 || rootFields > 10) return;
    }
  };
  for (const definition of document.definitions) {
    if (definition.kind === Kind.OPERATION_DEFINITION) visit(definition.selectionSet, 0, new Set());
    if (fields > 200 || rootFields > 10) break;
  }
  return depthExceeded || fields > 200 || rootFields > 10 ? 'query_too_complex' : null;
}

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
  app.post('/api/graphql', { config: { public: true } }, async (request: FastifyRequest, reply) => {
    const input = requestBody.safeParse(request.body);
    if (!input.success) return reply.code(400).send(failed('invalid_request', 'Invalid GraphQL request'));
    if (!withinTokenLimit(input.data.query)) return reply.code(400).send(failed('query_too_complex'));

    let document: DocumentNode;
    try {
      document = parse(input.data.query);
    } catch {
      return reply.code(400).send(failed('invalid_query', 'Invalid GraphQL query'));
    }
    const operations = document.definitions.filter(definition => definition.kind === Kind.OPERATION_DEFINITION);
    if (operations.length !== 1) return reply.code(400).send(failed('one_operation_required'));
    if (operations[0]!.operation !== 'query') return reply.code(400).send(failed('query_only'));
    if (input.data.operationName && operations[0]!.name?.value !== input.data.operationName) {
      return reply.code(400).send(failed('operation_not_found'));
    }

    const limitError = queryLimits(document);
    if (limitError) return reply.code(400).send(failed(limitError));
    const validationErrors = validate(schema, document, specifiedRules);
    if (validationErrors.length > 0) {
      return reply.code(400).send({ errors: validationErrors.map(error => errorPayload(error, 400)) });
    }

    const result = await execute({
      schema,
      document,
      rootValue: undefined,
      contextValue: { db, request, reads: new Map<string, Promise<unknown>>() } satisfies GraphQLContext,
      variableValues: input.data.variables,
      operationName: input.data.operationName,
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
