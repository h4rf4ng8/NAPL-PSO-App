import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryCache } from '@apollo/client';
import { graphqlEndpoints } from '@napl/contracts';
import { createApp } from '../helper.js';
import { type Database, type Row, Prisma } from '../../plugins/db/client.js';
import { graphql, parse, print, validate } from 'graphql';
import type { FastifyRequest } from 'fastify';
import { schema } from '../../routes/graphql/schema.js';
import { HttpError } from '../../plugins/auth/identity.js';
import { AccountMatchesDocument, AccountOpponentsDocument, LeagueOverviewDocument, LeaderboardDocument, TeamRecordsDocument } from '../../../web/src/api/generated/graphql.ts';

const apolloCache = new InMemoryCache();
const MEMBER_LEAGUE_QUERY = print(apolloCache.transformDocument(LeagueOverviewDocument));
const PUBLIC_LEAGUE_QUERY = print(apolloCache.transformDocument(LeaderboardDocument));

const alice = '11111111-1111-4111-8111-111111111111';
const admin = '33333333-3333-4333-8333-333333333333';
const account = {
  id: alice, username: 'Alice', position: 'CM', team_id: null, image_url: null, country: 'US', stats: {}, matches: [],
  awards: [], championships: [], totw_until: null, cheater: false, strikers_id: '1234', steam_url: null, created_at: new Date(0),
  email: 'private@example.test', pending_image_url: 'private-image',
};
const team = {
  id: 'team-1', name: 'Blue', tag: 'BLU', color: '#0000ff', description: '', owner_account_id: alice, members: ['Alice'],
  pending_members: [], seasons: ['S1'], formation: '2-1-2', lineup: {}, status: 'approved', logo_url: null,
  totw: false, totw_set_at: null, created_at: new Date(0), reviewed_at: null, reviewed_by: null, rejection_reason: null,
};

function appFor(roleForAlice: ('admin' | 'super_admin')[] = [], failSettings = false, options: {
  account?: Row; teams?: Row[]; news?: Row[]; membership?: { eligible: boolean; fresh: boolean }; settingsError?: Error;
} = {}) {
  const seen = new Map<string, number>();
  const database: Database = {
    client: {
      account: { findMany: async () => [options.account ?? account], findUnique: async ({ where, select }: { where: { id?: string }; select?: { email?: boolean } }) => {
        const key = select?.email ? `client.account.privateFields:${where.id}` : 'client.account.findUnique';
        seen.set(key, (seen.get(key) ?? 0) + 1);
        return options.account ?? account;
      } },
      team: { findMany: async () => options.teams ?? [team] },
      teamJoinRequest: { findMany: async () => (options.teams ?? [team]).flatMap(t => (Array.isArray(t.pending_members) ? t.pending_members : []).map(invitation => ({ ...invitation, account_id: alice, team_id: t.id }))) },
      season: { findMany: async () => [{ id: 'S1' }, { id: 'S2' }] },
      teamSeason: { findMany: async () => [{ team_id: team.id, season_id: 'S2' }] },
      news: { findMany: async () => options.news ?? [{ id: 'news-1', type: 'update', title: 'Hello', body: '', pinned: false, author: 'Alice', created_at: new Date(0) }] },
      totwVotingPeriod: { findMany: async () => [], findUnique: async () => ({ id: '88888888-8888-4888-8888-888888888888', created_by_account_id: alice }) },
      setting: { findUnique: async ({ where }: { where: { key: string } }) => {
        if (failSettings) throw new Error('database detail must stay private');
        if (options.settingsError && where.key === 'current_season') throw options.settingsError;
        const key = `client.setting.${where.key}`;
        seen.set(key, (seen.get(key) ?? 0) + 1);
        return { key: where.key, value: where.key === 'current_season' ? 'S2' : '{"CM":{"goals":1}}' };
      } },
    } as unknown as Database['client'],
    query: async <T extends Row>(sql: Prisma.Sql) => {
      const key = sql.sql.replaceAll(/\s+/g, ' ').trim();
      if (failSettings && key.includes('public."settings"')) throw new Error('database detail must stay private');
      if (options.settingsError && key.includes('public."settings"') && sql.values[0] === 'current_season') throw options.settingsError;
      seen.set(key, (seen.get(key) ?? 0) + 1);
      let rows: Row[] = [];
      if (key.startsWith('SELECT r.user_id::text')) rows = roleForAlice.map(role => ({ userId: admin, username: 'Alice', role }));
      else if (key.includes('FROM asl.totw_candidates') || key.includes('FROM asl.totw_winners') || key.startsWith('WITH match_rows AS')) rows = [];
      else if (key.startsWith('WITH target AS')) rows = [{ version: '1', match: null, ordinality: null }];
      else if (key.includes('AS opponent')) rows = [];
      else if (key.includes('public."accounts"') || key.includes('asl.accounts')) rows = [options.account ?? account];
      else if (key.includes('public."teams"')) rows = options.teams ?? [team];
      else if (key.includes('public."news"')) rows = [{ id: 'news-1', type: 'update', title: 'Hello', body: '', pinned: false, author: 'Alice', created_at: new Date(0) }];
      else if (key.includes('public."totw_voting_periods"')) rows = [];
      else if (key.includes('public."settings"')) rows = [{ key: sql.values[0], value: sql.values[0] === 'current_season' ? 'S2' : '{"CM":{"goals":1}}' }];
      else if (key.includes('FROM auth_gateway.user_roles')) rows = sql.values[0] === admin ? roleForAlice.map(role => ({ role })) : [];
      else if (key.includes('auth_gateway.memberships')) rows = [options.membership ?? { eligible: true, fresh: true }];
      return rows as T[];
    },
    execute: async () => 0,
    transaction: async work => work(database),
    close: async () => {},
  };
  const app = createApp({
    db: database,
    verify: async token => {
      if (token === 'invalid') throw new Error('bad token');
      return { id: token, sessionId: token, claims: { sub: token } };
    },
  });
  return { app, seen, database };
}

