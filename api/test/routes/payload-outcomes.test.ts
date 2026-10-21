import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../helper.js';
import { readFields } from '../responses.js';
import { payloadFixture, fixtureUser } from '../payload-fixture.js';
import type { Database, Row, Prisma } from '../../plugins/db/client.js';

// Actual route serialization must retain meaningful outcomes without repeating uploaded names.
test('maximum import skipped roster and full voting tally stay bounded and complete', async () => {
  const fixture = payloadFixture();
  const query = fixture.db.query.bind(fixture.db);
  const positions = ['GK', 'DEF', 'CM', 'ST'];
  const tallies = positions.flatMap(position => Array.from({ length: 8 }, (_, index) => ({ position, username: '球'.repeat(62) + String(index), votes: 8 - index })));
  fixture.db.query = async <T extends Row>(sql: Prisma.Sql) => sql.sql.includes('count(*)::int AS votes') ? tallies as unknown as T[] : query<T>(sql);
  Object.assign(fixture.db.client.team, { findUnique: async ({ where }: { where: { id: string } }) => ({ id: where.id, name: '球'.repeat(160) }) });
  const app = createApp({ db: fixture.db as Database, verify: async id => ({ id, sessionId: id, claims: { sub: id } }) });
  const headers = { authorization: `Bearer ${fixtureUser}` };
  try {
    const players = Array.from({ length: 30 }, (_, index) => ({ player_id: String(index), username: '球'.repeat(100), team: 'home', stats: {} }));
    const imported = await app.inject({ method: 'POST', url: '/api/import-match', headers, payload: { matchData: { match_id: '球'.repeat(160), score: { home: 100_000, away: 100_000 }, players }, playerMap: {}, tackleOverrides: {}, homeTeamId: 'home', awayTeamId: 'away', season: 'S1' } });
    assert.equal(imported.statusCode, 200, imported.body);
    assert.ok(Buffer.byteLength(imported.body) <= 10_000);
    assert.equal(imported.json().skipped, 30);
    assert.deepEqual(imported.json().skippedIndexes, players.map((_, index) => index));
    assert.equal(imported.json().homeTeam, '球'.repeat(160));
    const tally = await app.inject({ url: `/api/voting/periods/${fixture.period.id}/tally`, headers });
    assert.equal(tally.statusCode, 200, tally.body);
    assert.ok(Buffer.byteLength(tally.body) <= 10_000);
    assert.equal(tally.json().totalVotes, 144);
    for (const position of positions) assert.deepEqual(tally.json().positions[position], tallies.filter(row => row.position === position).slice(0, 5).map(row => [row.username, row.votes]));
  } finally { await app.close(); }
});

test('public selected cards retain full legacy numeric stats access without private account fields', async () => {
  const fixture = payloadFixture();
  const key = '球'.repeat(4000);
  const stats = { games: 1, [key]: 42 };
  Object.assign(fixture.accounts[0]!, { stats });
  const app = createApp({ db: fixture.db, verify: async id => ({ id, sessionId: id, claims: { sub: id } }) });
  try {
    const card = await app.inject({ url: `/api/accounts/${encodeURIComponent(fixture.accounts[0]!.username)}` });
    assert.equal(card.statusCode, 200, card.body);
    const response = await app.inject({ url: card.json().statsUrl });
    assert.equal(response.statusCode, 200, response.body);
    assert.ok(Buffer.byteLength(response.body) <= 10_000);
    const fields = response.json().nodes as Array<{ valueUrl?: string }>;
    const valueUrl = fields.find(field => field.valueUrl)!.valueUrl!;
    const full = await readFields(app, card.json().statsUrl);
    assert.deepEqual(full, stats);
    assert.equal(Object.hasOwn(full, 'email'), false);
    assert.equal(Object.hasOwn(full, 'pendingImageUrl'), false);
    Object.assign(fixture.accounts[0]!, { stats: { ...stats, changed: 1 } });
    assert.equal((await app.inject({ url: valueUrl })).statusCode, 409);
  } finally { await app.close(); }
});
