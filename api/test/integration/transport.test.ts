import { authStore } from '../auth-store.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import { createApp, type Dependencies } from '../../app.js';
import { createHandler } from '../../plugins/lambda.js';
import type { Database, Row } from '../../plugins/db/client.js';
import { Prisma } from '../../plugins/db/client.js';
import { clientIp } from '../../plugins/request.js';
import { GatewayError } from '../../plugins/auth/errors.js';
import { ApolloServer } from '@apollo/server';
import { config, sessionId, userId } from '../plugins/fixtures.js';

const superId = '14fb22c6-a09a-4657-9213-ef95c99c46e6';
function harness(roleByUser: Record<string, string[]> = {}) {
  let databaseReads = 0, authStateCalls = 0, verifications = 0;
  let domainReads = 0;
  let currentUsername = 'Before';
  const database: Database = {
    client: {
      setting: { findUnique: async () => { databaseReads++; return null; } },
      account: { findMany: async () => [], findUnique: async () => ({ username: currentUsername }) },
      team: { findMany: async () => [] }, teamJoinRequest: { findMany: async () => [] },
      season: { findMany: async () => [] }, teamSeason: { findMany: async () => [] },
    } as unknown as Prisma.TransactionClient,
    query: async <T extends Row>(sql: Prisma.Sql) => {
      databaseReads++;
      if (sql.sql.includes('FROM auth_gateway.user_roles WHERE user_id')) return (roleByUser[String(sql.values[0])] ?? []).map(role => ({ role })) as T[];
      if (sql.sql.includes('AS season_stats')) { domainReads++; return [{
        id: userId, username: currentUsername, position: 'CM', team_id: null, image_url: null, country: null,
        stats: {}, awards: [], championships: [], totw_until: null, cheater: false, strikers_id: null,
        steam_url: null, created_at: new Date(0), season_stats: {},
      }] as T[]; }
      return [] as T[];
    },
    execute: async () => 1, transaction: async work => work(database), close: async () => {},
  };
  const auth: Dependencies['auth'] = {
    authStore: authStore({ admit: async () => { authStateCalls++; return { status: 'allowed', retryAfter: 0 }; } }),
    supabase: {
      verify: async token => {
        verifications++;
        if (token === 'expired') throw new GatewayError(401, 'access_expired');
        if (!['good', 'admin', 'super'].includes(token)) throw new GatewayError(401, 'access_invalid');
        return { id: token === 'super' ? superId : userId, sessionId, claims: { sub: userId } };
      },
      user: async () => { throw new Error('unexpected user lookup'); },
    },
    discord: { identity: async () => { throw new Error('unexpected Discord lookup'); } },
  };
  const app = createApp({ db: database, config, auth });
  app.register(async scope => {
    scope.post('/api/test/transport', { config: { public: true } }, async request => ({
      query: request.query, body: request.body, identity: request.identity, userRoles: request.userRoles,
      ip: clientIp(request), realIp: request.headers['x-real-ip'], forwardedFor: request.headers['x-forwarded-for'],
      cookie: request.headers.cookie, requestEventHeader: request.headers['x-apigateway-event'],
    }));
  });
  return { app, domainReads: () => domainReads, counts: () => ({ databaseReads, authStateCalls, verifications }),
    setUsername: (value: string) => { currentUsername = value; } };
}
function urlEvent(path: string, overrides: Partial<APIGatewayProxyEventV2> = {}): APIGatewayProxyEventV2 {
  return {
    version: '2.0', routeKey: '$default', rawPath: path, rawQueryString: '', headers: {},
    requestContext: {
      accountId: '123456789012', apiId: 'test', domainName: 'test.lambda-url.us-west-2.on.aws', domainPrefix: 'test',
      http: { method: 'GET', path, protocol: 'HTTP/1.1', sourceIp: '192.0.2.88', userAgent: 'integration' },
      requestId: 'request-id', routeKey: '$default', stage: '$default', time: '', timeEpoch: 1,
    }, isBase64Encoded: false, ...overrides,
  };
}
const lambdaContext = () => ({ callbackWaitsForEmptyEventLoop: true }) as Context;

test('CORS preflight and rejected origins run before JWT or database access', async () => {
  const h = harness();
  try {
    const response = await h.app.inject({ method: 'OPTIONS', url: '/api/users/me', headers: {
      origin: config.PUBLIC_ORIGIN, 'access-control-request-method': 'POST',
      'access-control-request-headers': 'Authorization,Content-Type,Apollo-Require-Preflight,Idempotency-Key', authorization: 'Bearer invalid',
    } });
    assert.equal(response.statusCode, 204, response.body);
    assert.equal(response.headers['access-control-allow-origin'], config.PUBLIC_ORIGIN);
    assert.equal(response.headers['access-control-allow-credentials'], undefined);
    assert.match(String(response.headers['access-control-allow-headers']), /Authorization/);
    for (const origin of ['https://attacker.example', `${config.PUBLIC_ORIGIN}/`, 'null']) {
      const denied = await h.app.inject({ method: 'POST', url: '/api/default-position-weights', headers: { origin, authorization: 'Bearer good' }, payload: { variables: {} } });
      assert.equal(denied.statusCode, 403);
      assert.equal(denied.json().error, 'origin_forbidden');
    }
    assert.deepEqual(h.counts(), { databaseReads: 0, authStateCalls: 0, verifications: 0 });
  } finally { await h.app.close(); }
});

