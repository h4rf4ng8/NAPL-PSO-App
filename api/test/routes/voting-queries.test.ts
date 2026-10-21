import { collectPage } from '../responses.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createApp } from '../helper.js';
import { connectDatabase, Prisma } from '../../plugins/db/client.js';

const alice = '11111111-1111-4111-8111-111111111111';
const admin = '33333333-3333-4333-8333-333333333333';
const verify = async (id: string) => ({ id, sessionId: id, claims: { sub: id } });

test('voting uses UUID identity, normalized winners, position snapshots, atomic replacement, and clock after row lock', {
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
    const voter = await owner.client.account.findUniqueOrThrow({ where: { id: alice }, select: { username: true, position: true } });
    await owner.execute(Prisma.sql `INSERT INTO auth.users(id) VALUES(${defenderId}::uuid)`);
    await owner.client.account.create({ data: { id: defenderId, username: defender, position: 'DEF' } });
    const created = await call('POST', '/api/voting/periods', { closesAt: Date.now() + 60_000, eligiblePlayers: Object.values(votes) });
    assert.equal(created.statusCode, 200, created.body);
    periodId = created.json().id;
    assert.ok(periodId);
    assert.deepEqual(created.json(), { ok: true,id:periodId });
    const path = `/api/voting/periods/${periodId}`;
    const winnerSlot = ['CB', 'LB', 'RB'].includes(voter.position) ? 'def' : voter.position.toLowerCase();
    const resolved = await call('PATCH', path, { eligiblePlayers: [...Object.values(votes), voter.username], winners: { [winnerSlot]: voter.username } });
    assert.equal(resolved.statusCode, 200, resolved.body);
    assert.deepEqual(resolved.json(), { ok: true,id:periodId });
    assert.equal(await owner.client.totwWinner.count({where:{period_id:periodId,account_id:alice}}),1,'one patch can register a candidate and choose its winner');
    assert.equal((await call('PUT', `${path}/votes`, votes, alice)).statusCode, 200);
    const goalie = await owner.client.account.findUniqueOrThrow({ where: { username_lower: 'goalie' } });
    await assert.rejects(owner.client.totwVote.create({ data: { period_id: periodId, voter_account_id: alice, position: 'GK', voted_for_account_id: goalie.id } }), { code: 'P2002' });
    await owner.client.account.update({ where: { id: defenderId }, data: { position: 'ST' } });
    assert.equal((await call('PUT', `${path}/votes`, votes, alice)).statusCode, 200, 'candidate position is fixed when the period is created');
    const visible = await call('GET', `${path}/votes/me`, undefined, alice);
    assert.equal(visible.statusCode, 200, visible.body);
    assert.equal(visible.json().length, 4, 'one ballot per account regardless of username case');
    assert.ok(visible.json().every((vote: { voterUsername: string }) => vote.voterUsername === voter.username));
    assert.deepEqual(Object.keys(visible.json()[0]).toSorted((a, b) => a.localeCompare(b)), ['id', 'periodId', 'position', 'votedAt', 'votedForUsername', 'voterUsername'].toSorted((a, b) => a.localeCompare(b)));
    assert.equal((await collectPage(app, `${path}/votes`, {authorization:`Bearer ${admin}`})).length, 4);
    const tally=await call('GET',`${path}/tally`);
    assert.equal(tally.json().totalVotes,4);
    assert.deepEqual(tally.json().positions.GK,[['Goalie',1]]);
    assert.equal((await call('GET', '/api/voting/periods/not-a-uuid/votes', undefined, alice)).statusCode, 404);
    assert.equal((await call('GET', `/api/voting/periods/${periodId.toUpperCase()}/votes`, undefined, alice)).statusCode, 404);
    assert.equal((await call('DELETE', '/api/voting/periods/not-a-uuid')).statusCode, 200);
    await owner.client.totwCandidate.create({ data: { period_id: periodId, account_id: defenderId, position: 'ST' } });
    const positionalWinner = await call('PATCH', path, { winners: { def1: defender } });
    assert.equal(positionalWinner.statusCode, 200, positionalWinner.body);
    assert.equal((await owner.client.totwWinner.findMany({ where: { period_id: periodId } }))[0]?.position, 'DEF', 'winner slot selects the matching historical candidate position');
    const winnerBefore = await owner.client.totwWinner.findMany({ where: { period_id: periodId } });
    assert.equal((await call('PATCH', path, { winners: { st1: 'Goalie' } })).statusCode, 400, 'a goalkeeper cannot fill a striker winner slot');
    assert.deepEqual(await owner.client.totwWinner.findMany({ where: { period_id: periodId } }), winnerBefore, 'invalid winner replacement rolls back');
    assert.equal((await call('PATCH', path, { winners: { def1: defender, def2: defender } })).statusCode, 400, 'one candidate cannot win two slots of the same position');
    assert.deepEqual(await owner.client.totwWinner.findMany({ where: { period_id: periodId } }), winnerBefore);
    assert.equal((await call('PATCH', path, { winners: { gk: 'Goalie' } })).statusCode, 200);
    assert.equal((await call('PATCH', path, { winners: null })).statusCode, 200);
    assert.equal(await owner.client.totwWinner.count({ where: { period_id: periodId } }), 0);

    const before = await owner.client.totwVote.findMany({ where: { period_id: periodId }, orderBy: { id: 'asc' } });
    await owner.execute(Prisma.sql `ALTER TABLE asl.totw_votes ADD CONSTRAINT voting_queries_reject CHECK (position <> 'CM') NOT VALID`);
    try {
      const failed = await call('PUT', `${path}/votes`, votes, alice);
      assert.equal(failed.statusCode, 400, failed.body);
      assert.deepEqual(await owner.client.totwVote.findMany({ where: { period_id: periodId }, orderBy: { id: 'asc' } }), before);
    } finally {
      await owner.execute(Prisma.sql `ALTER TABLE asl.totw_votes DROP CONSTRAINT voting_queries_reject`);
    }

    await owner.execute(Prisma.sql `UPDATE asl.totw_voting_periods SET opens_at=clock_timestamp()+interval '30 seconds' WHERE id=${periodId}::uuid`);
    assert.equal((await call('PUT', `${path}/votes`, votes, alice)).statusCode, 409);
    await owner.execute(Prisma.sql `UPDATE asl.totw_voting_periods SET opens_at=clock_timestamp()-interval '1 minute',closes_at=clock_timestamp()+interval '300 milliseconds' WHERE id=${periodId}::uuid`);
    const lock = await locks.connect();
    try {
      await lock.query('BEGIN');
      await lock.query('SELECT id FROM asl.totw_voting_periods WHERE id=$1 FOR UPDATE', [periodId]);
      const pending = call('PUT', `${path}/votes`, votes, alice);
      await new Promise(resolve => setTimeout(resolve, 700));
      await lock.query('COMMIT');
      const closed = await pending;
      assert.equal(closed.statusCode, 409, closed.body);
    } finally { await lock.query('ROLLBACK'); lock.release(); }
    assert.deepEqual(await owner.client.totwVote.findMany({ where: { period_id: periodId }, orderBy: { id: 'asc' } }), before);
    assert.equal((await call('PATCH', path, { status: 'closed' })).statusCode, 200);
    assert.equal((await call('GET', `${path}/votes/me`, undefined, alice)).json().length, 4);
  } finally {
    await owner.execute(Prisma.sql `ALTER TABLE asl.totw_votes DROP CONSTRAINT IF EXISTS voting_queries_reject`);
    if (periodId) await owner.client.totwVotingPeriod.deleteMany({ where: { id: periodId } });
    await owner.client.account.deleteMany({ where: { id: defenderId } });
    await owner.execute(Prisma.sql `DELETE FROM auth.users WHERE id=${defenderId}::uuid`);
    await app.close(); await db.close(); await owner.close(); await locks.end();
  }
});
