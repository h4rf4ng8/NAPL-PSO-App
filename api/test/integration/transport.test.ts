import { authStore } from '../auth-store.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import { createApp } from '../../app.js';
import { createHandler } from '../../plugins/lambda.js';
import type { Database, Row } from '../../plugins/db/client.js';
import { Prisma } from '../../plugins/db/client.js';
import { GatewayError } from '../../plugins/auth/errors.js';
import type { SessionDependencies } from '../../plugins/auth/session.js';
import { CookieCrypto } from '../../plugins/session/crypto.js';
import { config as baseConfig, keys, session, sessionId, userId } from '../plugins/fixtures.js';

const ORIGIN_SECRET = 'integration-origin-secret-value-at-least-32-chars';
const config = { ...baseConfig, ORIGIN_SECRET };
const adminId = userId;
const superId = '14fb22c6-a09a-4657-9213-ef95c99c46e6';

function harness(roleByUser: Record<string, string[]> = {}) {
  let databaseReads = 0;
  let authStateCalls = 0;
  let verifications = 0;
  let currentUsername = 'Before';
  let activeSession = true;
  const database: Database = {
    client: {
      setting: { findUnique: async () => { databaseReads++; return null; } },
      account: { findMany: async () => [], findUnique: async () => ({ username: currentUsername }) },
      team: { findMany: async () => [] },
      teamJoinRequest: { findMany: async () => [] },
      season: { findMany: async () => [] },
      teamSeason: { findMany: async () => [] },
    } as unknown as Prisma.TransactionClient,
    query: async <T extends Row>(sql: Prisma.Sql) => {
      databaseReads++;
      if (sql.sql.includes('auth_gateway.session_active')) return [{ active: activeSession }] as T[];
      if (sql.sql.includes('FROM auth_gateway.memberships')) return [{ eligible: true, fresh: true }] as T[];
      if (sql.sql.includes('FROM auth_gateway.user_roles WHERE user_id')) {
        const id = String(sql.values[0]);
        return (roleByUser[id] ?? []).map(role => ({ role })) as T[];
      }
      if (sql.sql.includes('FROM auth_gateway.user_roles r JOIN asl.accounts')) return [] as T[];
      if (sql.sql.includes('FROM asl.accounts a ORDER BY a.created_at, a.id')) {
        return [{
          id: userId, username: currentUsername, position: 'CM', team_id: null, image_url: null, country: null,
          stats: {}, awards: [], championships: [], totw_until: null, cheater: false, strikers_id: null,
          steam_url: null, created_at: new Date(0), season_stats: { all: {} },
        }] as T[];
      }
      return [] as T[];
    },
    execute: async () => 1,
    transaction: async work => work(database),
    close: async () => {},
  };
  const dependencies: SessionDependencies = {
    authStore: authStore({ admit: async () => { authStateCalls++; return { status: 'allowed', retryAfter: 0 }; } }),
    supabase: {
      verify: async token => {
        verifications++;
        if (token === 'access-expired') throw new GatewayError(401, 'access_expired');
        if (!['access-good', 'admin-token', 'super-token'].includes(token)) throw new GatewayError(401, 'session_invalid');
        const verifiedUserId = token === 'super-token' ? superId : userId;
        return { userId: verifiedUserId, sessionId, expiresAt: Math.floor(Date.now() / 1000) + 3600, claims: { sub: userId, session_id: sessionId } };
      },
      loginUrl: () => '', exchange: async () => { throw new Error('unexpected exchange'); },
      refresh: async () => { throw new Error('unexpected refresh'); }, logout: async () => {},
    },
    discord: { refresh: async () => { throw new Error('unexpected refresh'); }, identity: async () => ({ id: '', username: 'discord_player' }), membership: async () => false },
    membership: { fresh: async () => true, save: async () => {} },
    provision: async () => {},
  };
  const app = createApp({ db: database, config, session: dependencies });
  app.register(async scope => {
    scope.post('/api/test/transport', { config: { public: true } }, async request => {
      return {
        query: request.query,
        body: request.body,
        cookies: request.cookies,
        identity: request.identity,
        userRoles: request.userRoles,
        realIp: request.headers['x-real-ip'],
        forwardedFor: request.headers['x-forwarded-for'],
        requestEventHeader: request.headers['x-apigateway-event'],
      };
    });
  });
  return {
    app,
    counts: () => ({ databaseReads, authStateCalls, verifications }),
    setUsername: (value: string) => { currentUsername = value; },
    setSessionActive: (value: boolean) => { activeSession = value; },
  };
}

