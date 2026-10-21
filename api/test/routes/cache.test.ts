import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Database, Row } from '../../plugins/db/client.js';
import { Prisma } from '../../plugins/db/client.js';
import { getCurrentAccount } from '../../routes/accounts/queries.js';
import { currentAccountDto } from '../../routes/accounts/dto.js';
import { createApp } from '../helper.js';
import { loadAccountSummaries } from '../../routes/accounts/summaries.js';

const accountId = '11111111-1111-4111-8111-111111111111';

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
  const privateReads: Array<{ where: { id: string }; select: { email: boolean; pending_image_url: boolean } }> = [];
  const settingsReads: string[] = [];
  const db: Database = {
    client: {
      setting: { findUnique: async ({ where }: { where: { key: string } }) => { settingsReads.push(where.key); return null; } },
      account: { findUnique: async (args: typeof privateReads[number]) => {
        privateReads.push(args);
        return { email: 'alice@example.test', pending_image_url: 'private-image' };
      } },
    } as unknown as Database['client'],
    query: async <T extends Row>(sql: Prisma.Sql) => {
      statements.push(sql);
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
  const result = currentAccountDto(await getCurrentAccount(db, accountId), []);
  const summarySql = statements.find(sql => sql.sql.includes('AS season_stats'))!;
  assert.equal(result?.email, 'alice@example.test');
  assert.match(String(result?.pendingImageUrl), /^\/api\/media\/accounts\/[^/]+\/pending-image\?v=[\w-]{12}$/);
  assert.equal(result?.id, accountId);
  assert.match(summarySql.sql, /FROM asl\.accounts a ORDER BY/);
  assert.match(summarySql.sql, /jsonb_array_elements/);
  assert.doesNotMatch(summarySql.sql, /a\.email|a\.pending_image_url/);
  assert.equal(statements.length, 1, 'one population read');
  assert.deepEqual(privateReads, [{ where: { id: accountId }, select: { email: true, pending_image_url: true } }]);
  assert.deepEqual(settingsReads, ['position_weights']);
});

test('current account returns null for a missing row and rejects absent authentication without querying', async () => {
  let calls = 0;
  const db: Database = {
    client: { setting: { findUnique: async () => { calls++; return null; } } } as unknown as Database['client'],
    query: async <T extends Row>() => { calls++; return [] as T[]; },
    execute: async () => 0,
    transaction: async work => work(db),
    close: async () => {},
  };
  assert.equal(await getCurrentAccount(db, accountId), null);
  assert.equal(calls, 2, 'one population read and one weighting read');
  const app = createApp({ db, verify: async id => ({ id, sessionId: id, claims: { sub: id } }) });
  try {
    const response = await app.inject('/api/accounts/me');
    assert.equal(response.statusCode, 401);
    assert.equal(response.json().error, 'authentication_required');
    assert.equal(calls, 2);
  } finally { await app.close(); }
});
