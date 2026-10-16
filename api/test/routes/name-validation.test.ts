import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkBlockedName } from '../../routes/name-validation.js';
import { createApp } from '../helper.js';
import { Prisma, type Database, type Row } from '../../plugins/db/client.js';
import { provisionAccount } from '../../routes/accounts/provision.js';

test('blocked name check catches leetspeak, separators, and repeated letters', () => {
  for (const name of ['sh1t', 'f_u_c_k', 'fuuuuck', 'x_cunt_x'])
    assert.ok(checkBlockedName(name), `${name} should be blocked`);
});

test('blocked name check keeps short words within ordinary names allowed', () => {
  assert.equal(checkBlockedName('Scunthorpe'), null);
  assert.equal(checkBlockedName('Passionate'), null);
});

test('provisioning replaces a blocked OAuth username with the safe fallback', async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const database: Database = {
    query: async <T extends Row>(sql: Prisma.Sql) => (sql.sql.includes('INSERT INTO')
      ? [{ id, username: 'Player', username_lower: 'player' }]
      : []) as T[],
    execute: async () => 0,
    transaction: async work => work(database),
    close: async () => {},
  };
  const account = await provisionAccount(database, {
    id, sessionId: id, claims: { sub: id, user_metadata: { username: 'sh1t' } },
  });
  assert.equal(account.username, 'Player');
});

test('API rejects blocked account and team names and keeps rename permissions', async () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  let adminMode = false;
  let transactionCalls = 0;
  const database: Database = {
    query: async <T extends Row>(sql) => {
      const rows: Row[] = [];
      if (sql.sql.includes('auth_gateway.memberships')) rows.push({ eligible: true, fresh: true });
      if (adminMode && sql.sql.includes('auth_gateway.user_roles')) rows.push({ role: 'admin' });
      if (sql.sql.includes('session_active')) rows.push({ active: true });
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
    const rename = await call('POST', `/api/accounts/${userId}/rename`, { username: 'Sh1t' });
    assert.equal(rename.statusCode, 400);
    assert.match(rename.json<{ message: string }>().message, /username isn't allowed/i);
    assert.equal((await call('POST', '/api/accounts/22222222-2222-4222-8222-222222222222/rename', { username: 'Alicia' })).statusCode, 403);
    assert.equal(transactionCalls, 0, 'blocked account names fail before writes');
    adminMode = true;
    const adminRename = await app.inject({
      method: 'POST', url: `/api/accounts/${userId}/rename`,
      headers: { authorization: `Bearer ${userId}` }, payload: { username: 'Cunt' },
    });
    assert.equal(transactionCalls, 1, `admins pass the blocked-name check and reach the write; response=${adminRename.statusCode}`);
    assert.equal((await call('POST', '/api/teams', { id: 'blocked-name', name: 'F_u_c_k FC', tag: 'FC' })).statusCode, 400);
    assert.equal((await call('POST', '/api/teams', { id: 'blocked', name: 'Fine Team', tag: 'SH1T' })).statusCode, 400);
    const update = await call('PATCH', '/api/teams/team', { name: 'Fine Team', tag: 'FUCK' });
    assert.equal(update.statusCode, 400);
    assert.match(update.json<{ message: string }>().message, /team name or tag/i);
    assert.equal(transactionCalls, 1, 'blocked team names fail before writes');
  } finally {
    await app.close();
  }
});