test('only bearer JWT identity is accepted and no-Origin requests use normal auth', async () => {
  const h = harness();
  try {
    assert.equal((await h.app.inject('/api/accounts')).statusCode, 200);
    const forged = await h.app.inject({ url: '/api/users/me', headers: {
      cookie: 'napl-access=good', 'x-user-id': userId, 'x-session-id': sessionId, 'x-user-role': 'super_admin',
    } });
    assert.equal(forged.statusCode, 401);
    for (const authorization of ['Basic good', 'Bearer', 'Bearer good,bad', 'Bearer invalid', 'Bearer expired']) {
      const denied = await h.app.inject({ url: '/api/users/me', headers: { authorization } });
      assert.equal(denied.statusCode, 401, denied.body);
      assert.equal(denied.json().error.code, authorization === 'Bearer expired' ? 'access_expired' : 'access_invalid');
    }
    const accepted = await h.app.inject({ method: 'POST', url: '/api/test/transport', payload: {}, headers: { authorization: 'Bearer good', 'x-user-role': 'super_admin' } });
    assert.equal(accepted.statusCode, 200, accepted.body);
    assert.equal(accepted.json().identity.id, userId);
    assert.deepEqual(accepted.json().userRoles, []);
    assert.equal(accepted.headers['set-cookie'], undefined);
  } finally { await h.app.close(); }
});

test('fixed GraphQL HTTP uses Apollo native CSRF, strict envelopes and safe caching', async () => {
  const h = harness();
  try {
    for (const extra of [{}, { 'apollo-require-preflight': 'true' }]) {
      const response = await h.app.inject({ method: 'POST', url: '/api/default-position-weights', headers: extra, payload: { variables: {} } });
      assert.equal(response.statusCode, 200, response.body);
      assert.ok(response.json().data.defaultPositionWeights);
      assert.equal(response.headers['set-cookie'], undefined);
      assert.equal(response.headers['cache-control'], 'no-store');
    }
    const reads = h.counts().databaseReads;
    for (const preflight of [undefined, '', 'true']) {
      const response = await h.app.inject({ method: 'POST', url: '/api/default-position-weights',
        headers: { 'content-type': 'text/plain', ...(preflight !== undefined && { 'apollo-require-preflight': preflight }) },
        payload: JSON.stringify({ variables: {} }),
      });
      assert.equal(response.statusCode, 400, response.body);
      assert.equal(response.json().errors[0].extensions.code, preflight ? 'invalid_request' : 'BAD_REQUEST');
      assert.equal(h.counts().databaseReads, reads);
    }
  } finally { await h.app.close(); }
});

test('authenticated fixed reads require a valid bearer; public reads remain anonymous', async () => {
  const h = harness();
  try {
    for (const url of ['/api/standings', '/api/team-records']) {
      assert.equal((await h.app.inject({ method: 'POST', url, payload: { variables: {} } })).statusCode, 401);
      const accepted = await h.app.inject({ method: 'POST', url, headers: { authorization: 'Bearer good' }, payload: { variables: {} } });
      assert.equal(accepted.statusCode, 200, accepted.body);
    }
    for (const url of ['/api/standings', '/api/team-records']) {
      const denied = await h.app.inject({ method: 'POST', url, headers: { authorization: 'Bearer expired' }, payload: { variables: {} } });
      assert.equal(denied.statusCode, 401);
      assert.equal(denied.json().error.code, 'access_expired');
    }
    assert.equal((await h.app.inject('/api/accounts')).statusCode, 200);
  } finally { await h.app.close(); }
});

test('bearer grants only database roles and admin reads reject expired tokens', async () => {
  for (const [token, id, role, status] of [['admin', userId, 'admin', 403], ['super', superId, 'super_admin', 200]] as const) {
    const h = harness({ [id]: [role] });
    try {
      const result = await h.app.inject({ url: '/api/roles', headers: { authorization: `Bearer ${token}` } });
      assert.equal(result.statusCode, status, result.body);
      const expired = await h.app.inject({ url: '/api/accounts', headers: { authorization: 'Bearer expired' } });
      assert.equal(expired.statusCode, 401);
      assert.equal(expired.json().error.code, 'access_expired');
    } finally { await h.app.close(); }
  }
});

