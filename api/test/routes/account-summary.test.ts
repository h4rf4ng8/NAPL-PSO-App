import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Database, Row } from '../../plugins/db/client.js';
import { Prisma } from '../../plugins/db/client.js';
import { connectDatabase } from '../../plugins/db/client.js';
import { loadAccountSummaries } from '../../routes/accounts/summaries.js';
import { accountMatches, accountOpponents } from '../../routes/accounts/history.js';

test('account summary projection aggregates season stats without selecting history or private columns', async () => {
  let query = '';
  const stats = { games: 4, wins: 2, draws: 1, losses: 1, goals: 5, assists: 3, passes: 22, tackles: 4, deflects: 1, catches: 2, cleanSheets: 1, motm: 1 };
  const database: Database = {
    query: async <T extends Row>(sql: Prisma.Sql) => {
      query = sql.sql;
      return [{
        id: '11111111-1111-4111-8111-111111111111', username: 'Alice', position: 'CM', team_id: null,
        image_url: null, country: 'US', stats, awards: [], championships: [], totw_until: null,
        cheater: false, strikers_id: 1234, steam_url: null, created_at: new Date(0), email: 'private@example.test', pending_image_url: 'private-image',
        season_stats: { all: stats, S2: stats },
      }] as T[];
    },
    execute: async () => 0,
    transaction: async work => work(database),
    close: async () => {},
  };
  const [row] = await loadAccountSummaries(database);
  assert.deepEqual(row?.matches, []);
  assert.deepEqual(row?.seasonStats, { all: stats, S2: stats });
  assert.equal(row?.strikersId, '1234');
  assert.equal(row?.email, undefined);
  assert.equal(row?.pendingImageUrl, undefined);
  assert.match(query, /jsonb_array_elements/);
  assert.match(query, /floor\(sum\(/);
  assert.match(query, /ORDER BY a\.created_at, a\.id/);
  assert.doesNotMatch(query, /SELECT \*/);
  assert.doesNotMatch(query, /a\.email|a\.pending_image_url/);
});

test('PostgreSQL account summary season totals match the web aggregation rules', {
  skip: !process.env.API_TEST_DATABASE_URL,
}, async () => {
  const database = connectDatabase(process.env.API_TEST_DATABASE_URL!);
  const rollback = new Error('rollback account-summary fixture');
  try {
    await assert.rejects(database.transaction(async tx => {
      const id = '55555555-5555-4555-8555-555555555555';
      const matches = [
        { id: 's2-a', date: 1, season: 'S2', opponent: 'Zulu', result: 'W', goals: 2, assists: 1, passes: 20, tackles: 3, deflects: 0, catches: 0, cleanSheet: true, motm: true },
        { id: 's2-b', date: 2, season: 'S2', opponent: 'Zulu', result: 'D', goals: 1, assists: 0, passes: 21, tackles: 1, deflects: 2, catches: 1, cleanSheet: false, motm: 1 },
        { id: 's1-a', date: 3, opponent: 'Red', result: 'X', goals: 0, assists: 0, passes: 3, tackles: 0, deflects: 0, catches: 0, cleanSheet: false, motm: false },
      ];
      const all = { games: 7, wins: 4, draws: 2, losses: 1, goals: 18, assists: 13, passes: 26, tackles: 8, deflects: 4, catches: 3, cleanSheets: 2, motm: 4, historical: 9 };
      await tx.execute(Prisma.sql`UPDATE public.accounts SET matches=${JSON.stringify(matches)}::jsonb, stats=${JSON.stringify(all)}::jsonb WHERE id=${id}::uuid`);
      const rows = await loadAccountSummaries(tx);
      const alice = rows.find(row => row.id === id);
      assert.deepEqual(alice?.stats, all);
      assert.deepEqual(alice?.seasonStats, {
        all,
        S2: { games: 2, wins: 1, draws: 1, losses: 0, goals: 3, assists: 1, passes: 21, tackles: 4, deflects: 2, catches: 1, cleanSheets: 1, motm: 2 },
        S1: { games: 1, wins: 0, draws: 1, losses: 0, goals: 0, assists: 0, passes: 3, tackles: 0, deflects: 0, catches: 0, cleanSheets: 0, motm: 0 },
      });
      assert.equal(alice?.email, undefined);
      assert.deepEqual(alice?.matches, []);
      const legacyPage = await accountMatches(tx, { id, season: 'S1' });
      assert.equal(legacyPage.nodes.length, 1);
      assert.equal(legacyPage.nodes[0]?.season, 'S1');
      const opponents = await accountOpponents(tx, id);
      assert.deepEqual(opponents.map(row => row.opponent), ['Zulu', 'Red']);
      throw rollback;
    }), error => error === rollback);
  } finally {
    await database.close();
  }
});
