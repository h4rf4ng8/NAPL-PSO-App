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
    await db.client.account.create({ data: { id: accountId, username: 'Query Player' } });
    await db.client.positionChangeRequest.createMany({ data: [
      { id: ids[0], account_id: alice, username: 'Alice', from_pos: 'CM', to_pos: 'GK', status, created_at: new Date(-1000) },
      { id: ids[1], account_id: alice, username: 'Alice', from_pos: 'CM', to_pos: 'GK', status, created_at: new Date(0) },
      { id: ids[2], account_id: bob, username: 'Bob', from_pos: 'CM', to_pos: 'GK', status, created_at: new Date(1000) },
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

test('verified Discord rename follows UUID references and retains historical snapshots', { skip: !enabled }, async () => {
  const db = connectDatabase(process.env.API_TEST_DATABASE_URL!);
  const owner = connectDatabase(process.env.API_TEST_ADMIN_DATABASE_URL!);
  const { provisionAccount } = await import('../../routes/accounts/queries.js');
  const oldName = 'query_player', newName = 'renamed_query';
  const identity = { id: accountId, sessionId: accountId, claims: { sub: accountId } };
  try {
    await owner.execute(Prisma.sql`INSERT INTO auth.users(id) VALUES(${accountId}::uuid)`);
    await provisionAccount(db, identity, oldName);
    await db.client.team.create({ data: { id: 'rename-query-team', name: 'Rename Query', tag: 'RQ', owner_account_id: accountId, lineup: { gk: oldName } } });
    await db.client.news.create({ data: { id: 'rename-query-exact', type: 'announcement', author: oldName } });
    await db.client.account.update({ where: { id: accountId }, data: { team_id: 'rename-query-team' } });
    await provisionAccount(db, identity, newName);
    const saved = await db.client.account.findUniqueOrThrow({ where: { id: accountId } });
    assert.equal(saved.username, newName);
    assert.equal(saved.username_lower, newName);
    assert.equal(saved.team_id, 'rename-query-team');
    assert.equal((await db.client.team.findUniqueOrThrow({ where: { id: 'rename-query-team' } })).owner_account_id, accountId);
    assert.deepEqual((await db.client.team.findUniqueOrThrow({ where: { id: 'rename-query-team' } })).lineup, { gk: newName });
    assert.equal((await db.client.news.findUniqueOrThrow({ where: { id: 'rename-query-exact' } })).author, oldName);
    const aliceAccount = await db.client.account.findUniqueOrThrow({ where: { id: alice } });
    await assert.rejects(provisionAccount(db, identity, aliceAccount.username.toLowerCase()), /discord_username_conflict/);
    assert.equal((await db.client.account.findUniqueOrThrow({ where: { id: accountId } })).username, newName);
  } finally {
    await db.client.news.deleteMany({ where: { id: 'rename-query-exact' } });
    await db.client.team.deleteMany({ where: { id: 'rename-query-team' } });
    await owner.execute(Prisma.sql`DELETE FROM auth.users WHERE id=${accountId}::uuid`);
    await Promise.all([db.close(), owner.close()]);
  }
});