function headers(extra: Record<string, string> = {}) {
  return { 'x-origin-secret': ORIGIN_SECRET, 'x-real-ip': '192.0.2.18', ...extra };
}

function urlEvent(path: string, overrides: Partial<APIGatewayProxyEventV2> = {}): APIGatewayProxyEventV2 {
  return {
    version: '2.0', routeKey: '$default', rawPath: path, rawQueryString: '',
    headers: { 'x-origin-secret': ORIGIN_SECRET, 'x-real-ip': '192.0.2.18' },
    requestContext: {
      accountId: '123456789012', apiId: 'test', domainName: 'test.lambda-url.us-west-2.on.aws', domainPrefix: 'test',
      http: { method: 'GET', path, protocol: 'HTTP/1.1', sourceIp: '192.0.2.88', userAgent: 'integration' },
      requestId: 'request-id', routeKey: '$default', stage: '$default', time: '14/Oct/2026:00:00:00 +0000', timeEpoch: 1,
    },
    isBase64Encoded: false,
    ...overrides,
  };
}

function lambdaContext(): Context {
  return { callbackWaitsForEmptyEventLoop: true } as Context;
}

async function accessCookies(token = 'access-good') {
  const crypto = new CookieCrypto(keys);
  const sealed = await crypto.seal('session', session());
  return `napl-access=${token}; napl-auth=${sealed}`;
}

test('origin secret and invalid client IP fail before database or auth state access', async () => {
  const h = harness();
  const handler = createHandler(h.app);
  try {
    for (const secret of [undefined, 'wrong-secret']) {
      const event = urlEvent('/api/accounts', {
        headers: { 'x-real-ip': '192.0.2.18', ...(secret && { 'x-origin-secret': secret }) },
      });
      const response = await handler(event, lambdaContext());
      assert.equal(response.statusCode, 403);
      assert.deepEqual(h.counts(), { databaseReads: 0, authStateCalls: 0, verifications: 0 });
    }
    const invalidIp = await handler(urlEvent('/api/accounts', {
      headers: { ...headers(), 'x-real-ip': 'not-an-ip' },
    }), lambdaContext());
    assert.equal(invalidIp.statusCode, 400);
    assert.equal(h.counts().databaseReads, 0);
    assert.equal(h.counts().authStateCalls, 0);
  } finally {
    await h.app.close();
  }
});

test('anonymous public requests pass; protected requests ignore bearer and identity headers', async () => {
  const h = harness();
  try {
    const publicResult = await h.app.inject({ url: '/api/accounts', headers: headers() });
    assert.equal(publicResult.statusCode, 200);
    assert.equal(publicResult.json()[0].username, 'Before');

    const protectedResult = await h.app.inject({ url: '/api/users/me', headers: headers({
      authorization: 'Bearer access-good', 'x-user-id': userId, 'x-session-id': sessionId, 'x-user-role': 'super_admin',
    }) });
    assert.equal(protectedResult.statusCode, 401);
    assert.equal(h.counts().verifications, 0);
  } finally {
    await h.app.close();
  }
});