test('Function URL preserves query/body data and trusts event sourceIp over mixed-case spoofed headers', async () => {
  const h = harness({ [userId]: ['admin'] });
  const handler = createHandler(h.app);
  try {
    const response = await handler(urlEvent('/api/test/transport', {
      rawQueryString: 'tag=one&tag=two&comma=left%2Cright&empty=',
      headers: { 'content-type': 'application/json', Authorization: 'Bearer good',
        'X-Real-IP': '203.0.113.254', 'X-Forwarded-For': '203.0.113.253', Forwarded: 'for=203.0.113.252',
        'x-user-id': superId, 'x-user-role': 'super_admin', 'x-apigateway-event': '{"requestContext":{"http":{"sourceIp":"1.2.3.4"}}}',
      }, cookies: ['napl-access=invalid', 'probe=value'], body: JSON.stringify({ hello: 'transport' }),
      requestContext: { ...urlEvent('/').requestContext, http: { ...urlEvent('/').requestContext.http, method: 'POST' } },
    }), lambdaContext());
    assert.equal(response.statusCode, 200, response.body);
    const body = JSON.parse(response.body);
    assert.deepEqual(body.query, { tag: ['one', 'two'], comma: 'left,right', empty: '' });
    assert.deepEqual(body.body, { hello: 'transport' });
    assert.deepEqual(body.userRoles, ['admin']);
    assert.equal(body.identity.id, userId);
    assert.equal(body.ip, '192.0.2.88');
    for (const key of ['realIp', 'forwardedFor', 'requestEventHeader', 'cookie']) assert.equal(body[key], undefined);
    assert.equal(response.cookies, undefined);
    const missing = urlEvent('/api/test/transport', { body: '{}', headers: { 'content-type': 'application/json' },
      requestContext: { ...urlEvent('/').requestContext, http: { ...urlEvent('/').requestContext.http, sourceIp: undefined as unknown as string, method: 'POST' } } });
    const denied = await handler(missing, lambdaContext());
    assert.equal(denied.statusCode, 400, denied.body);
  } finally { await h.app.close(); }
});

test('warm handlers read committed account changes on later invocations', async () => {
  const h = harness(); const handler = createHandler(h.app);
  try {
    const first = await handler(urlEvent('/api/accounts'), lambdaContext()); h.setUsername('After');
    const second = await handler(urlEvent('/api/accounts'), lambdaContext());
    assert.equal(JSON.parse(first.body)[0].username, 'Before');
    assert.equal(JSON.parse(second.body)[0].username, 'After');
    assert.equal(h.counts().authStateCalls, 0);
  } finally { await h.app.close(); }
});

test('GraphQL expired-bearer retry performs no domain reads until renewed and executes once', async () => {
  const h = harness();
  try {
    const command = { method: 'POST' as const, url: '/api/standings', payload: { variables: {} } };
    const rejected = await h.app.inject({ ...command, headers: { authorization: 'Bearer expired' } });
    assert.equal(rejected.statusCode, 401); assert.equal(rejected.json().error.code, 'access_expired');
    assert.equal(h.domainReads(), 0);
    const retried = await h.app.inject({ ...command, headers: { authorization: 'Bearer good' } });
    assert.equal(retried.statusCode, 200, retried.body); assert.equal(h.domainReads(), 1);
  } finally { await h.app.close(); }
});

test('actual HTTP preserves Apollo context, CSRF, envelope and start/stop lifecycle', async context => {
  let starts = 0, stops = 0;
  const start = ApolloServer.prototype.start, stop = ApolloServer.prototype.stop;
  context.mock.method(ApolloServer.prototype, 'start', async function (this: ApolloServer) { starts++; return start.call(this); });
  context.mock.method(ApolloServer.prototype, 'stop', async function (this: ApolloServer) { stops++; return stop.call(this); });
  const h = harness();
  const address = await h.app.listen({ host: '127.0.0.1', port: 0 });
  try {
    assert.equal(starts, 1);
    const response = await fetch(`${address}/api/standings`, { method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer good', origin: config.PUBLIC_ORIGIN }, body: JSON.stringify({ variables: {} }),
    });
    assert.equal(response.status, 200); assert.ok((await response.json()).data.accounts);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('access-control-allow-origin'), config.PUBLIC_ORIGIN);
    const denied = await fetch(`${address}/api/default-position-weights`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' });
    assert.equal(denied.status, 400); assert.equal((await denied.json()).errors[0].extensions.code, 'BAD_REQUEST');
    const malformed = await fetch(`${address}/api/default-position-weights`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: '{ admins { userId } }', variables: {} }) });
    assert.equal(malformed.status, 400); assert.equal((await malformed.json()).errors[0].extensions.code, 'invalid_request');
  } finally { await h.app.close(); }
  assert.equal(stops, 1);
});
