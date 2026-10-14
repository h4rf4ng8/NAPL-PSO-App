import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryCache } from '@apollo/client';
import { createApp } from '../helper.js';
import { type Database, type Row, Prisma } from '../../plugins/db/client.js';
import { parse, print, validate } from 'graphql';
import { schema } from '../../routes/graphql/schema.js';
import { HttpError } from '../../plugins/auth/identity.js';
import { AccountMatchesDocument, AccountOpponentsDocument, MemberLeagueDataDocument, PublicLeagueDataDocument, TeamRecordsDocument } from '../../../web/src/api/generated/graphql.ts';

const apolloCache = new InMemoryCache();
const MEMBER_LEAGUE_QUERY = print(apolloCache.transformDocument(MemberLeagueDataDocument));
const PUBLIC_LEAGUE_QUERY = print(apolloCache.transformDocument(PublicLeagueDataDocument));

const alice = '11111111-1111-4111-8111-111111111111';
const admin = '33333333-3333-4333-8333-333333333333';
const account = {
  id: alice, username: 'Alice', position: 'CM', team_id: null, image_url: null, country: 'US', stats: {}, matches: [],
  awards: [], championships: [], totw_until: null, cheater: false, strikers_id: '1234', steam_url: null, created_at: new Date(0),
  email: 'private@example.test', pending_image_url: 'private-image',
};
const team = {
  id: 'team-1', name: 'Blue', tag: 'BLU', color: '#0000ff', description: '', owner_username: 'Alice', members: ['Alice'],
  pending_members: [], seasons: ['S1'], formation: '2-1-2', lineup: {}, status: 'approved', logo_url: null,
  totw: false, totw_set_at: null, created_at: new Date(0), reviewed_at: null, reviewed_by: null, rejection_reason: null,
};

