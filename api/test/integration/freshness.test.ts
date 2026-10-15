import { authStore } from '../auth-store.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from '../../app.js';
import { connectDatabase, Prisma } from '../../plugins/db/client.js';
import type { SessionDependencies } from '../../plugins/auth/session.js';
import type { Row } from '../../plugins/db/client.js';
import { config } from '../plugins/fixtures.js';

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
      identity: async () => '',
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
    const [current] = await firstDb.query<{ country: string | null }>(Prisma.sql`SELECT country FROM public.accounts WHERE id=${accountId}::uuid`);
    assert.ok(current, 'seed account should exist');
    originalCountry = current.country;

    const headers = { 'x-origin-secret': config.ORIGIN_SECRET, 'x-real-ip': '192.0.2.9' };
    const initial = await first.inject({ url: '/api/accounts', headers });
    assert.equal(initial.statusCode, 200, initial.body);
    const initialAccount = initial.json<Row[]>().find(row => row.id === accountId);
    assert.ok(initialAccount);
    assert.equal(initialAccount.country, originalCountry);

    const changedCountry = originalCountry === 'freshness-probe' ? 'freshness-probe-next' : 'freshness-probe';
    await firstDb.execute(Prisma.sql`UPDATE public.accounts SET country=${changedCountry} WHERE id=${accountId}::uuid`);

    const later = await second.inject({ url: '/api/accounts', headers });
    assert.equal(later.statusCode, 200, later.body);
    const updatedAccount = later.json<Row[]>().find(row => row.id === accountId);
    assert.equal(updatedAccount?.country, changedCountry);
  } finally {
    try {
      if (originalCountry !== undefined) {
        await firstDb.execute(Prisma.sql`UPDATE public.accounts SET country=${originalCountry} WHERE id=${accountId}::uuid`);
      }
    } finally {
      await Promise.all([first.close(), second.close(), firstDb.close(), secondDb.close()]);
    }
  }
});
