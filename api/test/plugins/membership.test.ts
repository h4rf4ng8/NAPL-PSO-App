import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';
import { PostgresMembershipStore } from '../../plugins/membership/store.js';
import { userId } from './fixtures.js';

test('one restricted login can read application data and maintain membership', { skip: !process.env.API_TEST_DATABASE_URL }, async () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.API_TEST_DATABASE_URL, max: 1 }) });
  const store = new PostgresMembershipStore(db);
  try {
    const accounts = await db.$queryRaw<Array<{ username: string }>>`SELECT username FROM public.accounts WHERE id = '11111111-1111-4111-8111-111111111111'::uuid`;
    assert.deepEqual(accounts, [{ username: 'Alice' }]);
    await store.save(userId, '123456789', true);
    assert.equal(await store.fresh(userId), true);
    const positive = await db.membership.findUniqueOrThrow({ where: { user_id: userId } });
    assert.equal(positive.discord_user_id, '123456789');
    assert.equal(positive.valid_until.getTime() - positive.checked_at.getTime(), 300_000);

    await store.save(userId, '123456789', false);
    assert.equal(await store.fresh(userId), false);
    const negative = await db.membership.findUniqueOrThrow({ where: { user_id: userId } });
    assert.equal(negative.valid_until.getTime() - negative.checked_at.getTime(), 30_000);
    assert.equal(await db.membership.count({ where: { user_id: userId } }), 1);

    await db.membership.update({ where: { user_id: userId }, data: { valid_until: new Date(0) } });
    assert.equal(await store.fresh(userId), null);
    await assert.rejects(() => db.membership.delete({ where: { user_id: userId } }), /permission denied/);
  } finally {
    await db.$disconnect();
  }
});
