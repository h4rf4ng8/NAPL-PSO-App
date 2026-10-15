import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { PostgresAuthStore } from '../../plugins/session/pg-store.js';

const runtimeUrl = process.env.API_TEST_DATABASE_URL;
const adminUrl = process.env.API_TEST_ADMIN_DATABASE_URL;
const hasDatabase = Boolean(runtimeUrl && adminUrl);

test('Postgres auth state enforces replay, lease, admission and privilege bounds', { skip: !hasDatabase }, async () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: runtimeUrl!, max: 4, connectionTimeoutMillis: 5000 }) });
  const other = new PrismaClient({ adapter: new PrismaPg({ connectionString: runtimeUrl!, max: 2, connectionTimeoutMillis: 5000 }) });
  const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: adminUrl!, max: 1 }) });
  const store = new PostgresAuthStore(db);
  const peer = new PostgresAuthStore(other);
  try {
    await admin.$executeRaw(Prisma.sql`TRUNCATE auth_gateway.auth_rate_events, auth_gateway.auth_refresh_results, auth_gateway.auth_refresh_leases, auth_gateway.auth_login_replays RESTART IDENTITY`);

    const replay = await Promise.all([store.consumeLogin('test-digest'), peer.consumeLogin('test-digest')]);
    assert.deepEqual(replay.toSorted((a, b) => Number(a) - Number(b)), [false, true]);

    const session = '11111111-1111-4111-8111-111111111111';
    assert.equal(await store.claimRefresh(session, 'owner-a'), true);
    assert.equal(await peer.claimRefresh(session, 'owner-b'), false);
    assert.equal(await peer.publishRefresh(session, 'owner-b', 'result-key', 'sealed-result'), false);
    assert.equal(await store.publishRefresh(session, 'owner-a', 'result-key', 'sealed-result'), true);
    assert.equal(await peer.readRefresh('result-key'), 'sealed-result');
    await peer.releaseRefresh(session, 'owner-b');
    assert.equal(await peer.claimRefresh(session, 'owner-b'), false);
    await store.releaseRefresh(session, 'owner-a');
    assert.equal(await peer.claimRefresh(session, 'owner-b'), true);

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

    await assert.rejects(() => db.$queryRaw(Prisma.sql`SELECT digest FROM auth_gateway.auth_login_replays`), /permission denied/);
    assert.equal(await peer.publishRefresh(session, 'owner-b', 'too-large', 'x'.repeat(16_385)), false);

    await admin.$executeRaw(Prisma.sql`UPDATE auth_gateway.auth_login_replays SET expires_at=clock_timestamp()-interval '1 second'`);
    assert.equal(await store.consumeLogin('test-digest'), true);
    await admin.$executeRaw(Prisma.sql`UPDATE auth_gateway.auth_refresh_results SET expires_at=clock_timestamp()-interval '1 second'`);
    assert.equal(await store.readRefresh('result-key'), null);
    await admin.$executeRaw(Prisma.sql`UPDATE auth_gateway.auth_refresh_leases SET expires_at=clock_timestamp()-interval '1 second'`);
    assert.equal(await peer.claimRefresh(session, 'owner-c'), true);

    await admin.$executeRaw(Prisma.sql`TRUNCATE auth_gateway.auth_rate_events RESTART IDENTITY`);
    await admin.$executeRaw(Prisma.sql`INSERT INTO auth_gateway.auth_rate_events(rate_key,event_at,expires_at)
      SELECT 'cap-' || n::text, clock_timestamp(), clock_timestamp()+interval '1 hour' FROM generate_series(1,10000) n`);
    assert.deepEqual(await store.admit([{ key: 'new-cap-key', count: 5, windowMs: 60_000 }]), { status: 'capacity', retryAfter: 1 });
    const [overflow] = await admin.$queryRaw<Array<{ count: number }>>(Prisma.sql`SELECT count(*)::int AS count FROM auth_gateway.auth_rate_events WHERE rate_key='new-cap-key'`);
    assert.equal(overflow.count, 0);

    await admin.$executeRaw(Prisma.sql`TRUNCATE auth_gateway.auth_login_replays`);
    await admin.$executeRaw(Prisma.sql`INSERT INTO auth_gateway.auth_login_replays(digest,expires_at)
      SELECT 'replay-cap-' || n::text, clock_timestamp()+interval '10 minutes' FROM generate_series(1,10000) n`);
    await assert.rejects(() => store.consumeLogin('replay-cap-new'), /auth_state_unavailable/);
    await admin.$executeRaw(Prisma.sql`TRUNCATE auth_gateway.auth_refresh_results`);
    await admin.$executeRaw(Prisma.sql`INSERT INTO auth_gateway.auth_refresh_results(key,sealed,expires_at)
      SELECT 'result-cap-' || n::text, 'sealed', clock_timestamp()+interval '10 seconds' FROM generate_series(1,10000) n`);
    assert.equal(await store.publishRefresh(session, 'owner-c', 'result-cap-new', 'sealed'), false);
    await admin.$executeRaw(Prisma.sql`TRUNCATE auth_gateway.auth_refresh_leases`);
    await admin.$executeRaw(Prisma.sql`INSERT INTO auth_gateway.auth_refresh_leases(session_id,owner,expires_at)
      SELECT gen_random_uuid(), 'cap', clock_timestamp()+interval '45 seconds' FROM generate_series(1,10000)`);
    assert.equal(await store.claimRefresh('22222222-2222-4222-8222-222222222222', 'cap-new'), false);

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
      await Promise.all([db.$disconnect(), other.$disconnect(), admin.$disconnect()]);
    }
  }
});
