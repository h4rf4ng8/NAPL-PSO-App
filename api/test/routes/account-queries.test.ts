import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from '../helper.js';
import { connectDatabase, Prisma } from '../../plugins/db/client.js';

const admin = '33333333-3333-4333-8333-333333333333';
const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
const accountId = 'aabbccdd-1111-4111-8111-111111111111';
const verify = async (id: string) => ({ id, sessionId: id, claims: { sub: id } });
const enabled = Boolean(process.env.API_TEST_DATABASE_URL && process.env.API_TEST_ADMIN_DATABASE_URL);

test('account and position request queries preserve UUID text matching, filtering and null-date ordering', { skip: !enabled }, async () => {
  const db = connectDatabase(process.env.API_TEST_DATABASE_URL!);
  const owner = connectDatabase(process.env.API_TEST_ADMIN_DATABASE_URL!);
  const app = createApp({ db, verify });
  const ids = ['aa000001-1111-4111-8111-111111111111', 'aa000002-1111-4111-8111-111111111111', 'aa000003-1111-4111-8111-111111111111'];
  const status = "query-test' OR true; --";
  const call = (method: 'GET' | 'PATCH' | 'POST' | 'DELETE', url: string, user = admin, payload?: object) => app.inject({
    method, url, headers: { authorization: `Bearer ${user}` }, ...(payload && { payload }),
  });
  try {
    await owner.execute(Prisma.sql`INSERT INTO auth.users(id) VALUES(${accountId}::uuid)`);
    await db.client.account.create({ data: { id: accountId, username: 'Query Player', username_lower: 'query player' } });
    await db.client.positionChangeRequest.createMany({ data: [
      { id: ids[0], account_id: alice, username: 'Alice', status, created_at: new Date(-1000) },
      { id: ids[1], account_id: alice, username: 'Alice', status, created_at: null },
      { id: ids[2], account_id: bob, username: 'Bob', status, created_at: new Date(1000) },
    ] });
    const url = `/api/position-requests?status=${encodeURIComponent(status)}`;
    const all = await call('GET', url);
    assert.equal(all.statusCode, 200, all.body);
    assert.deepEqual(all.json().map((row: { id: string }) => row.id), [ids[2], ids[1], ids[0]]);
    const own = await call('GET', url, alice);
    assert.deepEqual(own.json().map((row: { id: string }) => row.id), [ids[1], ids[0]]);
    assert.deepEqual((await call('GET', `/api/position-requests?status=${encodeURIComponent(status + 'x')}`)).json(), []);

    const profile = await call('GET', `/api/accounts/id/${accountId}`);
    assert.equal(profile.statusCode, 200, profile.body);
    const unchanged = await call('PATCH', `/api/accounts/${accountId}`, admin, {});
    assert.equal(unchanged.statusCode, 200, unchanged.body);
    assert.equal(unchanged.json().username, 'Query Player');
    assert.equal((await call('GET', `/api/accounts/id/${accountId.toUpperCase()}`)).statusCode, 404);
    assert.equal((await call('PATCH', `/api/accounts/${accountId.toUpperCase()}`, admin, {})).statusCode, 404);
    assert.equal((await call('PATCH', `/api/accounts/${accountId}`, bob, { country: 'US' })).statusCode, 403);
    assert.equal((await call('PATCH', `/api/accounts/${accountId}`, admin, { username_lower: 'tampered' })).statusCode, 400);
    for (const id of [ids[0]!.toUpperCase(), "x' OR true --"]) {
      assert.equal((await call('POST', `/api/position-requests/${encodeURIComponent(id)}/review`, admin, { status: 'approved' })).statusCode, 404);
      assert.equal((await call('DELETE', `/api/position-requests/${encodeURIComponent(id)}`)).statusCode, 200);
    }
    assert.equal(await db.client.positionChangeRequest.count({ where: { id: { in: ids } } }), 3);
    assert.equal((await db.client.account.findUniqueOrThrow({ where: { id: accountId } })).username_lower, 'query player');
  } finally {
    await db.client.positionChangeRequest.deleteMany({ where: { id: { in: ids } } });
    await owner.execute(Prisma.sql`DELETE FROM auth.users WHERE id=${accountId}::uuid`);
    await Promise.all([app.close(), db.close(), owner.close()]);
  }
});

test('rename keeps literal name comparisons and rolls back ORM and SQL writes together', { skip: !enabled }, async () => {
  const db = connectDatabase(process.env.API_TEST_DATABASE_URL!);
  const owner = connectDatabase(process.env.API_TEST_ADMIN_DATABASE_URL!);
  const app = createApp({ db, verify });
  const originalName = 'Query%_Player';
  try {
    await owner.execute(Prisma.sql`INSERT INTO auth.users(id) VALUES(${accountId}::uuid)`);
    await db.client.account.create({ data: { id: accountId, username: originalName, username_lower: originalName.toLowerCase() } });
    await db.client.team.create({ data: { id: 'rename-query-team', name: 'Rename Query', tag: 'RQ', owner_username: originalName, members: [originalName] } });
    await db.client.news.createMany({ data: [
      { id: 'rename-query-exact', type: 'announcement', author: originalName },
      { id: 'rename-query-other', type: 'announcement', author: 'QueryXXPlayer' },
    ] });
    await owner.execute(Prisma.sql`CREATE FUNCTION public.reject_query_test_rename() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.id = 'rename-query-exact' THEN RAISE EXCEPTION 'test rename failure'; END IF; RETURN NEW; END $$`);
    await owner.execute(Prisma.sql`CREATE TRIGGER reject_query_test_rename BEFORE UPDATE ON public.news FOR EACH ROW EXECUTE FUNCTION public.reject_query_test_rename()`);
    const rename = () => app.inject({ method: 'POST', url: `/api/accounts/${accountId}/rename`, headers: { authorization: `Bearer ${admin}` }, payload: { username: 'Renamed Query' } });
    const failed = await rename();
    assert.equal(failed.statusCode, 503, failed.body);
    assert.doesNotMatch(failed.body, /test rename failure|reject_query_test/);
    assert.equal((await db.client.account.findUniqueOrThrow({ where: { id: accountId } })).username, originalName);
    assert.deepEqual((await db.client.team.findUniqueOrThrow({ where: { id: 'rename-query-team' } })).members, [originalName]);
    assert.equal((await db.client.news.findUniqueOrThrow({ where: { id: 'rename-query-exact' } })).author, originalName);
    await owner.execute(Prisma.sql`DROP TRIGGER reject_query_test_rename ON public.news`);
    const success = await rename();
    assert.equal(success.statusCode, 200, success.body);
    assert.equal((await db.client.news.findUniqueOrThrow({ where: { id: 'rename-query-exact' } })).author, 'Renamed Query');
    assert.equal((await db.client.news.findUniqueOrThrow({ where: { id: 'rename-query-other' } })).author, 'QueryXXPlayer');
  } finally {
    await owner.execute(Prisma.sql`DROP TRIGGER IF EXISTS reject_query_test_rename ON public.news`);
    await owner.execute(Prisma.sql`DROP FUNCTION IF EXISTS public.reject_query_test_rename()`);
    await db.client.news.deleteMany({ where: { id: { in: ['rename-query-exact', 'rename-query-other'] } } });
    await db.client.team.deleteMany({ where: { id: 'rename-query-team' } });
    await owner.execute(Prisma.sql`DELETE FROM auth.users WHERE id=${accountId}::uuid`);
    await Promise.all([app.close(), db.close(), owner.close()]);
  }
});
