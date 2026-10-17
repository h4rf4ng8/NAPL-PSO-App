import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../helper.js';
import { type Database, type Row, Prisma } from '../../plugins/db/client.js';
import { HttpError } from '../../plugins/auth/identity.js';
import { calculateCardStats, calculateRankings, DEFAULT_POSITION_WEIGHTS, enrichAccounts } from '../../routes/accounts/ranking.js';
import { getSetting } from '../../routes/settings/queries.js';

const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
const positionWeights = { ST: { goalsPerGame: 1 } };
const zeroStats = { games: 0, wins: 0, losses: 0, draws: 0, goals: 0, assists: 0, passes: 0, tackles: 0, deflects: 0, catches: 0, cleanSheets: 0, motm: 0 };
const accounts: Row[] = [
  {
    id: alice, username: 'Alice', username_lower: 'alice', position: 'ST', team_id: null, image_url: null, country: null,
    stats: { games: 10, wins: 7, losses: 2, draws: 1, goals: 10, assists: 2, passes: 20, tackles: 5, deflects: 0, catches: 0, cleanSheets: 0, motm: 0 },
    season_stats: { S1: { games: 10, wins: 7, losses: 2, draws: 1, goals: 10, assists: 2, passes: 2, tackles: 5, deflects: 0, catches: 0, cleanSheets: 0, motm: 0 } },
    matches: [{ id: 'match-1', season: 'S1' }], awards: [], championships: [], totw_until: null, cheater: false, strikers_id: null,
    steam_url: null, created_at: new Date(0), email: 'private@example.test', pending_image_url: 'secret-image', private_note: 'internal',
  },
  {
    id: bob, username: 'Bob', username_lower: 'bob', position: 'ST', team_id: null, image_url: null, country: null,
    stats: { games: 10, wins: 2, losses: 7, draws: 1, goals: 0, assists: 1, passes: 10, tackles: 1, deflects: 0, catches: 0, cleanSheets: 0, motm: 0 },
    season_stats: { S2: { games: 10, wins: 2, losses: 7, draws: 1, goals: 0, assists: 1, passes: 1, tackles: 1, deflects: 0, catches: 0, cleanSheets: 0, motm: 0 } },
    matches: [], awards: [], championships: [], totw_until: null, cheater: false, strikers_id: null,
    steam_url: null, created_at: new Date(1),
  },
];

function appFor() {
  const seen = new Map<string, number>();
  const database: Database = {
    client: {
      setting: { findUnique: async ({ where }: { where: { key: string } }) => ({ key: where.key, value: JSON.stringify(positionWeights) }) },
      team: { findMany: async () => [] },
      account: { findUnique: async ({ where }: { where: { id?: string; username_lower?: string } }) =>
        accounts.find(row => where.id ? row.id === where.id : row.username_lower === where.username_lower) ?? null },
    } as unknown as Database['client'],
    query: async <T extends Row>(sql: Prisma.Sql) => {
      const key = sql.sql.replaceAll(/\s+/g, ' ').trim();
      seen.set(key, (seen.get(key) ?? 0) + 1);
      if (key.includes('public."settings"')) return [{ key: sql.values[0], value: JSON.stringify(positionWeights) }] as T[];
      if (key.startsWith('WITH match_rows AS')) return [] as T[];
      if (key.includes('public.accounts') || key.includes('public."accounts"')) {
        const usernameFilter = key.includes('username_lower');
        const idFilter = key.includes('id =');
        return accounts.filter(row => (!usernameFilter || row.username_lower === sql.values[1] || row.username_lower === sql.values[0]) && (!idFilter || row.id === sql.values[0])) as T[];
      }
      return [] as T[];
    },
    execute: async () => 0,
    transaction: async work => work(database),
    close: async () => {},
  };
  return { app: createApp({ db: database, verify: async token => ({ id: token, sessionId: token, claims: { sub: token } }) }), seen };
}

test('server rankings preserve weighted percentile scores, small-pool tiers, and custom weights', () => {
  const result = calculateRankings(accounts, positionWeights);
  assert.deepEqual(result.get('alice'), { score: 88, percentile: 0.75, ranked: true, gamesPlayed: 10, tier: 'DIAMOND' });
  assert.deepEqual(result.get('bob'), { score: 63, percentile: 0.25, ranked: true, gamesPlayed: 10, tier: 'GOLD' });
  const tied = calculateRankings([
    { username: 'First', position: 'ST', stats: { ...zeroStats, games: 1, goals: 1 } },
    { username: 'Second', position: 'ST', stats: { ...zeroStats, games: 1, goals: 1 } },
  ], positionWeights);
  assert.equal(tied.get('first')?.percentile, 0.5);
  assert.equal(tied.get('second')?.percentile, 0.5);
  assert.equal(tied.get('first')?.tier, 'DIAMOND');
  assert.equal(tied.get('second')?.tier, 'GOLD');
  const unranked = calculateRankings([{ username: 'New', position: 'ST', stats: zeroStats }], null).get('new');
  assert.deepEqual(unranked, { score: 0, percentile: 0, ranked: false, gamesPlayed: 0, tier: 'BRONZE' });
  const legacy = enrichAccounts([{ username: 'Legacy', position: 'LB', stats: { ...zeroStats, games: 8 } }], positionWeights)[0]!;
  assert.deepEqual(legacy.ranking, { score: 0, percentile: 0, ranked: false, gamesPlayed: 8, tier: 'BRONZE' });
  assert.deepEqual(DEFAULT_POSITION_WEIGHTS.ST, { goalsPerGame: 0.55, assistsPerGame: 0.2, passesPerGame: 0.1, tacklesPerGame: 0.15 });
});