test('fixed GraphQL reads use native Apollo CSRF with the original HTTP headers', async () => {
  const h = harness();
  try {
    for (const extra of [{}, { 'apollo-require-preflight': 'true' }]) {
      const response = await h.app.inject({
        method: 'POST', url: '/api/default-position-weights',
        headers: headers({ origin: config.PUBLIC_ORIGIN, ...extra }), payload: { variables: {} },
      });
      assert.equal(response.statusCode, 200, response.body);
      assert.ok(response.json().data.defaultPositionWeights);
      assert.equal(response.headers['set-cookie'], undefined);
      assert.equal(response.headers['cache-control'], 'no-store');
    }
    const reads = h.counts().databaseReads;
    for (const preflight of [undefined, '', 'true']) {
      const response = await h.app.inject({
        method: 'POST', url: '/api/default-position-weights',
        headers: headers({
          origin: config.PUBLIC_ORIGIN, 'content-type': 'text/plain',
          ...(preflight !== undefined && { 'apollo-require-preflight': preflight }),
        }),
        payload: JSON.stringify({ variables: {} }),
      });
      assert.equal(response.statusCode, 400, response.body);
      // A nonempty header passes native CSRF, then the strict JSON envelope rejects text.
      assert.equal(response.json().errors[0].extensions.code, preflight ? 'invalid_request' : 'BAD_REQUEST');
      assert.equal(h.counts().databaseReads, reads);
    }
  } finally {
    await h.app.close();
  }
});

test('standings aggregates require an active member session while public reads remain anonymous', async () => {
  const h = harness();
  try {
    for (const url of ['/api/standings', '/api/team-records']) {
      for (const cookie of [undefined, 'napl-access=access-expired']) {
        const response = await h.app.inject({
          method: 'POST', url, payload: { variables: {} },
          headers: headers({ origin: config.PUBLIC_ORIGIN, 'apollo-require-preflight': 'true', ...(cookie && { cookie }) }),
        });
        assert.equal(response.statusCode, 401, response.body);
        assert.equal(cookie ? response.json().error.code : response.json().error, cookie ? 'access_expired' : 'authentication_required');
        assert.equal(h.counts().databaseReads, 0);
      }
    }
    const cookie = await accessCookies();
    for (const url of ['/api/standings', '/api/team-records']) {
      const response = await h.app.inject({
        method: 'POST', url, payload: { variables: {} },
        headers: headers({ origin: config.PUBLIC_ORIGIN, cookie }),
      });
      assert.equal(response.statusCode, 200, response.body);
      assert.ok(Array.isArray(response.json().data.teamRecords));
      assert.equal(response.headers['set-cookie'], undefined);

      const simple = await h.app.inject({
        method: 'POST', url, payload: JSON.stringify({ variables: {} }),
        headers: headers({ origin: config.PUBLIC_ORIGIN, cookie, 'content-type': 'text/plain' }),
      });
      assert.equal(simple.statusCode, 400, simple.body);
      assert.equal(simple.json().errors[0].extensions.code, 'BAD_REQUEST');
    }
    h.setSessionActive(false);
    for (const url of ['/api/standings', '/api/team-records']) {
      const response = await h.app.inject({
        method: 'POST', url, payload: { variables: {} }, headers: headers({ origin: config.PUBLIC_ORIGIN, cookie }),
      });
      assert.equal(response.statusCode, 401, response.body);
      assert.equal(response.json().error, 'session_expired');
    }
    for (const url of ['/api/accounts', '/api/teams']) {
      const response = await h.app.inject({ url, headers: headers() });
      assert.equal(response.statusCode, 200, response.body);
      assert.ok(Array.isArray(response.json()));
    }
  } finally {
    await h.app.close();
  }
});