function variablesFor(name: string): Record<string, unknown> {
  if (['AccountMatches', 'AccountOpponents', 'PlayerCard', 'AccountAwards', 'AccountChampionships'].includes(name)) return { id: alice };
  const examples: Record<string, Record<string, unknown>> = { ImportAccountMatches: { strikersIds: ['1234'] }, HomeNews: { kind: 'announcement' }, VotingCandidates: { periodId: '88888888-8888-4888-8888-888888888888' }, TeamPlayers: { teamId: 'team-1' } };
  return examples[name] ?? {};
}

test('dashboard query documents validate against the feature-owned schema', () => {
  for (const query of [PUBLIC_LEAGUE_QUERY, MEMBER_LEAGUE_QUERY]) {
    assert.deepEqual(validate(schema, parse(query)), []);
  }
});

test('account history and team-record operations validate against their feature schema', () => {
  for (const document of [AccountMatchesDocument, AccountOpponentsDocument, TeamRecordsDocument]) {
    assert.deepEqual(validate(schema, parse(print(apolloCache.transformDocument(document)))), []);
  }
});

test('fixed endpoints execute their own documents and the generic endpoint is gone', async () => {
  const { app } = appFor(['super_admin']);
  const fields: Record<string, string> = { ImportAccountMatches: 'importAccountMatches', TeamStandings: 'standings', SeasonChampions: 'seasonChampions', HomeSummary: 'homeSummary', HomeNews: 'homeNews', TeamSummaries: 'teamSummaries', TeamPlayers: 'teamPlayers', HallOfFame: 'hallOfFame', DecoratedPlayers: 'decoratedPlayers', VotingCandidates: 'votingCandidates', LeagueOverview: 'leagueOverview', Leaderboard: 'leaderboard', PlayerCard: 'accountCard', Seasons: 'seasons', AccountAwards: 'accountAwards', AccountChampionships: 'accountChampionships', TeamRecords: 'teamRecords', AccountMatches: 'accountMatches', AccountOpponents: 'accountOpponents', AccountCardPreviews: 'accountCardPreviews', DefaultPositionWeights: 'defaultPositionWeights' };
  try {
    for (const [name, url] of Object.entries(graphqlEndpoints)) {
      const variables = variablesFor(name);
      const response = await app.inject({ method: 'POST', url, headers: { authorization: `Bearer ${name === 'ImportAccountMatches' ? admin : alice}` }, payload: { variables } });
      assert.equal(response.statusCode, 200, `${url}: ${response.body}`);
      assert.equal(response.json().errors, undefined);
      assert.deepEqual(Object.keys(response.json().data).toSorted((a, b) => a.localeCompare(b)), [fields[name]], url);
    }
    const removed = await app.inject({ method: 'POST', url: '/api/graphql', headers: { authorization: `Bearer ${alice}` }, payload: { variables: {} } });
    assert.equal(removed.statusCode, 404);
  } finally { await app.close(); }
});