function appFor(roleForAlice: ('admin' | 'super_admin')[] = [], failSettings = false, options: {
  account?: Row; teams?: Row[]; membership?: { eligible: boolean; fresh: boolean }; settingsError?: Error; activeSession?: boolean;
} = {}) {
  const seen = new Map<string, number>();
  const database: Database = {
    query: async <T extends Row>(sql: Prisma.Sql) => {
      const key = sql.sql.replaceAll(/\s+/g, ' ').trim();
      if (failSettings && key.includes('public."settings"')) throw new Error('database detail must stay private');
      if (options.settingsError && key.includes('public."settings"')) throw options.settingsError;
      seen.set(key, (seen.get(key) ?? 0) + 1);
      let rows: Row[] = [];
      if (key.startsWith('SELECT r.user_id::text')) rows = roleForAlice.map(role => ({ userId: admin, username: 'Alice', role }));
      else if (key.includes('public."accounts"') || key.includes('public.accounts')) rows = [options.account ?? account];
      else if (key.includes('public."teams"')) rows = options.teams ?? [team];
      else if (key.includes('public."news"')) rows = [{ id: 'news-1', type: 'update', title: 'Hello', body: '', pinned: false, author: 'Alice', created_at: new Date(0) }];
      else if (key.includes('public."totw_voting_periods"')) rows = [];
      else if (key.includes('public."settings"')) rows = [{ key: sql.values[0], value: sql.values[0] === 'current_season' ? 'S2' : '{"CM":{"goals":1}}' }];
      else if (key.includes('FROM auth_gateway.user_roles')) rows = sql.values[0] === admin ? roleForAlice.map(role => ({ role })) : [];
      else if (key.includes('auth_gateway.memberships')) rows = [options.membership ?? { eligible: true, fresh: true }];
      else if (key.includes('session_active')) rows = [{ active: options.activeSession ?? true }];
      return rows as T[];
    },
    execute: async () => 0,
    transaction: async work => work(database),
    close: async () => {},
  };
  const app = createApp({
    db: database,
    verify: async token => ({ id: token, sessionId: token, claims: { sub: token } }),
  });
  return { app, seen };
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

test('aggregated query shares domain reads and caches aliases without internal HTTP requests', async () => {
  const { app, seen } = appFor();
  const requests: string[] = [];
  app.addHook('onRequest', async request => { requests.push(request.url); });
  try {
    const response = await app.inject({
      method: 'POST', url: '/api/graphql',
      payload: { query: '{ accounts { id username stats } accountsAgain: accounts { id } teams { id name invitations { username } } season weightings news { id title } votingPeriods { id } }' },
    });
    assert.equal(response.statusCode, 200, response.body);
    const result = response.json<{ data: Record<string, unknown> }>();
    assert.notEqual(result.data, null, response.body);
    assert.equal(result.data.season, 'S2');
    assert.equal((result.data.accounts as Array<Record<string, unknown>>)[0]?.email, undefined);
    assert.equal((result.data.teams as Array<Record<string, unknown>>)[0]?.name, 'Blue', response.body);
    const accountSummaryQueries = [...seen].filter(([key]) => key.includes('SELECT a.id') && key.includes('season_stats'));
    assert.equal(accountSummaryQueries.reduce((total, [, count]) => total + count, 0), 1);
    assert.deepEqual(requests, ['/api/graphql']);
  } finally { await app.close(); }
});

test('private account fields are absent from the public GraphQL type and me preserves 401', async () => {
  const { app } = appFor();
  try {
    const publicField = await app.inject({ method: 'POST', url: '/api/graphql', payload: { query: '{ accounts { email } }' } });
    assert.equal(publicField.statusCode, 400);
    assert.match(publicField.body, /Cannot query field/);
    const historyField = await app.inject({ method: 'POST', url: '/api/graphql', payload: { query: '{ accounts { matches } }' } });
    assert.equal(historyField.statusCode, 400);
    assert.match(historyField.body, /Cannot query field/);
    const me = await app.inject({ method: 'POST', url: '/api/graphql', payload: { query: '{ me { email roles } }' } });
    assert.equal(me.statusCode, 401);
    assert.equal(me.json<{ errors: Array<{ extensions: { code: string } }> }>().errors[0]?.extensions.code, 'authentication_required');
    const current = await app.inject({ method: 'POST', url: '/api/graphql', headers: { authorization: `Bearer ${alice}` }, payload: { query: '{ me { email roles } }' } });
    assert.equal(current.statusCode, 200, current.body);
    assert.deepEqual(current.json<{ data: { me: { email: string; roles: string[] } } }>().data.me, { email: 'private@example.test', roles: [] }, current.body);
  } finally { await app.close(); }
});

test('admins stays super-admin-only and mutations are rejected', async () => {
  const { app } = appFor();
  try {
    const denied = await app.inject({ method: 'POST', url: '/api/graphql', headers: { authorization: `Bearer ${alice}` }, payload: { query: '{ admins { username } }' } });
    assert.equal(denied.statusCode, 403);
    const mutation = await app.inject({ method: 'POST', url: '/api/graphql', payload: { query: 'mutation { anything }' } });
    assert.equal(mutation.statusCode, 400);
    assert.equal(mutation.json<{ errors: Array<{ extensions: { code: string } }> }>().errors[0]?.extensions.code, 'query_only');
  } finally { await app.close(); }
});

test('super admins can read role assignments through the feature resolver', async () => {
  const { app } = appFor(['super_admin']);
  try {
    const response = await app.inject({
      method: 'POST', url: '/api/graphql', headers: { authorization: `Bearer ${admin}` },
      payload: { query: '{ admins { userId username role } }' },
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json<{ data: { admins: unknown[] } }>().data.admins, [{ userId: admin, username: 'Alice', role: 'super_admin' }]);
  } finally { await app.close(); }
});

test('REST and GraphQL role reads perform each auth lookup once and reload roles on the next request', async () => {
  for (const [method, url, payload] of [
    ['GET', '/api/roles', undefined],
    ['POST', '/api/graphql', { query: '{ admins { userId } again: admins { userId } }' }],
  ] as const) {
    const currentRoles: ('admin' | 'super_admin')[] = ['super_admin'];
    const { app, seen } = appFor(currentRoles);
    const count = (part: string) => [...seen].filter(([sql]) => sql.includes(part)).reduce((sum, [, value]) => sum + value, 0);
    try {
      const response = await app.inject({ method, url, payload, headers: { authorization: `Bearer ${admin}` } });
      assert.equal(response.statusCode, 200, response.body);
      assert.equal(count('FROM auth_gateway.memberships'), 1);
      assert.equal(count('SELECT role FROM auth_gateway.user_roles'), 1);
      assert.equal(count('session_active'), 1);
      assert.equal(count('SELECT r.user_id::text'), 1);
      currentRoles[0] = 'admin';
      const denied = await app.inject({ method, url, payload, headers: { authorization: `Bearer ${admin}` } });
      assert.equal(denied.statusCode, 403, denied.body);
      assert.equal(count('SELECT role FROM auth_gateway.user_roles'), 2);
      assert.equal(count('SELECT r.user_id::text'), 1);
    } finally { await app.close(); }
  }
});

test('role reads preserve transport-specific auth error precedence', async () => {
  for (const fresh of [false, true]) {
    const { app } = appFor(['super_admin'], false, { membership: { eligible: true, fresh }, activeSession: false });
    try {
      const headers = { authorization: `Bearer ${admin}` };
      const rest = await app.inject({ method: 'GET', url: '/api/roles', headers });
      const graphql = await app.inject({ method: 'POST', url: '/api/graphql', headers, payload: { query: '{ admins { userId } }' } });
      assert.equal(rest.statusCode, 401);
      assert.equal(rest.json().error, fresh ? 'session_expired' : 'membership_refresh_required');
      assert.equal(graphql.statusCode, 401);
      assert.equal(graphql.json().error, 'session_expired');
    } finally { await app.close(); }
  }
});

test('combined accounts and me reads calculate the league once and constrain the current account query', async () => {
  const { app, seen } = appFor();
  try {
    const response = await app.inject({
      method: 'POST', url: '/api/graphql', headers: { authorization: `Bearer ${alice}` },
      payload: { query: '{ accounts { id } me { id email } }' },
    });
    assert.equal(response.statusCode, 200, response.body);
    const summaries = [...seen].filter(([sql]) => sql.includes('AS season_stats'));
    assert.equal(summaries.length, 2);
    assert.equal(summaries.find(([sql]) => sql.includes('FROM public.accounts a ORDER BY'))?.[1], 1);
    assert.equal(summaries.find(([sql]) => sql.includes('FROM public.accounts a WHERE a.id=?::uuid'))?.[1], 1);
    assert.equal(response.json().data.me.id, alice);
    assert.equal(response.json().data.accounts[0].email, undefined);
  } finally { await app.close(); }
});

test('query breadth is bounded and request envelopes reject batch/arbitrary properties', async () => {
  const { app } = appFor();
  try {
    const wideQuery = `{ ${Array.from({ length: 11 }, (_, index) => `field${index}: season`).join(' ')} }`;
    const wide = await app.inject({ method: 'POST', url: '/api/graphql', payload: { query: wideQuery } });
    assert.equal(wide.statusCode, 400);
    assert.equal(wide.json<{ errors: Array<{ extensions: { code: string } }> }>().errors[0]?.extensions.code, 'query_too_complex');
    const batch = await app.inject({ method: 'POST', url: '/api/graphql', payload: [{ query: '{ season }' }] });
    assert.equal(batch.statusCode, 400);
    const arbitrary = await app.inject({ method: 'POST', url: '/api/graphql', payload: { query: '{ season }', url: '/api/roles' } });
    assert.equal(arbitrary.statusCode, 400);
    const tokenFlood = `{ ${Array.from({ length: 251 }, () => 'season').join(' ')} }`;
    const tooManyTokens = await app.inject({ method: 'POST', url: '/api/graphql', payload: { query: tokenFlood } });
    assert.equal(tooManyTokens.statusCode, 400);
    assert.equal(tooManyTokens.json<{ errors: Array<{ extensions: { code: string } }> }>().errors[0]?.extensions.code, 'query_too_complex');
  } finally { await app.close(); }
});

test('transient downstream failures remain visible without leaking internal details', async () => {
  const { app } = appFor([], true);
  try {
    const response = await app.inject({ method: 'POST', url: '/api/graphql', payload: { query: '{ season }' } });
    assert.equal(response.statusCode, 503);
    assert.match(response.body, /Request failed/);
    assert.doesNotMatch(response.body, /database detail/);
  } finally { await app.close(); }
});

test('unexpected resolver serialization errors fail closed with a safe 503', async () => {
  const { app } = appFor([], false, { account: { ...account, created_at: new Date(NaN) } });
  try {
    const response = await app.inject({ method: 'POST', url: '/api/graphql', payload: { query: '{ accounts { createdAt } }' } });
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.json().errors, [{ message: 'Request failed', extensions: { code: 'internal_error', status: 503 } }]);
  } finally { await app.close(); }
});

test('GraphQL and REST share pending-team visibility rules', async () => {
  const pending = { ...team, id: 'pending', status: 'pending', owner_username: 'Bob', pending_members: [{ username: 'Alice', status: 'pending' }] };
  const { app } = appFor([], false, { teams: [team, pending] });
  try {
    for (const token of [undefined, alice]) {
      const headers = token ? { authorization: `Bearer ${token}` } : {};
      const rest = await app.inject({ method: 'GET', url: '/api/teams', headers });
      const gql = await app.inject({ method: 'POST', url: '/api/graphql', headers, payload: { query: '{ teams { id } }' } });
      assert.equal(gql.statusCode, 200, gql.body);
      const expected = token ? ['team-1', 'pending'] : ['team-1'];
      assert.deepEqual(rest.json<Array<{ id: string }>>().map(row => row.id), expected);
      assert.deepEqual(gql.json<{ data: { teams: { id: string }[] } }>().data.teams.map(row => row.id), expected);
    }
  } finally { await app.close(); }
});

test('privileged feature reads enforce roles and membership for either transport', async () => {
  for (const membership of [{ eligible: false, fresh: true }, { eligible: true, fresh: false }]) {
    const { app } = appFor(['super_admin'], false, { membership });
    try {
      for (const [method, url, payload] of [['GET', '/api/roles', undefined], ['POST', '/api/graphql', { query: '{ admins { userId } }' }]] as const) {
        const response = await app.inject({ method, url, headers: { authorization: `Bearer ${admin}` }, payload });
        assert.equal(response.statusCode, membership.fresh ? 403 : 401, response.body);
      }
    } finally { await app.close(); }
  }
  const { app } = appFor();
  try {
    const response = await app.inject({ method: 'GET', url: '/api/roles', headers: { authorization: `Bearer ${alice}` } });
    assert.equal(response.statusCode, 403, response.body);
  } finally { await app.close(); }
});

test('domain admission errors retain status, code and Retry-After', async () => {
  for (const status of [429, 503]) {
    const { app } = appFor([], false, { settingsError: new HttpError(status, 'dependency_busy', 'private detail', 7) });
    try {
      const response = await app.inject({ method: 'POST', url: '/api/graphql', payload: { query: '{ season }' } });
      assert.equal(response.statusCode, status, response.body);
      assert.equal(response.headers['retry-after'], '7');
      assert.equal(response.json().errors[0].extensions.code, status === 503 ? 'service_unavailable' : 'dependency_busy');
      assert.doesNotMatch(response.body, /private detail/);
    } finally { await app.close(); }
  }
});
