import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createApp } from '../helper.js';
import { collectPage } from '../responses.js';
import { connectDatabase, Prisma } from '../../plugins/db/client.js';

const teamPath = (id: string) => `/api/teams/${encodeURIComponent(id)}`;

test('UUID invitations, pending captains, roster rollback and history restrictions preserve database state', {
  skip: !process.env.API_TEST_DATABASE_URL || !process.env.API_TEST_ADMIN_DATABASE_URL,
}, async t => {
  const db = connectDatabase(process.env.API_TEST_DATABASE_URL!);
  const owner = connectDatabase(process.env.API_TEST_ADMIN_DATABASE_URL!);
  const app = createApp({ db, verify: async id => ({ id, sessionId: id, claims: { sub: id } }) });
  const captain = randomUUID(), invited = randomUUID();
  const admin = '33333333-3333-4333-8333-333333333333';
  const prefix = `team_queries_${captain}_`, pending = `${prefix}pending`, target = `${prefix}target`, hidden = `${prefix}hidden`;
  const names = new Map([[captain, `captain_${captain.slice(0, 8)}`], [invited, `invite_${invited.slice(0, 8)}`]]);
  const call = (method: 'GET' | 'POST' | 'DELETE', path: string, payload?: object, actor?: string) => app.inject({
    method, url: path, payload, headers: actor ? { authorization: `Bearer ${actor}` } : {},
  });
  try {
    for (const id of [captain, invited]) {
      await owner.execute(Prisma.sql`INSERT INTO auth.users(id) VALUES(${id}::uuid)`);
      await owner.execute(Prisma.sql`INSERT INTO auth.sessions(id,user_id) VALUES(${id}::uuid,${id}::uuid)`);
      await owner.execute(Prisma.sql`INSERT INTO auth_gateway.memberships(user_id,discord_user_id,eligible,valid_until) VALUES(${id}::uuid,${id},true,now()+interval '1 hour')`);
      await db.client.account.create({ data: { id, username: names.get(id)!, strikers_id: id } });
    }
    await db.client.team.createMany({ data: [
      { id: pending, name: 'Pending', tag: 'PEN', owner_account_id: captain, status: 'pending', lineup: { gk: names.get(captain)! } },
      { id: target, name: 'Target', tag: 'TGT', owner_account_id: admin, status: 'approved' },
      { id: hidden, name: 'Hidden', tag: 'HID', owner_account_id: admin, status: 'pending' },
    ] });
    await db.client.teamJoinRequest.create({ data: { team_id: pending, account_id: invited, details: { source: 'invitation' } } });
    await t.test('pending captain is visible without active membership; invitations follow account UUID', async () => {
      const shown = await call('GET', teamPath(pending), undefined, captain);
      assert.equal(shown.statusCode, 200, shown.body);
      assert.deepEqual(await collectPage(app, `${teamPath(pending)}/members`, { authorization: `Bearer ${captain}` }), [names.get(captain)]);
      assert.equal((await db.client.account.findUniqueOrThrow({ where: { id: captain } })).team_id, null);
      await db.client.account.update({ where: { id: invited }, data: { username: `${names.get(invited)}_new` } });
      assert.equal((await call('GET', teamPath(pending), undefined, invited)).statusCode, 200);
      assert.equal((await call('GET', teamPath(hidden), undefined, invited)).statusCode, 404);
      const accepted = await call('POST', `${teamPath(pending)}/invitation`, { accept: true }, invited);
      assert.equal(accepted.statusCode, 200, accepted.body);
      assert.equal((await db.client.account.findUniqueOrThrow({ where: { id: invited } })).team_id, null);
      const invitation = await db.client.teamJoinRequest.findFirstOrThrow({ where: { team_id: pending, account_id: invited } });
      assert.equal(invitation.status, 'accepted');
      assert.ok(invitation.reviewed_at);
      const approved = await call('POST', `${teamPath(pending)}/review`, { status: 'approved' }, admin);
      assert.equal(approved.statusCode, 200, approved.body);
      assert.equal(await db.client.account.count({ where: { team_id: pending } }), 2);
      assert.equal(await db.client.transfer.count({ where: { to_team_id: pending } }), 2);
    });
    await t.test('transfer failure rolls back membership and lineup; referenced team delete returns conflict', async () => {
      await owner.execute(Prisma.sql`CREATE FUNCTION asl.team_queries_reject_transfer() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected transfer failure'; END $$`);
      await owner.execute(Prisma.sql`CREATE TRIGGER team_queries_reject_transfer BEFORE INSERT ON asl.transfers FOR EACH ROW EXECUTE FUNCTION asl.team_queries_reject_transfer()`);
      const transfers = await db.client.transfer.count({ where: { player_account_id: captain } });
      try {
        const failed = await call('POST', `${teamPath(target)}/membership`, { action: 'join', accountId: captain }, admin);
        assert.equal(failed.statusCode, 503, failed.body);
        assert.equal((await db.client.account.findUniqueOrThrow({ where: { id: captain } })).team_id, pending);
        assert.deepEqual((await db.client.team.findUniqueOrThrow({ where: { id: pending } })).lineup, { gk: names.get(captain) });
        assert.equal(await db.client.transfer.count({ where: { player_account_id: captain } }), transfers);
      } finally {
        await owner.execute(Prisma.sql`DROP TRIGGER team_queries_reject_transfer ON asl.transfers`);
        await owner.execute(Prisma.sql`DROP FUNCTION asl.team_queries_reject_transfer()`);
      }
      const deleted = await call('DELETE', teamPath(pending), undefined, admin);
      assert.equal(deleted.statusCode, 409, deleted.body);
      assert.equal(deleted.json().error, 'team_has_history');
      assert.equal(await db.client.account.count({ where: { team_id: pending } }), 2);
      assert.equal(await db.client.transfer.count({ where: { player_account_id: captain } }), transfers);
      const success = await call('POST', `${teamPath(target)}/membership`, { action: 'join', accountId: captain }, admin);
      assert.equal(success.statusCode, 200, success.body);
      assert.deepEqual((await db.client.team.findUniqueOrThrow({ where: { id: pending } })).lineup, {});
      const transfer = await db.client.transfer.findFirstOrThrow({ where: { player_account_id: captain, to_team_id: target } });
      assert.equal(transfer.player_username_snapshot, names.get(captain));
      assert.equal(transfer.created_by_account_id, admin);
    });
  } finally {
    try {
      await owner.execute(Prisma.sql`DROP TRIGGER IF EXISTS team_queries_reject_transfer ON asl.transfers`);
      await owner.execute(Prisma.sql`DROP FUNCTION IF EXISTS asl.team_queries_reject_transfer()`);
      await db.client.transfer.deleteMany({ where: { player_account_id: { in: [captain, invited] } } });
      await db.client.team.deleteMany({ where: { id: { startsWith: prefix } } });
      await db.client.account.deleteMany({ where: { id: { in: [captain, invited] } } });
      for (const id of [captain, invited]) {
        await owner.execute(Prisma.sql`DELETE FROM auth.sessions WHERE user_id=${id}::uuid`);
        await owner.execute(Prisma.sql`DELETE FROM auth.users WHERE id=${id}::uuid`);
      }
    } finally { await Promise.all([app.close(), db.close(), owner.close()]); }
  }
});
