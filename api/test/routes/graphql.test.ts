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
import { AccountMatchesDocument, AccountOpponentsDocument, MemberLeagueDataDocument, StandingsDocument, TeamRecordsDocument } from '../../../web/src/api/generated/graphql.ts';

const apolloCache = new InMemoryCache();
const MEMBER_LEAGUE_QUERY = print(apolloCache.transformDocument(MemberLeagueDataDocument));
const PUBLIC_LEAGUE_QUERY = print(apolloCache.transformDocument(StandingsDocument));

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
  account?: Row; teams?: Row[]; membership?: { eligible: boolean; fresh: boolean }; settingsError?: Error;
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
      news: { findMany: async () => [{ id: 'news-1', type: 'update', title: 'Hello', body: '', pinned: false, author: 'Alice', created_at: new Date(0) }] },
      totwVotingPeriod: { findMany: async () => [] },
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
      else if (key.startsWith('WITH match_rows AS')) rows = [];
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
  const { app } = appFor();
  const fields = { Standings: ['accounts', 'teams', 'teamRecords'], MemberLeagueData: ['accounts', 'teams', 'season', 'news', 'votingPeriods', 'me'], TeamRecords: ['teamRecords'], AccountMatches: ['accountMatches'], AccountOpponents: ['accountOpponents'], AccountCardPreviews: ['accountCardPreviews'], DefaultPositionWeights: ['defaultPositionWeights'] };
  try {
    for (const [name, url] of Object.entries(graphqlEndpoints)) {
      const variables = name === 'AccountMatches' || name === 'AccountOpponents' ? { id: alice } : {};
      const response = await app.inject({ method: 'POST', url, headers: { authorization: `Bearer ${alice}` }, payload: { variables } });
      assert.equal(response.statusCode, 200, `${url}: ${response.body}`);
      assert.equal(response.json().errors, undefined);
      assert.deepEqual(Object.keys(response.json().data).toSorted((a, b) => a.localeCompare(b)), fields[name as keyof typeof fields].toSorted((a, b) => a.localeCompare(b)), url);
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

test('standings requires sign-in and dashboard preserves private fields and authentication', async () => {
  const { app } = appFor();
  try {
    const standings = await app.inject({ method: 'POST', url: '/api/standings', headers: { authorization: `Bearer ${alice}` }, payload: { variables: {} } });
    assert.equal(standings.statusCode, 200, standings.body);
    assert.equal(standings.json().data.accounts[0].email, undefined);
    assert.equal(standings.json().data.accounts[0].pendingImageUrl, undefined);
    assert.equal(standings.json().data.me, undefined);
    const anonymous = await app.inject({ method: 'POST', url: '/api/dashboard', payload: { variables: {} } });
    assert.equal(anonymous.statusCode, 401);
    const dashboard = await app.inject({ method: 'POST', url: '/api/dashboard', headers: { authorization: `Bearer ${alice}` }, payload: { variables: {} } });
    assert.equal(dashboard.statusCode, 200, dashboard.body);
    assert.equal(dashboard.json().data.me.email, 'private@example.test');
    assert.equal(dashboard.json().data.accounts[0].email, undefined);
    assert.equal(dashboard.json().data.admins, undefined);
  } finally { await app.close(); }
});

test('dashboard shares league reads and constrains private account lookup', async () => {
  const { app, seen } = appFor();
  try {
    const response = await app.inject({ method: 'POST', url: '/api/dashboard', headers: { authorization: `Bearer ${alice}` }, payload: { variables: {} } });
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
      const gql = await app.inject({ method: 'POST', url: '/api/standings', headers, payload: { variables: {} } });
      const expected = token ? ['team-1', 'pending'] : ['team-1'];
      assert.deepEqual(rest.json<Array<{ id: string }>>().map(row => row.id), expected);
      assert.equal(gql.statusCode, token ? 200 : 401, gql.body);
      if (token) assert.deepEqual(gql.json().data.teams.map((row: { id: string }) => row.id), expected);
    }
  } finally { await app.close(); }
});

test('standings admits authenticated Discord users without guild membership lookups', async () => {
  const { app, seen } = appFor([], false, { membership: { eligible: false, fresh: false } });
  try {
    for (const url of ['/api/standings', '/api/team-records']) {
      const response = await app.inject({ method: 'POST', url, headers: { authorization: `Bearer ${alice}` }, payload: { variables: {} } });
      assert.equal(response.statusCode, 200, response.body);
    }
    assert.ok(seen.keys().every(key => !key.includes('memberships')));
  } finally { await app.close(); }
});

test('fixed reads reject invalid JWTs', async () => {
  const { app } = appFor();
  try {
    for (const url of ['/api/dashboard', '/api/standings', '/api/team-records']) {
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
      const response = await app.inject({ method: 'POST', url: '/api/dashboard', headers: { authorization: `Bearer ${alice}` }, payload: { variables: {} } });
      assert.equal(response.statusCode, status, response.body);
      assert.equal(response.headers['retry-after'], '7');
      assert.equal(response.json().errors[0].extensions.code, status === 503 ? 'service_unavailable' : 'dependency_busy');
      assert.doesNotMatch(response.body, /private detail/);
    } finally { await app.close(); }
  }
  const { app } = appFor([], true);
  try {
    const response = await app.inject({ method: 'POST', url: '/api/standings', headers: { authorization: `Bearer ${alice}` }, payload: { variables: {} } });
    assert.equal(response.statusCode, 503);
    assert.doesNotMatch(response.body, /database detail/);
  } finally { await app.close(); }
});

test('unexpected resolver serialization errors fail closed', async () => {
  const { app } = appFor([], false, { account: { ...account, created_at: new Date(NaN) } });
  try {
    const response = await app.inject({ method: 'POST', url: '/api/standings', headers: { authorization: `Bearer ${alice}` }, payload: { variables: {} } });
    assert.equal(response.statusCode, 503);
    assert.equal(response.json().errors[0].extensions.code, 'internal_error');
    assert.equal(response.json().errors[0].message, 'Request failed');
  } finally { await app.close(); }
});
