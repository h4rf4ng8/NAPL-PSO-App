import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, resetCsrf } from '../src/api/http';
import { graphql } from '../src/api/graphql';
import { resetClient } from '../src/api/client';
import { PublicLeagueDataDocument } from '../src/api/generated/graphql';
import { loadMemberLeague, loadPublicLeague } from '../src/features/dashboard/api';
import { loadAccountMatchPage, loadAccountOpponents } from '../src/features/accounts/api';
import { matchSchema } from '@napl/contracts/accounts';

const cookie = { value: '' };
Object.defineProperty(globalThis, 'document', { configurable: true, value: { get cookie() { return cookie.value; } } });
const json = (body: unknown, status = 200) => Response.json(body, { status });
afterEach(() => { resetClient(); mock.restoreAll(); cookie.value = ''; resetCsrf(); });

const account = {
  id: 'p1', username: 'Alice', position: 'ST', teamId: null, imageUrl: null, country: null,
  stats: { games: 0, wins: 0, draws: 0, losses: 0, goals: 0, assists: 0, passes: 0, tackles: 0, deflects: 0, catches: 0, cleanSheets: 0, motm: 0 },
  matches: [], awards: [], championships: [], totwUntil: null, cheater: false, strikersId: null,
  steamUrl: null, createdAt: 1,
};
const me = { ...account, email: 'alice@example.test', roles: ['admin'], pendingImageUrl: null };
const memberData = () => ({ data: {
  accounts: [{ __typename: 'Account', ...account }], teams: [], teamRecords: [], season: 'S3', weightings: null, news: [], votingPeriods: [],
  me: { __typename: 'CurrentAccount', ...me },
} });

test('public league data is one GraphQL read and requests only public account fields', async () => {
  cookie.value = 'napl-csrf=csrf-value';
  const calls: { url: string; init: RequestInit }[] = [];
  mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} });
    return json({ data: { accounts: [{ __typename: 'Account', ...account }], teams: [], teamRecords: [] } });
  });

  const result = await loadPublicLeague();
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, '/api/graphql');
  assert.equal(calls[0]!.init.method, 'POST');
  assert.deepEqual(result.players, [account]);
  const headers = new Headers(calls[0]!.init.headers);
  assert.equal(headers.get('X-CSRF-Token'), 'csrf-value');
  assert.equal(calls[0]!.init.credentials, 'same-origin');
  const body = JSON.parse(String(calls[0]!.init.body)) as { query: string };
  assert.match(body.query, /accounts\s*\{/);
  assert.doesNotMatch(body.query, /email|roles|pendingImageUrl/);
});

test('account history loaders request one bounded filtered page and validate summaries', async () => {
  cookie.value = 'napl-csrf=csrf-value';
  const requests: { query: string; variables: Record<string, unknown> }[] = [];
  const match = { id: 'm1', date: 1, season: 'S2', opponent: 'Blue', result: 'W', goals: 1, assists: 0,
    passes: 5, tackles: 2, deflects: 0, catches: 0, cleanSheet: false, motm: false };
  mock.method(globalThis, 'fetch', async (_url, init) => {
    const request = JSON.parse(String(init?.body));
    requests.push(request);
    return json({ data: { accountMatches: { nodes: [match], pageInfo: { endCursor: 'next', hasNextPage: true } } } });
  });
  const page = await loadAccountMatchPage('p1', 'previous', 'S2', 'Blue');
  assert.equal(page.nodes[0]?.id, 'm1');
  assert.deepEqual(page.pageInfo, { endCursor: 'next', hasNextPage: true });
  assert.deepEqual(requests[0]?.variables, { id: 'p1', first: 25, after: 'previous', season: 'S2', opponent: 'Blue' });
});

test('history loader errors are surfaced for retry UI', async () => {
  cookie.value = 'napl-csrf=csrf-value';
  mock.method(globalThis, 'fetch', async () => json({ data: { accountOpponents: [{ opponent: 'Blue', games: -1 }] } }));
  await assert.rejects(loadAccountOpponents('p1'), /Invalid GraphQL opponent summary data/);
});

test('member dashboard loads once without role assignments and preserves private account data', async () => {
  cookie.value = 'napl-csrf=csrf-value';
  const requests: { query: string; variables: object }[] = [];
  mock.method(globalThis, 'fetch', async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)));
    return json(memberData());
  });
  const loaded = await loadMemberLeague();
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0]!.variables, {});
  assert.doesNotMatch(requests[0]!.query, /admins|includeAdmins/);
  assert.deepEqual(loaded.players, [account]);
  assert.equal(loaded.currentSeason, 'S3');
  assert.equal(loaded.me.email, 'alice@example.test');
  assert.deepEqual(loaded.me.roles, ['admin']);
});

test('GraphQL errors reject partial HTTP 200 data', async () => {
  cookie.value = 'napl-csrf=csrf-value';
  mock.method(globalThis, 'fetch', async () => json({ data: { accounts: [] }, errors: [{ message: 'roles unavailable' }] }));
  await assert.rejects(graphql(PublicLeagueDataDocument, {}), /roles unavailable/);
});