test('finite negative saved weights remain compatible and malformed stored weights fail explicitly', async () => {
  const negative = calculateRankings(accounts, { ST: { goalsPerGame: -1 } });
  assert.equal(negative.get('alice')?.score, 13);
  assert.equal(negative.get('alice')?.percentile, -0.75);
  assert.equal(negative.get('bob')?.score, 38);

  const database: Database = {
    client: { setting: { findUnique: async () => ({ key: 'position_weights', value: JSON.stringify({ ST: { goalsPerGame: 'bad' } }) }) } } as unknown as Database['client'],
    query: async <T extends Row>() => [] as T[],
    execute: async () => 0, transaction: async work => work(database), close: async () => {},
  };
  const saved = await getSetting(database, 'position_weights');
  assert.throws(() => calculateRankings(accounts, saved), error =>
    error instanceof HttpError && error.status === 503 && error.code === 'invalid_position_weights');
  for (const goalsPerGame of [NaN, Infinity, -Infinity]) {
    assert.throws(() => calculateRankings(accounts, { ST: { goalsPerGame } }), error =>
      error instanceof HttpError && error.status === 503 && error.code === 'invalid_position_weights');
  }
});

test('unset position weights use the API-owned defaults', async () => {
  const database: Database = {
    client: { setting: { findUnique: async () => null } } as unknown as Database['client'],
    query: async <T extends Row>() => [] as T[], execute: async () => 0,
    transaction: async work => work(database), close: async () => {},
  };
  assert.deepEqual(await getSetting(database, 'position_weights'), DEFAULT_POSITION_WEIGHTS);
});

test('card cells preserve season and all-time presentation, including the existing passes semantics', () => {
  const stats = calculateCardStats({
    username: 'Alice', position: 'ST', stats: accounts[0]!.stats,
    seasonStats: { S1: { ...zeroStats, games: 10, wins: 7, losses: 2, goals: 10, assists: 2, passes: 2, tackles: 5 } },
  });
  const all = stats.find(entry => entry.season === 'all')!;
  const season = stats.find(entry => entry.season === 'S1')!;
  assert.equal(all.cells.length, 6);
  assert.deepEqual(all.cells.map(cell => cell.label), ['GOALS', 'TKL/G', 'ASSIST', 'W-L', 'PASS/G', 'GP']);
  assert.deepEqual(all.cells.map(cell => cell.value), ['10', '0.5', '2', '7-2', '2.0', '10']);
  assert.equal(season.cells[4]?.value, '0.2');
  const fallback = stats.find(entry => entry.season === null)!;
  assert.deepEqual(fallback.cells.map(cell => cell.label), ['GOALS', 'TKL', 'ASSIST', 'W-L', 'PASS', 'GP']);
  assert.deepEqual(fallback.cells.map(cell => cell.value), ['0', '0.0', '0', '0-0', '0.0', '0']);
  const goalkeeper = calculateCardStats({ username: 'Keeper', position: 'GK', stats: { ...zeroStats, games: 2, deflects: 3, catches: 1, cleanSheets: 1 } })[0]!;
  assert.deepEqual(goalkeeper.cells.map(cell => cell.label), ['GOALS', 'DFL/G', 'ASSIST', 'CAT/G', 'PASS/G', 'CS']);
});

test('REST and GraphQL account reads expose computed values without private columns', async () => {
  const { app, seen } = appFor();
  try {
    const rest = await app.inject('/api/accounts');
    assert.equal(rest.statusCode, 200, rest.body);
    const restAlice = rest.json<Array<Record<string, unknown>>>().find(row => row.username === 'Alice')!;
    assert.deepEqual(restAlice.ranking, { score: 88, percentile: 0.75, ranked: true, gamesPlayed: 10, tier: 'DIAMOND' });
    assert.ok(Array.isArray(restAlice.cardStats));
    assert.equal(restAlice.email, undefined);
    assert.equal(restAlice.pendingImageUrl, undefined);
    assert.equal(restAlice.privateNote, undefined);

    const graph = await app.inject({
      method: 'POST', url: '/api/standings',
      payload: { variables: {} },
    });
    assert.equal(graph.statusCode, 200, graph.body);
    const result = graph.json<{ data: { accounts: Array<Record<string, unknown>>; defaultPositionWeights: Record<string, unknown> } }>();
    const graphAlice = result.data.accounts.find(row => row.username === 'Alice')!;
    assert.deepEqual(graphAlice.ranking, { ...restAlice.ranking as object, __typename: 'AccountRanking' });
    assert.equal(graphAlice.email, undefined);
    const weights = await app.inject({ method: 'POST', url: '/api/default-position-weights', payload: { variables: {} } });
    assert.ok(weights.json().data.defaultPositionWeights.ST);
    const summaryQueries = [...seen].filter(([key]) => key.includes('SELECT a.id') && key.includes('season_stats'));
    assert.equal(summaryQueries.reduce((sum, [, count]) => sum + count, 0), 2, 'one full-population read per REST and GraphQL request');

    const profile = await app.inject('/api/accounts/Alice');
    assert.equal(profile.statusCode, 200, profile.body);
    const profileAlice = profile.json<Record<string, unknown>>();
    assert.deepEqual(profileAlice.matches, accounts[0]!.matches);
    assert.deepEqual(profileAlice.ranking, restAlice.ranking);
    assert.equal(profileAlice.email, undefined);
    assert.equal(profileAlice.privateNote, undefined);
  } finally { await app.close(); }
});
