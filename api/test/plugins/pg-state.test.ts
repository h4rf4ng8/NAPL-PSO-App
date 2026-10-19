import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { connectDatabase } from '../../plugins/db/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { PostgresAuthStore } from '../../plugins/session/pg-store.js';

const runtimeUrl = process.env.API_TEST_DATABASE_URL;
const adminUrl = process.env.API_TEST_ADMIN_DATABASE_URL;
const hasDatabase = Boolean(runtimeUrl && adminUrl);

test('Postgres admission uses the main DB with atomic quota and privilege bounds', { skip: !hasDatabase }, async () => {
  const db = connectDatabase(runtimeUrl!);
  const other = connectDatabase(runtimeUrl!);
  const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: adminUrl!, max: 1 }) });
  const store = new PostgresAuthStore(db);
  const peer = new PostgresAuthStore(other);
  try {
    await admin.$executeRaw(Prisma.sql`TRUNCATE auth_gateway.auth_rate_events, auth_gateway.auth_refresh_results, auth_gateway.auth_refresh_leases, auth_gateway.auth_login_replays RESTART IDENTITY`);

    const [first, second] = await Promise.all([
      store.admit([{ key: 'pg-state-test-key', count: 1, windowMs: 60_000 }]),
      peer.admit([{ key: 'pg-state-test-key', count: 1, windowMs: 60_000 }]),
    ]);
    assert.equal([first, second].filter((item) => item.status === 'allowed').length, 1);
    const blocked = first.status === 'limited' ? first : second;
    assert.equal(blocked.status, 'limited');
    assert.ok(blocked.retryAfter >= 1);
    assert.equal((await store.admit([{ key: 'pg-state-test-key', count: 1, windowMs: 60_000 }])).status, 'limited');
    await assert.rejects(() => store.admit([{ key: '', count: 1, windowMs: 60_000 }]));
    await assert.rejects(() => store.admit([{ key: 'too-wide', count: 1, windowMs: 600_001 }]));
    await assert.rejects(() => store.admit([
      { key: 'duplicate', count: 1, windowMs: 60_000 },
      { key: 'duplicate', count: 2, windowMs: 60_000 },
    ]));

    assert.equal((await store.admit([{ key: 'all-or-none-blocked', count: 1, windowMs: 600_000 }])).status, 'allowed');
    const mixed = await store.admit([
      { key: 'all-or-none-fresh', count: 1, windowMs: 600_000 },
      { key: 'all-or-none-blocked', count: 1, windowMs: 600_000 },
    ]);
    assert.equal(mixed.status, 'limited');
    const [freshCount] = await admin.$queryRaw<Array<{ count: number }>>(Prisma.sql`SELECT count(*)::int AS count FROM auth_gateway.auth_rate_events WHERE rate_key='all-or-none-fresh'`);
    assert.equal(freshCount.count, 0);

    assert.equal((await store.admit([{ key: 'sliding-window', count: 1, windowMs: 10_000 }])).status, 'allowed');
    await admin.$executeRaw(Prisma.sql`UPDATE auth_gateway.auth_rate_events SET event_at=clock_timestamp()-interval '7 seconds' WHERE rate_key='sliding-window'`);
    const retryOne = await store.admit([{ key: 'sliding-window', count: 1, windowMs: 10_000 }]);
    await admin.$executeRaw(Prisma.sql`UPDATE auth_gateway.auth_rate_events SET event_at=event_at-interval '1 second' WHERE rate_key='sliding-window'`);
    const retryTwo = await store.admit([{ key: 'sliding-window', count: 1, windowMs: 10_000 }]);
    assert.equal(retryOne.status, 'limited');
    assert.equal(retryTwo.status, 'limited');
    assert.ok(retryTwo.retryAfter < retryOne.retryAfter);

    await assert.rejects(() => db.query(Prisma.sql`SELECT digest FROM auth_gateway.auth_login_replays`), /permission denied/);
    await admin.$executeRaw(Prisma.sql`TRUNCATE auth_gateway.auth_rate_events RESTART IDENTITY`);
    await admin.$executeRaw(Prisma.sql`INSERT INTO auth_gateway.auth_rate_events(rate_key,event_at,expires_at)
      SELECT 'cap-' || n::text, clock_timestamp(), clock_timestamp()+interval '1 hour' FROM generate_series(1,10000) n`);
    assert.deepEqual(await store.admit([{ key: 'new-cap-key', count: 5, windowMs: 60_000 }]), { status: 'capacity', retryAfter: 1 });
    const [overflow] = await admin.$queryRaw<Array<{ count: number }>>(Prisma.sql`SELECT count(*)::int AS count FROM auth_gateway.auth_rate_events WHERE rate_key='new-cap-key'`);
    assert.equal(overflow.count, 0);

    for (const role of ['app_runtime', 'anon', 'authenticated'] as const) {
      await assert.rejects(() => admin.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
        await tx.$queryRaw(Prisma.sql`SELECT auth_gateway.auth_admit('[]'::jsonb)`);
      }));
    }
  } finally {
    try {
      await admin.$executeRaw(Prisma.sql`TRUNCATE auth_gateway.auth_rate_events, auth_gateway.auth_refresh_results, auth_gateway.auth_refresh_leases, auth_gateway.auth_login_replays RESTART IDENTITY`);
    } finally {
      await Promise.all([db.close(), other.close(), admin.$disconnect()]);
    }
  }
});
