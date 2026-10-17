import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createApp } from '../helper.js';
import { connectDatabase, Prisma } from '../../plugins/db/client.js';

const alice = '11111111-1111-4111-8111-111111111111';
const admin = '33333333-3333-4333-8333-333333333333';
const verify = async (id: string) => ({ id, sessionId: id, claims: { sub: id } });

test('voting preserves exact visibility, JSON null, atomic replacement, and clock after row lock', {
  skip: !process.env.API_TEST_DATABASE_URL || !process.env.API_TEST_ADMIN_DATABASE_URL,
}, async () => {
  const db = connectDatabase(process.env.API_TEST_DATABASE_URL!);
  const owner = connectDatabase(process.env.API_TEST_ADMIN_DATABASE_URL!);
  const locks = new Pool({ connectionString: process.env.API_TEST_ADMIN_DATABASE_URL });
  const app = createApp({ db, verify });
  const defenderId = randomUUID(), defender = `Def${defenderId.slice(0, 8)}`;
  const votes = { gk: 'Goalie', def: defender, cm: 'Admin', st: 'Bob' };
  const call = (method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: object, user = admin) =>
    app.inject({ method, url, payload, headers: { authorization: `Bearer ${user}` } });
  let periodId = '';
  try {
    const voter = await owner.client.account.findUniqueOrThrow({ where: { id: alice }, select: { username: true } });
    await owner.execute(Prisma.sql `INSERT INTO auth.users(id) VALUES(${defenderId}::uuid)`);
    await owner.client.account.create({ data: { id: defenderId, username: defender, username_lower: defender.toLowerCase(), position: 'DEF' } });
    const created = await call('POST', '/api/voting/periods', { closesAt: Date.now() + 60_000, eligiblePlayers: Object.values(votes) });
    assert.equal(created.statusCode, 200, created.body);
    periodId = created.json().id;
    const path = `/api/voting/periods/${periodId}`;
    assert.equal((await call('PUT', `${path}/votes`, votes, alice)).statusCode, 200);
    await owner.client.totwVote.create({ data: { period_id: periodId, voter_username: voter.username.toLowerCase(), position: 'GK', voted_for_username: 'Goalie' } });
    const visible = await call('GET', `${path}/votes`, undefined, alice);
    assert.equal(visible.statusCode, 200, visible.body);
    assert.equal(visible.json().length, 4, 'case variants of the voter name are separate');
    assert.ok(visible.json().every((vote: { voterUsername: string }) => vote.voterUsername === voter.username));
    assert.deepEqual(Object.keys(visible.json()[0]).toSorted((a, b) => a.localeCompare(b)), ['id', 'periodId', 'position', 'votedAt', 'votedForUsername', 'voterUsername'].toSorted((a, b) => a.localeCompare(b)));
    assert.equal((await call('GET', `${path}/votes`)).json().length, 5);
    assert.equal((await call('GET', '/api/voting/periods/not-a-uuid/votes', undefined, alice)).statusCode, 404);
    assert.equal((await call('GET', `/api/voting/periods/${periodId.toUpperCase()}/votes`, undefined, alice)).statusCode, 404);
    assert.equal((await call('DELETE', '/api/voting/periods/not-a-uuid')).statusCode, 200);
    assert.equal((await call('PATCH', path, { winners: { gk: 'Goalie' } })).statusCode, 200);
    assert.equal((await call('PATCH', path, { winners: null })).statusCode, 200);
    const [stored] = await owner.query<{ json_null: boolean; sql_null: boolean }>(Prisma.sql `SELECT winners='null'::jsonb AS json_null,winners IS NULL AS sql_null FROM public.totw_voting_periods WHERE id=${periodId}::uuid`);
    assert.deepEqual(stored, { json_null: true, sql_null: false });

    const before = await owner.client.totwVote.findMany({ where: { period_id: periodId }, orderBy: { id: 'asc' } });
    await owner.execute(Prisma.sql `ALTER TABLE public.totw_votes ADD CONSTRAINT voting_queries_reject CHECK (position <> 'CM') NOT VALID`);
    try {
      const failed = await call('PUT', `${path}/votes`, votes, alice);
      assert.equal(failed.statusCode, 503, failed.body);
      assert.deepEqual(await owner.client.totwVote.findMany({ where: { period_id: periodId }, orderBy: { id: 'asc' } }), before);
    } finally {
      await owner.execute(Prisma.sql `ALTER TABLE public.totw_votes DROP CONSTRAINT voting_queries_reject`);
    }

    await owner.execute(Prisma.sql `UPDATE public.totw_voting_periods SET opens_at=clock_timestamp()+interval '1 hour' WHERE id=${periodId}::uuid`);
    assert.equal((await call('PUT', `${path}/votes`, votes, alice)).statusCode, 409);
    await owner.execute(Prisma.sql `UPDATE public.totw_voting_periods SET opens_at=NULL,closes_at=clock_timestamp()+interval '300 milliseconds' WHERE id=${periodId}::uuid`);
    const lock = await locks.connect();
    try {
      await lock.query('BEGIN');
      await lock.query('SELECT id FROM public.totw_voting_periods WHERE id=$1 FOR UPDATE', [periodId]);
      const pending = call('PUT', `${path}/votes`, votes, alice);
      await new Promise(resolve => setTimeout(resolve, 700));
      await lock.query('COMMIT');
      const closed = await pending;
      assert.equal(closed.statusCode, 409, closed.body);
    } finally { await lock.query('ROLLBACK'); lock.release(); }
    assert.deepEqual(await owner.client.totwVote.findMany({ where: { period_id: periodId }, orderBy: { id: 'asc' } }), before);
    assert.equal((await call('PATCH', path, { status: 'closed' })).statusCode, 200);
    assert.equal((await call('GET', `${path}/votes`, undefined, alice)).json().length, 5);
  } finally {
    await owner.execute(Prisma.sql `ALTER TABLE public.totw_votes DROP CONSTRAINT IF EXISTS voting_queries_reject`);
    if (periodId) await owner.client.totwVotingPeriod.deleteMany({ where: { id: periodId } });
    await owner.execute(Prisma.sql `DELETE FROM auth.users WHERE id=${defenderId}::uuid`);
    await app.close(); await db.close(); await owner.close(); await locks.end();
  }
});
