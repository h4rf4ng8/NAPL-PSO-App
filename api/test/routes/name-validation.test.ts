import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkBlockedName } from '../../routes/name-validation.js';
import { createApp } from '../helper.js';
import { type Database, type Row } from '../../plugins/db/client.js';
import { provisionAccount } from '../../routes/accounts/queries.js';

test('blocked name check catches leetspeak, separators, and repeated letters', () => {
  for (const name of ['sh1t', 'f_u_c_k', 'fuuuuck', 'x_cunt_x'])
    assert.ok(checkBlockedName(name), `${name} should be blocked`);
});

test('blocked name check keeps short words within ordinary names allowed', () => {
  assert.equal(checkBlockedName('Scunthorpe'), null);
  assert.equal(checkBlockedName('Passionate'), null);
});

test('provisioning requires a verified Discord handle and never writes generated username_lower', async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  let saved: Record<string, unknown> | undefined;
  const database: Database = {
    client: { account: {
      findUnique: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => { saved = data; return { id, ...data }; },
    } } as unknown as Database['client'],
    query: async () => [], execute: async () => 0,
    transaction: async work => work(database), close: async () => {},
  };
  const identity = { id, sessionId: id, claims: { sub: id, user_metadata: { username: 'untrusted' } } };
  await assert.rejects(provisionAccount(database, identity), /discord_profile_required/);
  await assert.rejects(provisionAccount(database, identity, 'Invalid Name'), /invalid_discord_username/);
  const username = 'a'.repeat(32);
  const account = await provisionAccount(database, identity, username);
  assert.equal(account.username, username);
  assert.equal(saved?.username_lower, undefined);
});

test('a matching Discord handle cannot claim an existing account or its team ownership', async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const existing = { id: '22222222-2222-4222-8222-222222222222', username: 'taken_handle', team_id: 'owned-team' };
  let writes = 0;
  const database: Database = {
    client: { account: {
      findUnique: async ({ where }: { where: { id?: string } }) => where.id ? null : existing,
      create: async () => { writes++; throw new Error('must not create'); },
      update: async () => { writes++; throw new Error('must not attach'); },
    } } as unknown as Database['client'],
    query: async () => [], execute: async () => 0,
    transaction: async work => work(database), close: async () => {},
  };
  await assert.rejects(provisionAccount(database, { id, sessionId: id, claims: { sub: id } }, 'taken_handle'), /discord_username_conflict/);
  assert.equal(writes, 0, 'identity stays attached to its verified UUID, never a handle match');
  assert.equal(existing.team_id, 'owned-team');
});

test('API rejects blocked team names and exposes no manual rename endpoint', async () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  let adminMode = false;
  let transactionCalls = 0;
  const database: Database = {
    query: async <T extends Row>(sql) => {
      const rows: Row[] = [];
      if (sql.sql.includes('auth_gateway.memberships')) rows.push({ eligible: true, fresh: true });
      if (adminMode && sql.sql.includes('auth_gateway.user_roles')) rows.push({ role: 'admin' });
      return rows as T[];
    },
    execute: async () => 0,
    transaction: async () => {
      transactionCalls++;
      throw new Error('The mock stops before any write.');
    },
    close: async () => {},
  };
  const app = createApp({
    db: database,
    verify: async token => ({ id: token, sessionId: token, claims: { sub: token } }),
  });
  try {
    const call = (method: 'POST' | 'PATCH', url: string, payload: object) => app.inject({
      method, url, headers: { authorization: `Bearer ${userId}` }, payload,
    });
    assert.equal((await call('POST', `/api/accounts/${userId}/rename`, { username: 'Alicia' })).statusCode, 404);
    assert.equal(transactionCalls, 0);
    adminMode = true;
    assert.equal((await call('POST', '/api/teams', { id: 'blocked-name', name: 'F_u_c_k FC', tag: 'FC' })).statusCode, 400);
    assert.equal((await call('POST', '/api/teams', { id: 'blocked', name: 'Fine Team', tag: 'SH1T' })).statusCode, 400);
    const update = await call('PATCH', '/api/teams/team', { name: 'Fine Team', tag: 'FUCK' });
    assert.equal(update.statusCode, 400);
    assert.match(update.json<{ message: string }>().message, /team name or tag/i);
    assert.equal(transactionCalls, 0, 'blocked team names fail before writes');
  } finally {
    await app.close();
  }
});
