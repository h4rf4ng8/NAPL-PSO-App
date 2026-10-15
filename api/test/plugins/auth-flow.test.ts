import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout } from 'node:timers/promises';
import pg from 'pg';
import { PrismaClient } from '../../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { PostgresAuthStore } from '../../plugins/session/pg-store.js';
import { buildTestServer } from './server.js';
import type { SessionDependencies } from '../../plugins/auth/session.js';
import { GatewayError } from '../../plugins/auth/errors.js';
import { CookieCrypto } from '../../plugins/session/crypto.js';
import { sessionSchema } from '../../plugins/session/model.js';
import { config, keys, session, sessionId, userId } from './fixtures.js';

test('PostgreSQL auth state across independent API instances', { skip: !process.env.API_TEST_DATABASE_URL || !process.env.API_TEST_ADMIN_DATABASE_URL, timeout: 75_000 }, async (context) => {
  const admin = new pg.Pool({ connectionString: process.env.API_TEST_ADMIN_DATABASE_URL, max: 1 });
  const clients = [0, 1].map(() => new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.API_TEST_DATABASE_URL, max: 1 }) }));
  const stores = clients.map(client => new PostgresAuthStore(client));
  const clearState = () => admin.query('TRUNCATE auth_gateway.auth_login_replays, auth_gateway.auth_refresh_leases, auth_gateway.auth_refresh_results, auth_gateway.auth_rate_events');
  context.after(async () => { await Promise.all([...clients.map(client => client.$disconnect()), admin.end()]); });
  const crypto = new CookieCrypto(keys);
  let refreshes = 0;
  let membershipChecks = 0;
  let rejectMembership = false;
  let verifyCalls = 0;
  let logoutCalls = 0;
  const dependencies: SessionDependencies = {
    authStore: stores[0]!,
    supabase: {
      verify: async token => {
        verifyCalls++;
        if (token !== 'fresh-access') throw new GatewayError(401, 'session_expired');
        return { userId, sessionId, expiresAt: Math.floor(Date.now() / 1000) + 600 };
      },
      loginUrl: (_challenge, transaction) => `https://example.supabase.co/auth/v1/authorize?transaction=${transaction}`,
      exchange: async () => ({ access_token: 'fresh-access', refresh_token: 'new-refresh', provider_token: 'discord-access', provider_refresh_token: 'discord-refresh', user: { id: userId, identities: [{ provider: 'discord', identity_data: { sub: '123456789' } }] } }),
      refresh: async () => { refreshes++; await setTimeout(50); return { access_token: 'fresh-access', refresh_token: 'new-refresh' }; },
      logout: async () => { logoutCalls++; },
    },
    discord: {
      identity: async () => '123456789',
      membership: async () => { membershipChecks++; if (rejectMembership) throw new GatewayError(503, 'discord_unavailable', 1); return true; },
      refresh: async () => ({ access_token: 'new-discord', refresh_token: 'new-discord-refresh', expires_in: 600, scope: 'guilds.members.read identify' }),
    },
    membership: { fresh: async () => null, save: async () => {} },
    provision: async () => {},
  };
  const first = await buildTestServer(config, dependencies);
  const second = await buildTestServer(config, { ...dependencies, authStore: stores[1]! });
  const csrf = crypto.csrf(sessionId);
  const cookie = `napl-auth=${await crypto.seal('session', session())}; napl-access=expired; napl-csrf=${csrf}`;
  const headers = { cookie, origin: config.PUBLIC_ORIGIN, 'x-csrf-token': csrf, 'x-real-ip': '192.0.2.1' };
  try {
    await context.test('API admission verifies access cookies and enforces signed CSRF', async () => {
      await clearState();
      const anonymous = await first.inject({ url: '/api/test', headers: { 'x-real-ip': '192.0.2.1', authorization: 'Bearer forged' } });
      assert.equal(anonymous.statusCode, 200);
      assert.equal(anonymous.json().identity, null);
      const verified = await first.inject({ url: '/api/test', headers: { 'x-real-ip': '192.0.2.1', cookie: 'napl-access=fresh-access' } });
      assert.equal(verified.statusCode, 200);
      assert.equal(verified.json().identity.userId, userId);
      const invalid = await first.inject({ url: '/api/test', headers: { 'x-real-ip': '192.0.2.1', cookie: 'napl-access=forged' } });
      assert.equal(invalid.statusCode, 401);
      const mutation = await first.inject({ method: 'POST', url: '/api/test', headers: { 'x-real-ip': '192.0.2.1', cookie: 'napl-access=fresh-access' } });
      assert.equal(mutation.statusCode, 403);
      const approved = await first.inject({ method: 'POST', url: '/api/test', headers: { ...headers, cookie: `napl-access=fresh-access; napl-csrf=${csrf}` } });
      assert.equal(approved.statusCode, 200);
    });

    await context.test('two replicas perform a single refresh and return identical rotated token cookies', async () => {
      await clearState();
      refreshes = 0; membershipChecks = 0;
      const [a, b] = await Promise.all([first, second].map(server => server.inject({ method: 'POST', url: '/auth/refresh', headers })));
      assert.equal(a.statusCode, 200, a.body);
      assert.equal(b.statusCode, 200, b.body);
      assert.equal(refreshes, 1);
      assert.equal(membershipChecks, 1);
      const authA = a.cookies.find(item => item.name === 'napl-auth');
      const authB = b.cookies.find(item => item.name === 'napl-auth');
      assert.ok(authA && authB);
      assert.equal(authA.value, authB.value);
      assert.equal(authA.path, '/auth');
      assert.equal(authA.httpOnly, true);
      assert.equal((await crypto.open('session', authA.value, sessionSchema)).supabaseRefresh, 'new-refresh');
      const cached = await admin.query<{ sealed: string }>('SELECT sealed FROM auth_gateway.auth_refresh_results');
      assert.equal(cached.rows.length, 1);
      assert.ok(cached.rows[0] && !cached.rows[0].sealed.includes('new-refresh') && !cached.rows[0].sealed.includes('fresh-access'));
    });

    await context.test('new Supabase credentials survive a subsequent Discord outage', async () => {
      await clearState(); rejectMembership = true;
      const response = await first.inject({ method: 'POST', url: '/auth/refresh', headers });
      assert.equal(response.statusCode, 503);
      assert.equal(response.json().error.code, 'discord_unavailable');
      const rotated = response.cookies.find(item => item.name === 'napl-auth');
      assert.ok(rotated);
      assert.equal((await crypto.open('session', rotated.value, sessionSchema)).supabaseRefresh, 'new-refresh');
      rejectMembership = false;
    });

    await context.test('login transaction is browser bound and callback is consumed once', async () => {
      await clearState();
      const initial = await first.inject({ url: '/auth/csrf', headers: { 'x-real-ip': '192.0.2.2' } });
      const anonymousCsrf = initial.json().csrfToken as string;
      const login = await first.inject({ method: 'POST', url: '/auth/login/discord', headers: { 'x-real-ip': '192.0.2.2', origin: config.PUBLIC_ORIGIN, 'x-csrf-token': anonymousCsrf, cookie: `napl-csrf=${anonymousCsrf}` } });
      assert.equal(login.statusCode, 200, login.body);
      const transaction = new URL(login.json().url as string).searchParams.get('transaction');
      const loginCookie = login.cookies.find(item => item.name === 'napl-login');
      assert.ok(loginCookie);
      const url = `/auth/callback?code=one-use&transaction=${transaction}`;
      const callbackHeaders = { 'x-real-ip': '192.0.2.2', cookie: `napl-login=${loginCookie.value}` };
      assert.equal((await second.inject({ url, headers: { 'x-real-ip': '192.0.2.2' } })).statusCode, 401);
      const callback = await second.inject({ url, headers: callbackHeaders });
      assert.equal(callback.statusCode, 302, callback.body);
      assert.equal(callback.headers.location, `${config.PUBLIC_ORIGIN}/`);
      const replay = await first.inject({ url, headers: callbackHeaders });
      assert.equal(replay.statusCode, 401);
      assert.equal(replay.json().error.code, 'login_transaction_used');
    });

    await context.test('logout can clear corrupted credentials while still requiring valid CSRF', async () => {
      const response = await first.inject({ method: 'POST', url: '/auth/logout', headers: { ...headers, cookie: `napl-auth=corrupt; napl-csrf=${csrf}` } });
      assert.equal(response.statusCode, 200);
      assert.equal(response.json().upstreamRevoked, false);
      assert.equal(response.cookies.find(item => item.name === 'napl-auth')?.value, '');
      assert.equal((await first.inject({ method: 'POST', url: '/auth/logout', headers: { ...headers, origin: 'https://evil.example' } })).statusCode, 403);
    });

    await context.test('logout IP quota bounds invalid-token verification and clears cookies', async () => {
      await clearState();
      const before = verifyCalls;
      const requestHeaders = {
        origin: config.PUBLIC_ORIGIN,
        'x-csrf-token': csrf,
        'x-real-ip': '192.0.2.130',
        cookie: `napl-access=invalid; napl-csrf=${csrf}`,
      };
      for (let attempt = 0; attempt < 130; attempt++) {
        const response = await first.inject({ method: 'POST', url: '/auth/logout', headers: requestHeaders });
        assert.equal(response.statusCode, 200);
        assert.deepEqual(response.json(), { ok: true, upstreamRevoked: false });
        assert.equal(response.cookies.find(item => item.name === 'napl-access')?.value, '');
      }
      assert.equal(verifyCalls - before, 120);
    });

    await context.test('PostgreSQL enforces the separate per-session logout quota', async () => {
      await clearState();
      refreshes = 0;
      logoutCalls = 0;
      const requestHeaders = {
        origin: config.PUBLIC_ORIGIN,
        'x-csrf-token': csrf,
        'x-real-ip': '192.0.2.131',
        cookie: `napl-auth=${await crypto.seal('session', session())}; napl-csrf=${csrf}`,
      };
      const responses = [];
      for (let attempt = 0; attempt < 11; attempt++) responses.push(await first.inject({ method: 'POST', url: '/auth/logout', headers: requestHeaders }));
      assert.ok(responses.slice(0, 10).every(response => response.statusCode === 200 && response.json().upstreamRevoked));
      assert.equal(responses[10]?.statusCode, 200);
      assert.equal(responses[10]?.json().upstreamRevoked, false);
      assert.equal(responses[10]?.cookies.find(item => item.name === 'napl-auth')?.value, '');
      assert.equal(logoutCalls, 10);
      assert.equal(refreshes, 1);
    });


  } finally {
    await Promise.all([first.close(), second.close()]);
  }
});
