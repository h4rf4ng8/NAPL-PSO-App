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
  const delegate = {
    findMany: async () => [row], findUnique: async () => row,
    create: async () => row, update: async () => row, updateManyAndReturn: async () => [row],
    deleteMany: async () => ({ count: 0 }),
  };
  const db: Database = {
    client: {
      news: delegate, ruleSection: delegate, article: delegate, scheduledMatch: delegate,
      transfer: delegate, totwVotingPeriod: delegate,
      account: { findUnique: async () => ({ id: '11111111-1111-4111-8111-111111111111', username: 'Admin' }), findMany: async () => [{ id: '11111111-1111-4111-8111-111111111111', username: 'Player', position: 'ST' }] },
      season: { findUnique: async () => ({ id: 'S1' }) },
    } as unknown as Database['client'],
    query: async <T extends Row>(sql: Prisma.Sql) => {
      let rows: Row[] = [];
      if (sql.sql.includes('FROM auth_gateway.memberships')) rows = [{ eligible: true, fresh: true }];
      else if (sql.sql.includes('FROM auth_gateway.user_roles')) rows = [{ role: 'super_admin' }];
      else if (sql.sql.includes('session_active')) rows = [{ active: true }];
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
  try {
    for (const { list, ...request } of calls) {
      const response = await app.inject({ ...request, headers: { authorization: 'Bearer admin' } });
      assert.equal(response.statusCode, 200, `${request.method} ${request.url}: ${response.body}`);
      assert.deepEqual(response.json(), list ? [fixture.expected] : fixture.expected);
    }
  } finally { await app.close(); }
});