test('fixed endpoints reject document overrides and unknown variables before domain reads', async () => {
  const { app, seen } = appFor();
  try {
    for (const url of Object.values(graphqlEndpoints)) {
      for (const payload of [
        { variables: {}, query: '{ admins { userId } }' },
        { variables: {}, operationName: 'Standings' },
        { variables: {}, extensions: { persistedQuery: {} } },
        { variables: {}, url: '/api/roles' },
        { variables: { unexpected: true } },
        [{ variables: {} }],
      ]) {
        const response = await app.inject({ method: 'POST', url, headers: { authorization: `Bearer ${alice}` }, payload });
        assert.equal(response.statusCode, 400, `${url}: ${response.body}`);
        assert.equal(response.json().errors[0].extensions.code, 'invalid_request');
        assert.ok(seen.keys().every(key => key.includes('auth_gateway')), 'invalid input must not trigger domain reads');
      }
    }
  } finally { await app.close(); }
});

test('history endpoints preserve required variables, defaults, nulls and bounds', async () => {
  const { app } = appFor();
  try {
    for (const variables of [{ id: alice }, { id: alice, first: null, after: null, season: null, opponent: null }]) {
      const response = await app.inject({ method: 'POST', url: '/api/account-matches', payload: { variables } });
      assert.equal(response.statusCode, 200, response.body);
      assert.deepEqual(response.json().data.accountMatches.nodes, []);
      assert.equal(response.json().data.accountMatches.pageInfo.hasNextPage, false);
    }
    for (const variables of [{}, { id: null }, { id: alice, first: 0 }, { id: alice, first: 51 }, { id: alice, first: '25' }, { id: alice, after: 'invalid' }]) {
      const response = await app.inject({ method: 'POST', url: '/api/account-matches', payload: { variables } });
      assert.equal(response.statusCode, 400, response.body);
    }
  } finally { await app.close(); }
});

test('standings requires sign-in and overview constrains private fields', async () => {
  const { app } = appFor();
  try {
    const denied = await app.inject({ method: 'POST', url: '/api/team-standings', payload: { variables: {} } });
    assert.equal(denied.statusCode, 401);
    assert.deepEqual(denied.json(), { error: 'authentication_required', message: 'authentication_required' });
    for (const token of [alice, admin]) {
      const standings = await app.inject({ method: 'POST', url: '/api/team-standings', headers: { authorization: `Bearer ${token}` }, payload: { variables: {} } });
      assert.equal(standings.statusCode, 200, standings.body);
      assert.equal(standings.json().data.standings.nodes[0].email, undefined);
    }
    const anonymous = await app.inject({ method: 'POST', url: '/api/league-overview', payload: { variables: {} } });
    assert.equal(anonymous.statusCode, 200, anonymous.body);
    assert.equal(anonymous.json().data.leagueOverview.me, null);
    const overview = await app.inject({ method: 'POST', url: '/api/league-overview', headers: { authorization: `Bearer ${alice}` }, payload: { variables: {} } });
    assert.equal(overview.statusCode, 200, overview.body);
    assert.equal(overview.json().data.leagueOverview.me.email, 'private@example.test');
    assert.equal(overview.json().data.leagueOverview.accounts, undefined);
    assert.equal(overview.json().data.admins, undefined);
  } finally { await app.close(); }
});

