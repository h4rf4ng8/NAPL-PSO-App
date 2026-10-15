import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FastifyRequest } from 'fastify';
import type { Database, Row } from '../../plugins/db/client.js';
import { Prisma } from '../../plugins/db/client.js';
import { getCurrentAccount } from '../../routes/accounts/queries.js';
import { loadAccountSummaries } from '../../routes/accounts/summaries.js';

const accountId = '11111111-1111-4111-8111-111111111111';

function request(identity: FastifyRequest['identity']): FastifyRequest {
  return { identity, userRoles: [] } as FastifyRequest;
}

function accountDatabase(username: () => string): Database {
  const database: Database = {
    query: async <T extends Row>(_sql: Prisma.Sql) => [{
      id: accountId, username: username(), position: 'CM', team_id: null,
      image_url: null, country: null, stats: {}, awards: [], championships: [], totw_until: null,
      cheater: false, strikers_id: null, steam_url: null, created_at: new Date(0), season_stats: { all: {} },
    }] as T[],
    execute: async () => 0,
    transaction: async work => work(database),
    close: async () => {},
  };
  return database;
}

test('separate summary reads and database instances see current account data', async () => {
  let username = 'Alice';
  const firstInstance = accountDatabase(() => username);
  assert.equal((await loadAccountSummaries(firstInstance))[0]?.username, 'Alice');

  username = 'Alicia';
  assert.equal((await loadAccountSummaries(firstInstance))[0]?.username, 'Alicia');

  const secondInstance = accountDatabase(() => 'Bob');
  assert.equal((await loadAccountSummaries(secondInstance))[0]?.username, 'Bob');
});

test('current account ranking uses one population read and keeps private fields UUID-scoped', async () => {
  const statements: Prisma.Sql[] = [];
  const db: Database = {
    query: async <T extends Row>(sql: Prisma.Sql) => {
      statements.push(sql);
      if (sql.sql.includes('public."settings"')) return [] as T[];
      if (sql.sql.includes('SELECT email, pending_image_url')) return [{ email: 'alice@example.test', pending_image_url: 'private-image' }] as T[];
      return [{
        id: accountId, username: 'Alice', position: 'CM', team_id: null, image_url: null, country: null,
        stats: {}, awards: [], championships: [], totw_until: null, cheater: false, strikers_id: null,
        steam_url: null, created_at: new Date(0), season_stats: { all: {} },
      }] as T[];
    },
    execute: async () => 0,
    transaction: async work => work(db),
    close: async () => {},
  };
  const result = await getCurrentAccount(db, request({ id: accountId, sessionId: 'session', claims: {} }));
  const summarySql = statements.find(sql => sql.sql.includes('AS season_stats'))!;
  const privateSql = statements.find(sql => sql.sql.includes('SELECT email, pending_image_url'))!;
  const settingsSql = statements.find(sql => sql.sql.includes('public."settings"'))!;
  assert.equal(result?.email, 'alice@example.test');
  assert.equal(result?.pendingImageUrl, 'private-image');
  assert.equal(result?.id, accountId);
  assert.match(summarySql.sql, /FROM public\.accounts a ORDER BY/);
  assert.match(summarySql.sql, /jsonb_array_elements/);
  assert.doesNotMatch(summarySql.sql, /a\.email|a\.pending_image_url/);
  assert.match(privateSql.sql, /SELECT email, pending_image_url/);
  assert.ok(privateSql.values.includes(accountId));
  assert.ok(settingsSql.values.includes('position_weights'));
});

test('current account returns null for a missing row and rejects absent authentication without querying', async () => {
  let calls = 0;
  const db: Database = {
    query: async <T extends Row>() => { calls++; return [] as T[]; },
    execute: async () => 0,
    transaction: async work => work(db),
    close: async () => {},
  };
  assert.equal(await getCurrentAccount(db, request({ id: accountId, sessionId: 'session', claims: {} })), null);
  assert.equal(calls, 2, 'one population read and one weighting read');
  await assert.rejects(getCurrentAccount(db, request(null)), { status: 401, code: 'authentication_required' });
  assert.equal(calls, 2);
});
