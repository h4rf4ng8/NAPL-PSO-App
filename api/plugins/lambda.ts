import awsLambdaFastify from '@fastify/aws-lambda';
import type { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import type { FastifyInstance } from 'fastify';

export function createHandler(app: FastifyInstance) {
  const proxy = awsLambdaFastify<APIGatewayProxyEventV2>(app, {
    parseCommaSeparatedQueryParams: false,
    serializeLambdaArguments: false,
    callbackWaitsForEmptyEventLoop: false,
  });
  // Install the adapter's request decorator before Fastify freezes its schema.
  const ready = app.ready();
  return async (event: APIGatewayProxyEventV2, context: Context) => {
    await ready;
    const values = new Map<string, string[]>();
    const parameters = new URLSearchParams(event.rawQueryString);
    for (const [key, value] of parameters) {
      const existing = values.get(key);
      if (existing) existing.push(value);
      else values.set(key, [value]);
    }
    // Function URLs flatten duplicate keys with commas. Recover them from the raw query,
    // preserving literal commas and empty values, using the adapter's multi-value input.
    const normalized = { ...event, queryStringParameters: undefined, multiValueQueryStringParameters: Object.fromEntries(values) };
    return proxy(normalized, context);
  };
}
