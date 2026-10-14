import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Database, Row } from '../../plugins/db/client.js';
import { Prisma } from '../../plugins/db/client.js';
import { loadTeamRecords } from '../../routes/matches/records.js';
import { accountOpponents } from '../../routes/accounts/history.js';

const id = '11111111-1111-4111-8111-111111111111';

test('team records are aggregated after first-record deduplication and normalized as numbers', async () => {
  let query = '';
  const database: Database = {
    query: async <T extends Row>(sql: Prisma.Sql) => {
      query = sql.sql;
      return [{ teamId: 'team-1', season: 'S2', played: 2, w: 1, d: 1, l: 0, gf: 4, ga: 2, gd: 2, pts: 4 }] as T[];
    },
    execute: async () => 0,
    transaction: async work => work(database),
    close: async () => {},
  };
  assert.deepEqual(await loadTeamRecords(database), [{ teamId: 'team-1', season: 'S2', played: 2, w: 1, d: 1, l: 0, gf: 4, ga: 2, gd: 2, pts: 4 }]);
  assert.match(query, /row_number\(\) OVER \(PARTITION BY/);
  assert.match(query, /ORDER BY created_at, account_id, ordinality/);
  assert.match(query, /UNION ALL/);
});

test('opponent aggregates return bounded numeric summaries', async () => {
  const database: Database = {
    query: async <T extends Row>() => [{ opponent: 'Blue', games: 2, w: 1, d: 1, l: 0, goals: '3', assists: '2', motm: 1 }] as T[],
    execute: async () => 0,
    transaction: async work => work(database),
    close: async () => {},
  };
  assert.deepEqual(await accountOpponents(database, id), [{ opponent: 'Blue', games: 2, w: 1, d: 1, l: 0, goals: 3, assists: 2, motm: 1 }]);
});
