import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createApp } from '../helper.js';
import { connectDatabase, Prisma } from '../../plugins/db/client.js';

const teamPath = (id: string) => `/api/teams/${encodeURIComponent(id)}`;

test('team HTTP visibility, authorization and roster rollback preserve actual database state', {
  skip: !process.env.API_TEST_DATABASE_URL,
}, async t => {
  assert.ok(process.env.API_TEST_ADMIN_DATABASE_URL);
  const db = connectDatabase(process.env.API_TEST_DATABASE_URL!);
  const owner = connectDatabase(process.env.API_TEST_ADMIN_DATABASE_URL);
  const app = createApp({ db, verify: async id => ({ id, sessionId: id, claims: { sub: id } }) });
  const playerId = randomUUID(), name = `Team' OR true -- ${playerId.slice(0, 8)}`;
  const admin = '33333333-3333-4333-8333-333333333333';
  const prefix = `team_queries_${playerId}_`, source = `${prefix}source' OR true --`, target = `${prefix}target`;
  const call = (method: 'GET' | 'POST' | 'PATCH', path: string, payload?: object, actor?: string) => app.inject({
    method, url: path, payload, headers: actor ? { authorization: `Bearer ${actor}` } : {},
  });
  try {
    await owner.execute(Prisma.sql`INSERT INTO auth.users(id) VALUES(${playerId}::uuid)`);
    await owner.execute(Prisma.sql`INSERT INTO auth.sessions(id,user_id) VALUES(${playerId}::uuid,${playerId}::uuid)`);
    await owner.execute(Prisma.sql`INSERT INTO auth_gateway.memberships(user_id,discord_user_id,eligible,valid_until) VALUES(${playerId}::uuid,'team-test',true,now()+interval '1 hour')`);
    await db.client.account.create({ data: { id: playerId, username: name, username_lower: name.toLowerCase(), strikers_id: playerId, team_id: source } });
    await db.client.team.createMany({ data: [
      { id: source, name: 'Source', tag: 'SRC', owner_username: 'Captain', status: 'approved', members: ['Captain', name], lineup: { gk: name } },
      { id: target, name: 'Target', tag: 'TGT', owner_username: 'Target Captain', status: 'approved', members: ['Target Captain'] },
      { id: `${prefix}owner`, name: 'Owned', tag: 'OWN', owner_username: name.toUpperCase(), status: 'pending' },
      { id: `${prefix}legacy`, name: 'Legacy', tag: 'LEG', owner_username: 'Other', status: 'pending', pending_members: [name.toUpperCase()] },
      { id: `${prefix}declined`, name: 'Declined', tag: 'DEC', owner_username: 'Other', status: 'rejected', pending_members: [{ username: name.toUpperCase(), status: 'declined' }] },
      { id: `${prefix}hidden`, name: 'Hidden', tag: 'HID', owner_username: 'Other', status: 'pending' },
    ] });

    await t.test('literal IDs, case folded legacy invitations and nonowner authorization', async () => {
      const visible = await call('GET', '/api/teams', undefined, playerId);
      assert.equal(visible.statusCode, 200, visible.body);
      assert.deepEqual(visible.json<Array<{ id: string }>>().filter(row => row.id.startsWith(prefix)).map(row => row.id).toSorted((a, b) => a.localeCompare(b)), [source, target, `${prefix}owner`, `${prefix}legacy`, `${prefix}declined`].toSorted((a, b) => a.localeCompare(b)));
      const anonymous = await call('GET', '/api/teams');
      assert.deepEqual(anonymous.json<Array<{ id: string }>>().filter(row => row.id.startsWith(prefix)).map(row => row.id).toSorted((a, b) => a.localeCompare(b)), [source, target].toSorted((a, b) => a.localeCompare(b)));
      assert.equal((await call('GET', teamPath(source))).json().id, source);
      assert.equal((await call('GET', teamPath(`${prefix}declined`), undefined, playerId)).statusCode, 200);
      assert.equal((await call('GET', teamPath(`${prefix}hidden`), undefined, playerId)).statusCode, 404);
      assert.equal((await call('PATCH', teamPath(source), { name: 'Taken Over' }, playerId)).statusCode, 403);
      assert.equal((await db.client.team.findUniqueOrThrow({ where: { id: source } })).name, 'Source');
    });

    await t.test('a database transfer failure rolls back both rosters, lineup and account membership', async () => {
      const beforeTeams = await db.client.team.findMany({ where: { id: { in: [source, target] } }, orderBy: { id: 'asc' } });
      const beforeAccount = await db.client.account.findUniqueOrThrow({ where: { id: playerId } });
      const beforeTransfers = await db.client.transfer.findMany({ where: { player_username: name } });
      await owner.execute(Prisma.sql`CREATE FUNCTION public.team_queries_reject_transfer() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected transfer failure'; END $$`);
      await owner.execute(Prisma.sql`CREATE TRIGGER team_queries_reject_transfer BEFORE INSERT ON public.transfers FOR EACH ROW EXECUTE FUNCTION public.team_queries_reject_transfer()`);
      try {
        const failed = await call('POST', `${teamPath(target)}/membership`, { action: 'join', accountId: playerId }, admin);
        assert.equal(failed.statusCode, 503, failed.body);
        assert.deepEqual(await db.client.team.findMany({ where: { id: { in: [source, target] } }, orderBy: { id: 'asc' } }), beforeTeams);
        assert.deepEqual(await db.client.account.findUniqueOrThrow({ where: { id: playerId } }), beforeAccount);
        assert.deepEqual(await db.client.transfer.findMany({ where: { player_username: name } }), beforeTransfers);
      } finally {
        await owner.execute(Prisma.sql`DROP TRIGGER IF EXISTS team_queries_reject_transfer ON public.transfers`);
        await owner.execute(Prisma.sql`DROP FUNCTION IF EXISTS public.team_queries_reject_transfer()`);
      }
      const success = await call('POST', `${teamPath(target)}/membership`, { action: 'join', accountId: playerId }, admin);
      assert.equal(success.statusCode, 200, success.body);
      assert.deepEqual((await db.client.team.findUniqueOrThrow({ where: { id: source } })).members, ['Captain']);
      assert.deepEqual((await db.client.team.findUniqueOrThrow({ where: { id: source } })).lineup, {});
      assert.deepEqual((await db.client.team.findUniqueOrThrow({ where: { id: target } })).members, ['Target Captain', name]);
      assert.equal((await db.client.account.findUniqueOrThrow({ where: { id: playerId } })).team_id, target);
      assert.equal(await db.client.transfer.count({ where: { player_username: name, from_team_id: source, to_team_id: target } }), 1);
    });
  } finally {
    try {
    await owner.execute(Prisma.sql`DROP TRIGGER IF EXISTS team_queries_reject_transfer ON public.transfers`);
    await owner.execute(Prisma.sql`DROP FUNCTION IF EXISTS public.team_queries_reject_transfer()`);
    await db.client.transfer.deleteMany({ where: { player_username: name } });
    await db.client.account.deleteMany({ where: { id: playerId } });
    await db.client.team.deleteMany({ where: { id: { startsWith: prefix } } });
    await owner.execute(Prisma.sql`DELETE FROM auth.sessions WHERE user_id=${playerId}::uuid`);
    await owner.execute(Prisma.sql`DELETE FROM auth.users WHERE id=${playerId}::uuid`);
    } finally {
      await Promise.all([app.close(), db.close(), owner.close()]);
    }
  }
});
