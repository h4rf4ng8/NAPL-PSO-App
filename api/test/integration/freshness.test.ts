import { authStore } from '../auth-store.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp, type Dependencies } from '../../app.js';
import { connectDatabase, Prisma } from '../../plugins/db/client.js';
import { collectPage } from '../responses.js';
import type { Row } from '../../plugins/db/client.js';
import { config } from '../plugins/fixtures.js';
import { GatewayError } from '../../plugins/auth/errors.js';

const accountId = '11111111-1111-4111-8111-111111111111';

function authDependencies(): Dependencies['auth'] {
  return {
    authStore: authStore(),
    supabase: { verify: async () => { throw new Error('unexpected verification'); }, user: async () => { throw new Error('unexpected lookup'); } },
    discord: { identity: async () => { throw new Error('unexpected Discord lookup'); } },
  };
}

test('independent app instances read committed public account changes without a shared API cache', {
  skip: !process.env.API_TEST_DATABASE_URL,
}, async () => {
  const firstDb = connectDatabase(process.env.API_TEST_DATABASE_URL!);
  const secondDb = connectDatabase(process.env.API_TEST_DATABASE_URL!);
  const first = createApp({ db: firstDb, config, auth: authDependencies() });
  const second = createApp({ db: secondDb, config, auth: authDependencies() });
  let originalCountry: string | null | undefined;
  try {
    const [current] = await firstDb.query<{ country: string | null }>(Prisma.sql`SELECT country FROM asl.accounts WHERE id=${accountId}::uuid`);
    assert.ok(current, 'seed account should exist');
    originalCountry = current.country;

    const headers = {};
    const initial = await first.inject({ url: '/api/accounts', headers });
    assert.equal(initial.statusCode, 200, initial.body);
    const initialAccount = (await collectPage<Row>(first, '/api/accounts', headers)).find(row => row.id === accountId);
    assert.ok(initialAccount);
    assert.equal(initialAccount.country, originalCountry);

    const changedCountry = originalCountry === 'freshness-probe' ? 'freshness-probe-next' : 'freshness-probe';
    await firstDb.execute(Prisma.sql`UPDATE asl.accounts SET country=${changedCountry} WHERE id=${accountId}::uuid`);

    const later = await second.inject({ url: '/api/accounts', headers });
    assert.equal(later.statusCode, 200, later.body);
    const updatedAccount = (await collectPage<Row>(second, '/api/accounts', headers)).find(row => row.id === accountId);
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
  const dependencies = authDependencies();
  dependencies.supabase.verify = async token => {
    if (token !== 'renewed-access') throw new GatewayError(401, 'access_expired');
    return { id: accountId, sessionId: accountId, claims: {} };
  };
  const app = createApp({
    config, auth: dependencies,
    db: { ...database, transaction: async work => {
      const result = await database.transaction(work);
      commits++;
      return result;
    } },
  });
  const headers = { authorization: 'Bearer expired-access' };
  const original = await database.client.account.findUniqueOrThrow({ where: { id: accountId }, select: { country: true } });
  const country = original.country === 'renewal-probe' ? 'renewal-probe-next' : 'renewal-probe';
  const command = { method: 'PATCH' as const, url: `/api/accounts/${accountId}`, payload: { country } };
  try {
    const rejected = await app.inject({ ...command, headers });
    assert.equal(rejected.statusCode, 401, rejected.body);
    assert.equal(commits, 0);
    assert.deepEqual(await database.client.account.findUniqueOrThrow({ where: { id: accountId }, select: { country: true } }), original);

    const retried = await app.inject({ ...command, headers: { authorization: 'Bearer renewed-access' } });
    assert.equal(retried.statusCode, 200, retried.body);
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
