import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { createApp } from '../helper.js';
import { connectDatabase, Prisma } from '../../plugins/db/client.js';

const actorId = '33333333-3333-4333-8333-333333333333';
const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
const verify = async (token: string) => {
  if (token !== actorId && token !== alice) throw new Error('bad token');
  return { id: token, sessionId: token, claims: { sub: token } };
};

test('administrator changes append actor and set history atomically', {
  skip: !process.env.API_TEST_DATABASE_URL || !process.env.API_TEST_ADMIN_DATABASE_URL,
}, async () => {
  const runtime = connectDatabase(process.env.API_TEST_DATABASE_URL!);
  const owner = connectDatabase(process.env.API_TEST_ADMIN_DATABASE_URL!);
  const ownerSql = new Pool({ connectionString: process.env.API_TEST_ADMIN_DATABASE_URL });
  const app = createApp({ db: runtime, verify });
  const request = (userIds: string[]) => app.inject({
    method: 'PUT', url: '/api/roles', headers: { authorization: `Bearer ${actorId}` }, payload: { userIds },
  });
  let savedAdminIds: string[] = [];
  try {
    savedAdminIds = (await owner.query<{ user_id: string }>(Prisma.sql `SELECT user_id::text FROM auth_gateway.user_roles WHERE role='admin' ORDER BY user_id`)).map(row => row.user_id);
    await owner.execute(Prisma.sql `DELETE FROM auth_gateway.user_roles WHERE role='admin'`);
    await owner.execute(Prisma.sql `INSERT INTO auth_gateway.user_roles(user_id,role) VALUES(${alice}::uuid,'admin')`);
    const beforeCount = Number((await owner.query<{ count: bigint }>(Prisma.sql `SELECT count(*) AS count FROM auth_gateway.role_audit_events`))[0]!.count);

    const forgedActor = await app.inject({
      method: 'PUT', url: '/api/roles', headers: { authorization: `Bearer ${actorId}` }, payload: { userIds: [alice], actorUserId: alice },
    });
    assert.equal(forgedActor.statusCode, 400, forgedActor.body);
    const unauthorized = await app.inject({
      method: 'PUT', url: '/api/roles', headers: { authorization: `Bearer ${alice}` }, payload: { userIds: [bob] },
    });
    assert.equal(unauthorized.statusCode, 403, unauthorized.body);
    assert.equal(Number((await owner.query<{ count: bigint }>(Prisma.sql `SELECT count(*) AS count FROM auth_gateway.role_audit_events`))[0]!.count), beforeCount);

    const changed = await request([bob, alice, alice]);
    assert.equal(changed.statusCode, 200, changed.body);
    const events = await owner.query<{ actor_user_id: string; changed_at: Date; previous_admin_user_ids: string[]; next_admin_user_ids: string[] }>(
      Prisma.sql `SELECT actor_user_id::text,changed_at,previous_admin_user_ids,next_admin_user_ids FROM auth_gateway.role_audit_events ORDER BY id DESC LIMIT 1`);
    assert.equal(events[0]?.actor_user_id, actorId);
    assert.ok(events[0]?.changed_at instanceof Date);
    assert.deepEqual(events[0]?.previous_admin_user_ids, [alice]);
    assert.deepEqual(events[0]?.next_admin_user_ids, [alice, bob]);
    assert.equal(Number((await owner.query<{ count: bigint }>(Prisma.sql `SELECT count(*) AS count FROM auth_gateway.role_audit_events`))[0]!.count), beforeCount + 1);

    const unchanged = await request([alice, bob]);
    assert.equal(unchanged.statusCode, 200, unchanged.body);
    assert.equal(Number((await owner.query<{ count: bigint }>(Prisma.sql `SELECT count(*) AS count FROM auth_gateway.role_audit_events`))[0]!.count), beforeCount + 1);

    await ownerSql.query('ALTER TABLE auth_gateway.role_audit_events ADD CONSTRAINT role_audit_test_reject CHECK (actor_user_id IS NULL) NOT VALID');
    try {
      const failed = await request([bob]);
      assert.equal(failed.statusCode, 400, failed.body);
      const current = (await owner.query<{ user_id: string }>(Prisma.sql `SELECT user_id::text FROM auth_gateway.user_roles WHERE role='admin' ORDER BY user_id`)).map(row => row.user_id);
      assert.deepEqual(current, [alice, bob], 'role change must roll back when event append fails');
      assert.equal(Number((await owner.query<{ count: bigint }>(Prisma.sql `SELECT count(*) AS count FROM auth_gateway.role_audit_events`))[0]!.count), beforeCount + 1);
    } finally {
      await ownerSql.query('ALTER TABLE auth_gateway.role_audit_events DROP CONSTRAINT role_audit_test_reject');
    }

    const lastEventId = (await owner.query<{ id: bigint }>(Prisma.sql `SELECT id FROM auth_gateway.role_audit_events ORDER BY id DESC LIMIT 1`))[0]!.id;
    const concurrent = await Promise.all([request([alice]), request([bob])]);
    const statuses = concurrent.map(response => response.statusCode);
    assert.ok(statuses.every(status => status === 200 || status === 409), concurrent.map(response => `${response.statusCode}: ${response.body}`).join('\n'));
    const requestedSets = [[alice], [bob]];
    const successful = concurrent.map((response, index) => ({ response, ids: requestedSets[index]! }))
      .filter(({ response }) => response.statusCode === 200).map(({ ids }) => ids);
    assert.ok(successful.length > 0);
    const changes = await owner.query<{ actor_user_id: string; previous_admin_user_ids: string[]; next_admin_user_ids: string[] }>(
      Prisma.sql `SELECT actor_user_id::text,previous_admin_user_ids,next_admin_user_ids FROM auth_gateway.role_audit_events WHERE id>${lastEventId} ORDER BY id`);
    assert.equal(changes.length, successful.length, 'only committed role changes append history');
    let expectedPrevious = [alice, bob];
    for (const change of changes) {
      assert.equal(change.actor_user_id, actorId);
      assert.deepEqual(change.previous_admin_user_ids, expectedPrevious);
      assert.ok(successful.some(ids => JSON.stringify(ids) === JSON.stringify(change.next_admin_user_ids)));
      expectedPrevious = change.next_admin_user_ids;
    }
    const current = (await owner.query<{ user_id: string }>(Prisma.sql `SELECT user_id::text FROM auth_gateway.user_roles WHERE role='admin' ORDER BY user_id`)).map(row => row.user_id);
    assert.deepEqual(current, expectedPrevious);
    const latest = await owner.query<{ actor_user_id: string; changed_at: Date; previous_admin_user_ids: string[]; next_admin_user_ids: string[] }>(
      Prisma.sql `SELECT actor_user_id::text,changed_at,previous_admin_user_ids,next_admin_user_ids FROM auth_gateway.role_audit_events ORDER BY id DESC LIMIT 1`);
    assert.deepEqual(latest[0]?.next_admin_user_ids, expectedPrevious);
    assert.equal(Number((await owner.query<{ count: bigint }>(Prisma.sql `SELECT count(*) AS count FROM auth_gateway.role_audit_events`))[0]!.count), beforeCount + 1 + successful.length);
  } finally {
    await ownerSql.query('ALTER TABLE auth_gateway.role_audit_events DROP CONSTRAINT IF EXISTS role_audit_test_reject');
    await owner.execute(Prisma.sql `DELETE FROM auth_gateway.user_roles WHERE role='admin'`);
    for (const id of savedAdminIds)
      await owner.execute(Prisma.sql `INSERT INTO auth_gateway.user_roles(user_id,role) VALUES(${id}::uuid,'admin') ON CONFLICT DO NOTHING`);
    await app.close();
    await runtime.close();
    await owner.close();
    await ownerSql.end();
  }
});
