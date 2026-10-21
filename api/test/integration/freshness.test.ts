import { authStore } from '../auth-store.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from '../../app.js';
import { connectDatabase, Prisma } from '../../plugins/db/client.js';
import type { SessionDependencies } from '../../plugins/auth/session.js';
import type { Row } from '../../plugins/db/client.js';
import { config, session as sessionFixture } from '../plugins/fixtures.js';
import { GatewayError } from '../../plugins/auth/errors.js';
import { CookieCrypto } from '../../plugins/session/crypto.js';

const accountId = '11111111-1111-4111-8111-111111111111';

function sessionDependencies(): SessionDependencies {
  return {
    authStore: authStore(),
    supabase: {
      verify: async () => { throw new Error('unexpected token verification'); },
      loginUrl: () => '',
      exchange: async () => { throw new Error('unexpected token exchange'); },
      refresh: async () => { throw new Error('unexpected token refresh'); },
      logout: async () => {},
    },
    discord: {
      identity: async () => ({ id: '', username: 'discord_player' }),
      membership: async () => false,
      refresh: async () => { throw new Error('unexpected Discord refresh'); },
    },
    membership: { fresh: async () => null, save: async () => {} },
    provision: async () => {},
  };
}

test('independent app instances read committed public account changes without a shared API cache', {
  skip: !process.env.API_TEST_DATABASE_URL,
}, async () => {
  const firstDb = connectDatabase(process.env.API_TEST_DATABASE_URL!);
  const secondDb = connectDatabase(process.env.API_TEST_DATABASE_URL!);
  const first = createApp({ db: firstDb, config, session: sessionDependencies() });
  const second = createApp({ db: secondDb, config, session: sessionDependencies() });
  let originalCountry: string | null | undefined;
  try {
    const [current] = await firstDb.query<{ country: string | null }>(Prisma.sql`SELECT country FROM asl.accounts WHERE id=${accountId}::uuid`);
    assert.ok(current, 'seed account should exist');
    originalCountry = current.country;

    const headers = { 'x-origin-secret': config.ORIGIN_SECRET, 'x-real-ip': '192.0.2.9' };
    const initial = await first.inject({ url: '/api/accounts', headers });
    assert.equal(initial.statusCode, 200, initial.body);
    const initialAccount = initial.json<Row[]>().find(row => row.id === accountId);
    assert.ok(initialAccount);
    assert.equal(initialAccount.country, originalCountry);

    const changedCountry = originalCountry === 'freshness-probe' ? 'freshness-probe-next' : 'freshness-probe';
    await firstDb.execute(Prisma.sql`UPDATE asl.accounts SET country=${changedCountry} WHERE id=${accountId}::uuid`);

    const later = await second.inject({ url: '/api/accounts', headers });
    assert.equal(later.statusCode, 200, later.body);
    const updatedAccount = later.json<Row[]>().find(row => row.id === accountId);
    assert.equal(updatedAccount?.country, changedCountry);
  } finally {
    try {
      if (originalCountry !== undefined) {
        await firstDb.execute(Prisma.sql`UPDATE asl.accounts SET country=${originalCountry} WHERE id=${accountId}::uuid`);
      }
    } finally {
      await Promise.all([first.close(), second.close(), firstDb.close(), secondDb.close()]);
    }
  }
});

test('an expired command has no effects and commits once after session renewal', {
  skip: !process.env.API_TEST_DATABASE_URL,
}, async () => {
  const database = connectDatabase(process.env.API_TEST_DATABASE_URL!);
  let commits = 0;
  let refreshes = 0;
  const dependencies = sessionDependencies();
  dependencies.supabase.verify = async token => {
    if (token !== 'renewed-access') throw new GatewayError(401, 'session_expired');
    return { userId: accountId, sessionId: accountId, expiresAt: Math.floor(Date.now() / 1000) + 3600 };
  };
  dependencies.supabase.refresh = async () => {
    refreshes++;
    return { access_token: 'renewed-access', refresh_token: 'renewed-refresh' };
  };
  dependencies.membership.fresh = async () => true;
  const app = createApp({
    config, session: dependencies,
    db: { ...database, transaction: async work => {
      const result = await database.transaction(work);
      commits++;
      return result;
    } },
  });
  const crypto = new CookieCrypto(config.COOKIE_KEYS);
  const csrf = crypto.csrf(accountId);
  const sealed = await crypto.seal('session', { ...sessionFixture(), userId: accountId, sessionId: accountId });
  const headers = {
    'x-origin-secret': config.ORIGIN_SECRET, 'x-real-ip': '192.0.2.10', origin: config.PUBLIC_ORIGIN,
    'x-csrf-token': csrf, cookie: `napl-access=expired-access; napl-auth=${sealed}; napl-csrf=${csrf}`,
  };
  const original = await database.client.account.findUniqueOrThrow({ where: { id: accountId }, select: { country: true } });
  const country = original.country === 'renewal-probe' ? 'renewal-probe-next' : 'renewal-probe';
  const command = { method: 'PATCH' as const, url: `/api/accounts/${accountId}`, payload: { country } };
  try {
    const rejected = await app.inject({ ...command, headers });
    assert.equal(rejected.statusCode, 401, rejected.body);
    assert.equal(commits, 0);
    assert.deepEqual(await database.client.account.findUniqueOrThrow({ where: { id: accountId }, select: { country: true } }), original);

    const renewed = await app.inject({ method: 'POST', url: '/auth/refresh', headers });
    assert.equal(renewed.statusCode, 200, renewed.body);
    const csrfCookie = renewed.cookies.find(cookie => cookie.name === 'napl-csrf');
    assert.ok(csrfCookie);
    const retried = await app.inject({ ...command, headers: {
      ...headers, 'x-csrf-token': csrfCookie.value,
      cookie: renewed.cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; '),
    } });
    assert.equal(retried.statusCode, 200, retried.body);
    assert.equal(refreshes, 1);
    assert.equal(commits, 1);
    assert.deepEqual(await database.client.account.findUniqueOrThrow({ where: { id: accountId }, select: { country: true } }), { country });
  } finally {
    try {
      await database.client.account.update({ where: { id: accountId }, data: original });
    } finally {
      await app.close();
      await database.close();
    }
  }
});