test('dashboard shares league reads and constrains private account lookup', async () => {
  const { app, seen } = appFor();
  try {
    const response = await app.inject({ method: 'POST', url: '/api/league-overview', headers: { authorization: `Bearer ${alice}` }, payload: { variables: {} } });
    assert.equal(response.statusCode, 200, response.body);
    const summaries = [...seen].filter(([sql]) => sql.includes('AS season_stats'));
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0]?.[1], 1);
    assert.equal(seen.get(`client.account.privateFields:${alice}`), 1);
  } finally { await app.close(); }
});

test('schema-only selections preserve alias deduplication and privileged resolver checks', async () => {
  const { app, database, seen } = appFor(['super_admin']);
  const request = { identity: { id: admin }, userRoles: ['super_admin'] } as unknown as FastifyRequest;
  try {
    const result = await graphql({ schema, source: '{ admins { userId } again: admins { userId } }', contextValue: { db: database, request, reads: new Map() } });
    assert.equal(result.errors, undefined);
    assert.equal([...seen].filter(([key]) => key.startsWith('SELECT r.user_id::text')).reduce((sum, [, count]) => sum + count, 0), 1);
    request.userRoles = [];
    const denied = await graphql({ schema, source: '{ admins { userId } }', contextValue: { db: database, request, reads: new Map() } });
    assert.equal(denied.errors?.[0]?.extensions.status, 403);
    const anonymous = await graphql({ schema, source: '{ me { email } }', contextValue: { db: database, request: { userRoles: [] }, reads: new Map() } });
    assert.equal(anonymous.errors?.[0]?.extensions.status, 401);
    for (const field of ['email', 'matches']) assert.match(validate(schema, parse(`{ accounts { ${field} } }`))[0]!.message, /Cannot query field/);
  } finally { await app.close(); }
});

test('GraphQL and REST share pending-team visibility rules', async () => {
  const pending = { ...team, id: 'pending', status: 'pending', owner_account_id: '22222222-2222-4222-8222-222222222222', pending_members: [{ username: 'Alice', status: 'pending' }] };
  const { app } = appFor([], false, { teams: [team, pending] });
  try {
    for (const token of [undefined, alice]) {
      const headers = token ? { authorization: `Bearer ${token}` } : {};
      const rest = await app.inject({ method: 'GET', url: '/api/teams', headers });
      const gql = await app.inject({ method: 'POST', url: '/api/team-summaries', headers, payload: { variables: {} } });
      const expected = token ? ['team-1', 'pending'] : ['team-1'];
      assert.deepEqual(rest.json<{ nodes: Array<{ id: string }> }>().nodes.map(row => row.id), expected);
      assert.equal(gql.statusCode, 200, gql.body);
      assert.deepEqual(gql.json().data.teamSummaries.nodes.map((row: { id: string }) => row.id), expected);
    }
  } finally { await app.close(); }
});

test('standings admits authenticated Discord users without guild membership lookups', async () => {
  const { app, seen } = appFor([], false, { membership: { eligible: false, fresh: false } });
  try {
    for (const url of ['/api/team-standings', '/api/team-records']) {
      const response = await app.inject({ method: 'POST', url, headers: { authorization: `Bearer ${alice}` }, payload: { variables: {} } });
      assert.equal(response.statusCode, 200, response.body);
    }
    assert.ok(seen.keys().every(key => !key.includes('memberships')));
  } finally { await app.close(); }
});

test('fixed reads reject invalid JWTs', async () => {
  const { app } = appFor();
  try {
    for (const url of ['/api/league-overview', '/api/team-standings', '/api/team-records']) {
      const response = await app.inject({ method: 'POST', url, headers: { authorization: 'Bearer invalid' }, payload: { variables: {} } });
      assert.equal(response.statusCode, 401, response.body);
      assert.equal(response.json().error.code, 'access_invalid');
    }
  } finally { await app.close(); }
});

