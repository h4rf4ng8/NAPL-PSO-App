import { diagnose, errorFields, invocation } from '../../plugins/logging.js';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ApolloServer, HeaderMap } from '@apollo/server';
import { ApolloServerPluginLandingPageDisabled, ApolloServerPluginSchemaReportingDisabled, ApolloServerPluginUsageReportingDisabled } from '@apollo/server/plugin/disabled';
import { GraphQLError, Kind, print, type GraphQLFormattedError } from 'graphql';
import { z } from 'zod';
import { graphqlEndpoints } from '@napl/contracts';
import type { GraphQLContext } from './context.js';
import { schema } from './schema.js';
import { trustedOperations } from './generated/operations.js';
import type { Database } from '../../plugins/db/client.js';

function errorPayload(error: GraphQLFormattedError) {
  const suppliedCode = error.extensions?.code;
  const invalidQuery = suppliedCode === 'BAD_USER_INPUT';
  const internal = suppliedCode === 'INTERNAL_SERVER_ERROR' || typeof suppliedCode !== 'string';
  const defaultStatus = invalidQuery || suppliedCode === 'BAD_REQUEST' ? 400 : 503;
  const suppliedStatus = typeof error.extensions?.status === 'number' ? error.extensions.status : defaultStatus;
  const errorStatus = suppliedStatus >= 500 ? 503 : suppliedStatus;
  const code = internal ? 'internal_error' : (invalidQuery ? 'invalid_query' : suppliedCode);
  const message = internal ? 'Request failed' : error.message;
  return { message, extensions: { code, status: errorStatus } };
}

export async function registerGraphQL(app: FastifyInstance, db: Database): Promise<void> {
  const report = (level: 'debug' | 'info' | 'warn' | 'error', args: unknown[]) => {
    const message = typeof args[0] === 'string' ? args[0] : '';
    const reasons = [
      ['An error occurred while attempting to read from the documentStore.', 'document_cache_read_failed'],
      ['Could not store validated document.', 'document_cache_write_failed'],
      ['Unexpected error processing request:', 'request_pipeline_failed'],
      ['contextCreationDidFail hook threw:', 'context_error_hook_failed'],
      ['invalidRequestWasReceived hook threw:', 'invalid_request_hook_failed'],
      ['startupDidFail hook threw:', 'startup_error_hook_failed'],
      ['An error occurred during Apollo Server startup.', 'startup_failed'],
      ['stop() threw during ', 'shutdown_failed'],
      ["An error was thrown from an 'onSchemaLoadOrUpdate' listener", 'schema_listener_failed'],
      ['A GraphQL operation was received during server shutdown.', 'request_during_shutdown'],
    ] as const;
    const code = reasons.find(([prefix]) => message.startsWith(prefix))?.[1] ?? 'apollo_configuration';
    const error = args.find(value => value instanceof Error);
    const current = invocation.getStore();
    if (current?.request && !current.completed && (level === 'warn' || level === 'error')) {
      diagnose(current.request, error, code, level);
    } else {
      app.log[level]({ event: 'api.graphql.lifecycle', code, ...(error && errorFields(error)),
        ...(current && { request_id: current.requestId }), ...(current?.version && { version: current.version }),
      });
    }
  };
  const server = new ApolloServer<GraphQLContext>({
    schema,
    logger: {
      debug: (...args) => { report('debug', args); },
      info: (...args) => { report('info', args); },
      warn: (...args) => { report('warn', args); },
      error: (...args) => { report('error', args); },
    },
    csrfPrevention: true,
    persistedQueries: false,
    includeStacktraceInErrorResponses: false,
    stopOnTerminationSignals: false,
    formatError: errorPayload,
    plugins: [
      ApolloServerPluginLandingPageDisabled(),
      ApolloServerPluginSchemaReportingDisabled(),
      ApolloServerPluginUsageReportingDisabled(),
      {
        async unexpectedErrorProcessingRequest({ requestContext, error }) {
          diagnose(requestContext.contextValue.request, error, 'request_pipeline_failed');
        },
        async contextCreationDidFail({ error }) {
          const request = invocation.getStore()?.request;
          if (request) diagnose(request, error, 'graphql_context_failed');
        },
        async requestDidStart() {
          return {
            async willSendResponse({ response, errors, contextValue }) {
              if (response.body.kind !== 'single') return;
              if (errors?.length && contextValue?.request && !contextValue.request.diagnostic) {
                const internal = errors.find(error => error.extensions.code === 'INTERNAL_SERVER_ERROR');
                const first = internal ?? errors[0]!;
                const formatted = errorPayload(first);
                diagnose(contextValue.request, first.originalError ?? first, String(formatted.extensions.code), Number(formatted.extensions.status) >= 500 ? 'error' : 'info');
              }
              const statuses = response.body.singleResult.errors?.map(error => error.extensions?.status) ?? [];
              const status = statuses.find(value => value === 401 || value === 403)
                ?? statuses.find(value => typeof value === 'number' && [400, 404, 409, 429, 503].includes(value));
              if (typeof status === 'number') response.http.status = status;
              const retryAfter = errors?.find(error => error.extensions.retryAfter)?.extensions.retryAfter;
              if (retryAfter) response.http.headers.set('retry-after', String(retryAfter));
            },
          };
        },
      },
    ],
  });
  try { await server.start(); }
  catch (error) {
    app.log.error({ event: 'api.graphql.start_failed', ...errorFields(error) });
    throw error;
  }
  app.addHook('onClose', async () => { await server.stop(); });

  for (const [name, url] of Object.entries(graphqlEndpoints)) {
    const document = trustedOperations[name as keyof typeof trustedOperations];
    const operation = document.definitions.find(definition => definition.kind === Kind.OPERATION_DEFINITION)!;
    const query = print(document);
    const variables = z.strictObject(Object.fromEntries((operation.variableDefinitions ?? []).map(variable => [variable.variable.name.value, z.unknown().optional()])));
    const requestBody = z.strictObject({ variables });
    app.post(url, { config: { public: !['TeamStandings', 'TeamRecords', 'ImportAccountMatches'].includes(name) } }, async (request: FastifyRequest, reply: FastifyReply) => {
      const input = requestBody.safeParse(request.body);
      const headers = new HeaderMap();
      for (const [key, value] of Object.entries(request.headers)) {
        if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      }
      const result = await server.executeHTTPGraphQLRequest({
        httpGraphQLRequest: {
          method: request.method,
          headers,
          search: new URL(request.url, 'http://localhost').search,
          body: input.success ? { query, operationName: name, variables: input.data.variables } : undefined,
        },
        context: async () => {
          if (!input.success) throw new GraphQLError('Invalid operation request', {
            extensions: { code: 'invalid_request', status: 400, http: { status: 400 } },
          });
          return { db, request, reads: new Map<string, Promise<unknown>>() };
        },
      });
      if ((result.status ?? 200) >= 400 && !request.diagnostic) {
        request.diagnostic = { level: (result.status ?? 200) >= 500 ? 'error' : 'info', code: (result.status ?? 200) >= 500 ? 'internal_error' : 'invalid_graphql_request' };
      }
      for (const [key, value] of result.headers) reply.header(key, value);
      reply.code(result.status ?? 200);
      if (result.body.kind !== 'complete') throw new Error('Unexpected incremental GraphQL response');
      return reply.send(result.body.string);
    });
  }
}
