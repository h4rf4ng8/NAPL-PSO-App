/* eslint-disable unicorn/prefer-switch -- Each fixture hydrates a different domain detail contract. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from '../helper.js';
import type { Database, Row, Prisma } from '../../plugins/db/client.js';
import { newsDto, ruleDto, articleDto, scheduleDto, transferDto } from '../../routes/content/dto.js';
import { periodDto } from '../../routes/voting/dto.js';

const now = 1_700_000_000_000;
const privateFields = { internal_note: 'private', provider_secret: 'secret', deleted_at: new Date(now) };
const cases = [
  { path: 'news', table: 'news', format: newsDto,
    row: { id: 'news', type: 'announcement', title: null, body: null, pinned: false, home_team_id: null, away_team_id: null, home_score: null, away_score: null, event_date: new Date(now), notes: null, author: null, created_at: new Date(now), auto_from_submission: null },
    expected: { id: 'news', type: 'announcement', title: '', body: '', pinned: false, homeTeamId: null, awayTeamId: null, homeScore: null, awayScore: null, date: now, notes: '', author: '', createdAt: now, autoFromSubmission: null },
    input: { id: 'news', type: 'announcement', title: null, body: null }, patch: { title: '' } },
  { path: 'rules', table: 'rules_sections', format: ruleDto,
    row: { id: 'rules', title: 'Rules', body: '', sort_order: 0, created_at: new Date(now), updated_at: null },
    expected: { id: 'rules', title: 'Rules', body: '', sortOrder: 0, createdAt: now, updatedAt: null },
    input: { id: 'rules', title: 'Rules', body: '', sortOrder: 0 }, patch: { title: 'New title' } },
  { path: 'articles', table: 'articles', format: articleDto,
    row: { id: 'articles', slug: 'article', title: 'Article', body: '', cover_image_url: null, author: null, excerpt: null, published_at: new Date(now), updated_at: null },
    expected: { id: 'articles', slug: 'article', title: 'Article', body: '', coverImageUrl: null, author: null, excerpt: null, publishedAt: now, updatedAt: null },
    input: { id: 'articles', slug: 'article', title: 'Article', body: '' }, patch: { title: 'New title' } },
  { path: 'schedule', table: 'scheduled_matches', format: scheduleDto,
    row: { id: 'schedule', season_id: 'S1', week: 1, home_team_id: 'home', away_team_id: 'away', scheduled_date: new Date(now), stream_url: null, match_type: 'regular', playoff_round: null, status: 'scheduled', home_score: null, away_score: null, linked_match_id: null, notes: null, created_at: new Date(now), updated_at: null },
    expected: { id: 'schedule', season: 'S1', week: 1, homeTeamId: 'home', awayTeamId: 'away', scheduledDate: now, streamUrl: null, matchType: 'regular', playoffRound: null, status: 'scheduled', homeScore: null, awayScore: null, linkedMatchId: null, notes: null, createdAt: now, updatedAt: null },
    input: { id: 'schedule', season: 'S1', week: 1, homeTeamId: 'home', awayTeamId: 'away' }, patch: { week: 2 } },
  { path: 'transfers', table: 'transfers', format: transferDto,
    row: { id: 'transfers', season_id: 'S1', player_username: 'Player', from_team_id: null, to_team_id: 'home', kind: 'signing', window_type: null, created_at: new Date(now), created_by: null },
    expected: { id: 'transfers', season: 'S1', playerUsername: 'Player', fromTeamId: null, toTeamId: 'home', kind: 'signing', windowType: null, createdAt: now, createdBy: null },
    input: { id: 'transfers', season: 'S1', playerUsername: 'Player', kind: 'signing' }, patch: { windowType: null } },
  { path: 'voting/periods', table: 'totw_voting_periods', format: periodDto,
    row: { id: '88888888-8888-4888-8888-888888888888', opens_at: new Date(now), closes_at: new Date(now + 1000), status: 'open', eligible_players: ['Player'], winners: null, created_by: 'Admin', created_at: new Date(now), resolved_at: null },
    expected: { id: '88888888-8888-4888-8888-888888888888', opensAt: now, closesAt: now + 1000, status: 'open', eligiblePlayers: ['Player'], winners: null, createdBy: 'Admin', createdAt: now, resolvedAt: null },
    input: { closesAt: now + 1000, eligiblePlayers: ['Player'] }, patch: { status: 'closed' } },
];

for (const fixture of cases) test(`${fixture.path} exposes only documented fields on every response path`, async () => {
  const row = { ...fixture.row, ...privateFields };
  assert.deepEqual(fixture.format(row), fixture.expected);
  const writes: Row[] = [];
  const save = async ({ data }: { data: Row }) => { writes.push(data); Object.assign(row, Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined))); return row; };
  const delegate = {
    findMany: async () => [row], findUnique: async () => row,
    create: save, update: save, updateManyAndReturn: async (args: { data: Row }) => [await save(args)],
    deleteMany: async () => ({ count: 0 }),
  };
  const db: Database = {
    client: {
      news: delegate, ruleSection: delegate, article: delegate, scheduledMatch: delegate,
      transfer: delegate, totwVotingPeriod: delegate,
      account: { findUnique: async () => ({ id: '11111111-1111-4111-8111-111111111111', username: 'Admin' }), findMany: async () => [{ id: '11111111-1111-4111-8111-111111111111', username: 'Player', position: 'ST' }] },
      season: { findUnique: async () => ({ id: 'S1' }), findMany: async () => [] },
      team: { findMany: async () => [] }, teamJoinRequest: { findMany: async () => [] }, teamSeason: { findMany: async () => [] },
    } as unknown as Database['client'],
    query: async <T extends Row>(sql: Prisma.Sql) => {
      let rows: Row[] = [];
      if (sql.sql.includes('FROM auth_gateway.memberships')) rows = [{ eligible: true, fresh: true }];
      else if (sql.sql.includes('FROM auth_gateway.user_roles')) rows = [{ role: 'super_admin' }];
      else if (sql.sql.includes('SELECT username FROM asl.accounts')) rows = [{ username: 'Admin' }];
      else if (sql.sql.includes('SELECT a.username FROM asl.totw_candidates')) rows = [{ username: 'Player' }];
      else if (sql.sql.includes('FROM asl.transfers') || sql.sql.includes('SELECT * FROM asl.totw_voting_periods')) rows = [row];
      else if (sql.sql.includes('clock_timestamp()')) rows = [{ now: new Date(now) }];
      else if (sql.sql.includes(`"${fixture.table}"`)) rows = [row];
      return rows as T[];
    },
    execute: async () => 0, transaction: async work => work(db), close: async () => {},
  };
  const app = createApp({ db, verify: async id => ({ id, sessionId: id, claims: { sub: id } }) });
  const calls: Array<{ method: 'GET' | 'POST' | 'PATCH' | 'PUT'; url: string; payload?: object; list?: boolean }> = [
    { method: 'GET', url: `/api/${fixture.path}`, list: true },
    { method: 'POST', url: `/api/${fixture.path}`, payload: fixture.input },
    { method: 'PATCH', url: `/api/${fixture.path}/${fixture.row.id}`, payload: fixture.patch },
  ];
  if (fixture.path === 'articles') calls.push({ method: 'GET', url: '/api/articles/slug/article' });
  else if (fixture.path === 'schedule') {
    calls.push({ method: 'POST', url: '/api/schedule/bulk', payload: { matches: [fixture.input] }, list: true });
    const { season: _season, ...match } = fixture.input as Record<string, unknown>;
    calls.push({ method: 'PUT', url: '/api/schedule/season/S1', payload: { matches: [match] }, list: true });
  }
  const headers = { authorization: 'Bearer admin' };
  const text = async (url: string): Promise<string> => {
    const response = await app.inject({ url, headers });
    assert.equal(response.statusCode, 200, response.body);
    return response.json<{ nodes: string[] }>().nodes.join('');
  };
  const snapshot = async () => {
    const response = await app.inject({ url: `/api/${fixture.path}`, headers });
    assert.equal(response.statusCode, 200, response.body);
    const summary = response.json<{ nodes: Row[]; totalCount: number }>();
    assert.equal(summary.totalCount, 1);
    const metadata = summary.nodes[0]!;
    let complete: Row = metadata;
    if (fixture.path === 'news') {
      const { bodyUrl, notesUrl, ...rest } = metadata;
      complete = { ...rest, body: await text(String(bodyUrl)), notes: await text(String(notesUrl)) };
    } else if (fixture.path === 'rules' || fixture.path === 'articles') {
      const full = await app.inject({ url: String(metadata.bodyUrl), headers });
      assert.equal(full.statusCode, 200, full.body);
      complete = full.json();
    } else if (fixture.path === 'schedule') {
      const { notesUrl, homeTeam, awayTeam, homeRecord, awayRecord, ...rest } = metadata;
      assert.equal(homeTeam, null); assert.equal(awayTeam, null);
      assert.deepEqual(homeRecord, { w: 0, d: 0, l: 0 }); assert.deepEqual(awayRecord, { w: 0, d: 0, l: 0 });
      complete = { ...rest, notes: await text(String(notesUrl)) };
    } else if (fixture.path === 'transfers') {
      const { fromTeam, toTeam, ...rest } = metadata;
      assert.equal(fromTeam, null); assert.equal(toTeam, null);
      complete = rest;
    } else if (fixture.path === 'voting/periods') {
      const { eligiblePlayerCount, winnerCount, ...rest } = metadata;
      const candidates = await app.inject({ url: `/api/voting/periods/${String(metadata.id)}/candidates`, headers });
      const winners = await app.inject({ url: `/api/voting/periods/${String(metadata.id)}/winners`, headers });
      assert.equal(candidates.statusCode, 200, candidates.body); assert.equal(winners.statusCode, 200, winners.body);
      const names = candidates.json<{ nodes: string[] }>().nodes;
      assert.equal(eligiblePlayerCount, names.length);
      assert.equal(winnerCount, 0);
      complete = { ...rest, eligiblePlayers: names, winners: null };
    }
    const expected: Row = fixture.format(row);
    if (fixture.path === 'schedule') expected.notes ??= '';
    // JSON normalization removes undefined fields exactly as HTTP serialization does.
    // eslint-disable-next-line unicorn/prefer-structured-clone
    assert.deepEqual(complete, JSON.parse(JSON.stringify(expected)));
    assert.ok(!JSON.stringify(complete).includes('provider_secret'));
  };
  try {
    await snapshot();
    const commands = calls.filter(call => call.method !== 'GET');
    for (const { list: _list, ...request } of commands) {
      const before = writes.length;
      const response = await app.inject({ ...request, headers });
      assert.equal(response.statusCode, 200, `${request.method} ${request.url}: ${response.body}`);
      assert.equal(response.json().ok, true);
      assert.ok(Buffer.byteLength(response.body) < 1000);
      assert.ok(writes.length > before, `${request.method} must perform the write`);
      await snapshot();
    }
  } finally { await app.close(); }
});