test('GraphQL uses same-origin authenticated transport and does not retry failed reads', async () => {
  cookie.value = '__Host-napl-csrf=csrf-value';
  const calls: RequestInit[] = [];
  mock.method(globalThis, 'fetch', async (_url, init) => {
    calls.push(init ?? {});
    return json({ error: { code: 'upstream_unavailable' } }, 503);
  });
  await assert.rejects(loadPublicLeague(), error => error instanceof ApiError && error.status === 503);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.credentials, 'same-origin');
  assert.equal(new Headers(calls[0]!.headers).get('X-CSRF-Token'), 'csrf-value');
});

test('schema-null fields and new role names have safe UI defaults', async () => {
  cookie.value = 'napl-csrf=csrf-value';
  mock.method(globalThis, 'fetch', async () => json({ data: {
    ...memberData().data,
    accounts: [{ __typename: 'Account', ...account, stats: {}, createdAt: null }],
    me: { __typename: 'CurrentAccount', ...me, createdAt: null, roles: ['future_role'] },
  } }));
  const loaded = await loadMemberLeague();
  assert.equal(loaded.players[0]?.createdAt, 0);
  assert.equal(loaded.players[0]?.stats.games, 0);
  assert.deepEqual(loaded.me.roles, []);
});

test('opaque JSON is validated before reaching the UI', async () => {
  cookie.value = 'napl-csrf=csrf-value';
  mock.method(globalThis, 'fetch', async () => json({ data: {
    accounts: [{ __typename: 'Account', ...account, matches: [{ arbitrary: true }] }], teams: [], teamRecords: [],
  } }));
  await assert.rejects(loadPublicLeague(), /Invalid GraphQL account JSON/);
});

test('numeric legacy Strikers IDs accepted by the API normalize to client strings', async () => {
  cookie.value = 'napl-csrf=csrf-value';
  const match = { id: 'm1', date: 1, season: 'S1', opponent: 'Blue', result: 'W', goals: 1, assists: 0,
    passes: 0, tackles: 0, deflects: 0, catches: 0, cleanSheet: true, motm: false, strikersMatchId: 123 };
  mock.method(globalThis, 'fetch', async () => json({ data: {
    accounts: [{ __typename: 'Account', ...account, matches: [match] }], teams: [], teamRecords: [],
  } }));
  const result = await loadPublicLeague();
  assert.equal(result.players[0]?.matches[0]?.strikersMatchId, '123');
});

test('legacy numeric Strikers IDs normalize only when finite', () => {
  const match = { id: 'm1', date: 1, season: 'S1', opponent: 'Blue', result: 'W', goals: 1, assists: 0,
    passes: 0, tackles: 0, deflects: 0, catches: 0, cleanSheet: true, motm: false };
  assert.equal(matchSchema.parse({ ...match, strikersMatchId: 123 }).strikersMatchId, '123');
  assert.equal(matchSchema.safeParse({ ...match, strikersMatchId: Infinity }).success, false);
});

test('account decoder preserves historical account fields and accepts legacy award ids', async () => {
  cookie.value = 'napl-csrf=csrf-value';
  const match = { id: 'm1', date: 1, season: 'S1', opponent: 'Blue', result: 'W', goals: 1, assists: 0,
    passes: 0, tackles: 0, deflects: 0, catches: 0, cleanSheet: true, motm: false, strikersMatchId: 123, historicalFlag: true };
  const award = { awardId: 'golden-keeper-legacy', season: 'S1', source: 'import', legacyRank: 1 };
  const championship = { season: 'S1', placement: '1st', teamId: 'team-1', awardedAt: 1, source: 'archive' };
  mock.method(globalThis, 'fetch', async () => json({ data: {
    accounts: [{ __typename: 'Account', ...account, matches: [match], awards: [award], championships: [championship] }], teams: [], teamRecords: [],
  } }));
  const result = await loadPublicLeague();
  assert.equal(result.players[0]?.matches[0]?.strikersMatchId, '123');
  assert.equal(result.players[0]?.matches[0]?.historicalFlag, true);
  assert.equal(result.players[0]?.awards[0]?.awardId, 'golden-keeper-legacy');
  assert.equal(result.players[0]?.awards[0]?.legacyRank, 1);
  assert.equal(result.players[0]?.championships[0]?.source, 'archive');
});

test('account decoder rejects empty opaque records for each historical JSON field', async () => {
  cookie.value = 'napl-csrf=csrf-value';
  for (const field of ['matches', 'awards', 'championships'] as const) {
    mock.method(globalThis, 'fetch', async () => json({ data: {
      accounts: [{ __typename: 'Account', ...account, [field]: [{}] }], teams: [], teamRecords: [],
    } }));
    await assert.rejects(loadPublicLeague(), /Invalid GraphQL account JSON/);
    mock.restoreAll();
  }
});

test('Apollo deduplicates concurrent identical reads but explicit reloads reach the server', async () => {
  cookie.value = 'napl-csrf=csrf-value';
  let calls = 0;
  mock.method(globalThis, 'fetch', async () => {
    calls++;
    return json({ data: { accounts: [{ __typename: 'Account', ...account, username: `version-${calls}` }], teams: [], teamRecords: [] } });
  });
  const [first, same] = await Promise.all([loadPublicLeague(), loadPublicLeague()]);
  assert.equal(calls, 1);
  assert.deepEqual(first, same);
  const refreshed = await loadPublicLeague();
  assert.equal(calls, 2);
  assert.equal(refreshed.players[0]?.username, 'version-2');
});