test('GraphQL still requires exact Origin and REST/auth still require signed CSRF', async () => {
  const h = harness();
  try {
    for (const origin of [undefined, 'https://attacker.example', `${config.PUBLIC_ORIGIN}/`]) {
      const response = await h.app.inject({
        method: 'POST', url: '/api/default-position-weights', payload: { variables: {} },
        headers: headers({ ...(origin && { origin }), 'apollo-require-preflight': 'true' }),
      });
      assert.equal(response.statusCode, 403);
      assert.equal(response.json().error.code, 'csrf_invalid');
    }
    for (const url of ['/api/test/transport', '/auth/refresh', '/auth/logout']) {
      const response = await h.app.inject({
        method: 'POST', url, payload: {},
        headers: headers({ origin: config.PUBLIC_ORIGIN, 'apollo-require-preflight': 'true', cookie: await accessCookies() }),
      });
      assert.equal(response.statusCode, 403, `${url}: ${response.body}`);
      assert.equal(response.json().error.code, 'csrf_invalid');
    }
    assert.equal(h.counts().databaseReads, 0);
  } finally {
    await h.app.close();
  }
});

test('verified access cookies grant only their database roles and API responses set no cookies', async () => {
  for (const [id, role, roleStatus] of [[adminId, 'admin', 403], [superId, 'super_admin', 200]] as const) {
    const h = harness({ [id]: [role] });
    try {
      const cookieHeader = await accessCookies(id === adminId ? 'admin-token' : 'super-token');
      const response = await h.app.inject({ url: '/api/roles', headers: headers({ cookie: cookieHeader }) });
      assert.equal(response.statusCode, roleStatus);
      assert.equal(response.headers['set-cookie'], undefined);
      assert.equal(h.counts().verifications, 1);
    } finally {
      await h.app.close();
    }
  }
});

test('Function URL preserves transport data, trusts Vercel x-real-ip and ignores spoofed adapter headers', async () => {
  const h = harness({ [userId]: ['admin'] });
  const handler = createHandler(h.app);
  try {
    const csrf = new CookieCrypto(keys).csrf(sessionId);
    const response = await handler(urlEvent('/api/test/transport', {
      rawQueryString: 'tag=one&tag=two&comma=left%2Cright&empty=',
      headers: {
        'content-type': 'application/json', 'x-origin-secret': ORIGIN_SECRET, origin: config.PUBLIC_ORIGIN, 'x-csrf-token': csrf,
        'x-real-ip': '203.0.113.254', 'x-user-id': superId, 'x-user-role': 'super_admin',
        'x-apigateway-event': '{"headers":{"x-user-role":"super_admin"}}',
      },
      cookies: [`napl-access=access-good`, `napl-csrf=${csrf}`, 'probe=value'],
      body: JSON.stringify({ hello: 'transport' }),
      requestContext: {
        ...urlEvent('/').requestContext,
        http: { method: 'POST', path: '/api/test/transport', protocol: 'HTTP/1.1', sourceIp: '192.0.2.88', userAgent: 'integration' },
      },
    }), lambdaContext());
    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.deepEqual(body.query, { tag: ['one', 'two'], comma: 'left,right', empty: '' });
    assert.deepEqual(body.body, { hello: 'transport' });
    assert.equal(body.cookies['napl-access'], 'access-good');
    assert.equal(body.cookies.probe, 'value');
    assert.deepEqual(body.userRoles, ['admin']);
    assert.equal(body.identity.id, userId);
    assert.equal(body.realIp, '203.0.113.254');
    assert.equal(body.requestEventHeader, undefined);
    assert.equal(response.cookies, undefined);
  } finally {
    await h.app.close();
  }
});

test('a warm Function URL handler reuses the app and reads changed account data on later invocations', async () => {
  const h = harness();
  const handler = createHandler(h.app);
  try {
    const first = await handler(urlEvent('/api/accounts'), lambdaContext());
    h.setUsername('After');
    const second = await handler(urlEvent('/api/accounts'), lambdaContext());
    assert.equal(JSON.parse(first.body)[0].username, 'Before');
    assert.equal(JSON.parse(second.body)[0].username, 'After');
    assert.ok(h.counts().databaseReads >= 2);
    assert.equal(h.counts().authStateCalls, 0);
    assert.equal(second.cookies, undefined);
  } finally {
    await h.app.close();
  }
});