test('fixed reads retain safe downstream errors and Retry-After', async () => {
  for (const status of [429, 503]) {
    const { app } = appFor([], false, { settingsError: new HttpError(status, 'dependency_busy', 'private detail', 7) });
    try {
      const response = await app.inject({ method: 'POST', url: '/api/league-overview', headers: { authorization: `Bearer ${alice}` }, payload: { variables: {} } });
      assert.equal(response.statusCode, status, response.body);
      assert.equal(response.headers['retry-after'], '7');
      assert.equal(response.json().errors[0].extensions.code, status === 503 ? 'service_unavailable' : 'dependency_busy');
      assert.doesNotMatch(response.body, /private detail/);
    } finally { await app.close(); }
  }
  const { app } = appFor([], true);
  try {
    const response = await app.inject({ method: 'POST', url: '/api/leaderboard', headers: { authorization: `Bearer ${alice}` }, payload: { variables: {} } });
    assert.equal(response.statusCode, 503);
    assert.doesNotMatch(response.body, /database detail/);
  } finally { await app.close(); }
});

test('unexpected resolver serialization errors fail closed', async () => {
  const { app } = appFor([], false, { account: { ...account, created_at: new Date(NaN) } });
  try {
    const response = await app.inject({ method: 'POST', url: '/api/player-card', headers: { authorization: `Bearer ${alice}` }, payload: { variables: { id: alice } } });
    assert.equal(response.statusCode, 503);
    assert.equal(response.json().errors[0].extensions.code, 'internal_error');
    assert.equal(response.json().errors[0].message, 'Request failed');
  } finally { await app.close(); }
});


test('news history preserves past matchups and source badges while Home explicitly selects upcoming', async () => {
  const { app } = appFor([], false, { news: [
    { id: 'past', type: 'matchup', title: null, author: null, pinned: false, event_date: new Date(0), auto_from_submission: 'submission' },
    { id: 'future', type: 'matchup', title: '', author: '', pinned: false, event_date: new Date('2100-01-01'), auto_from_submission: null },
  ] });
  try {
    const history = await app.inject({ method: 'POST', url: '/api/home-news', headers: { authorization: `Bearer ${alice}` }, payload: { variables: { kind: 'matchup', upcomingOnly: false } } });
    assert.equal(history.statusCode, 200, history.body);
    const rows = history.json().data.homeNews.nodes;
    assert.deepEqual(rows.map((row: Row) => row.id), ['past', 'future']);
    assert.equal(rows[0].author, ''); assert.equal(rows[0].title, ''); assert.equal(rows[0].autoFromSubmission, 'submission');
    const upcoming = await app.inject({ method: 'POST', url: '/api/home-news', headers: { authorization: `Bearer ${alice}` }, payload: { variables: { kind: 'matchup', upcomingOnly: true } } });
    assert.equal(upcoming.statusCode, 200, upcoming.body);
    assert.deepEqual(upcoming.json().data.homeNews.nodes.map((row: Row) => row.id), ['future']);
  } finally { await app.close(); }
});


test('uploaded-roster account matching requires admin at both fixed route and resolver', async () => {
  const { app, database } = appFor();
  try {
    const payload = { variables: { strikersIds: ['1234'] } };
    assert.equal((await app.inject({ method: 'POST', url: '/api/import-account-matches', payload })).statusCode, 401);
    const denied = await app.inject({ method: 'POST', url: '/api/import-account-matches', headers: { authorization: `Bearer ${alice}` }, payload });
    assert.equal(denied.statusCode, 403, denied.body);
    const result = await graphql({ schema, source: '{ importAccountMatches(strikersIds:["1234"]) { totalCount } }', contextValue: { db: database, request: { identity: { id: alice }, userRoles: [] }, reads: new Map() } });
    assert.equal(result.errors?.[0]?.extensions.status, 403);
  } finally { await app.close(); }
});
