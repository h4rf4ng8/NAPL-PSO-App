import { afterEach, mock, test } from 'node:test';
import { gql, type OperationVariables, type TypedDocumentNode } from '@apollo/client';
import { firstValueFrom, filter } from 'rxjs';
import assert from 'node:assert/strict';
import { ApiError, request, resetCsrf } from '../src/api/http';
import { client, resetClient } from '../src/api/client';
import { StandingsDocument, MemberLeagueDataDocument, TeamRecordsDocument, AccountMatchesDocument, AccountOpponentsDocument, AccountCardPreviewsDocument, DefaultPositionWeightsDocument } from '../src/api/generated/graphql';
import { mapMemberLeague, mapPublicLeague } from '../src/features/dashboard/api';
import { mapAccountCardPreviews, mapAccountMatchPage, mapAccountOpponents, mapDefaultPositionWeights, mapAccount } from '../src/features/accounts/api';
import { mapTeamRecords } from '../src/features/matches/api';
import { mapTeam } from '../src/features/teams/api';
import { mapVotingPeriod } from '../src/features/voting/api';
import { matchSchema } from '@napl/contracts/accounts';

async function graphql<T, V extends OperationVariables>(query: TypedDocumentNode<T, V>, variables: V) {
  const { data } = await client.query({ query, variables });
  assert.ok(data);
  return data as T;
}
const loadPublicLeague = async () => mapPublicLeague(await graphql(StandingsDocument, {}));
const loadMemberLeague = async () => mapMemberLeague(await graphql(MemberLeagueDataDocument, {}));
const loadTeamRecords = async () => mapTeamRecords(await graphql(TeamRecordsDocument, {}));
const loadAccountMatchPage = async (after: string | null, season: string | null = null, opponent: string | null = null) =>
  mapAccountMatchPage(await graphql(AccountMatchesDocument, { id: 'p1', first: 25, after, season, opponent }));
const loadAccountOpponents = async () => mapAccountOpponents(await graphql(AccountOpponentsDocument, { id: 'p1' }));
const loadAccountCardPreviews = async () => mapAccountCardPreviews(await graphql(AccountCardPreviewsDocument, {}));
const loadDefaultPositionWeights = async () => mapDefaultPositionWeights(await graphql(DefaultPositionWeightsDocument, {}));

const cookie = { value: '' };
Object.defineProperty(globalThis, 'document', { configurable: true, value: { get cookie() { return cookie.value; } } });
const json = (body: unknown, status = 200) => Response.json(body, { status });
const invalidHistoryResponse = (field: string) => async () => json({ data: {
  accounts: [{ ...wireAccount(), [field]: [{}] }], teams: [], teamRecords: [],
} });
afterEach(async () => { await resetClient(); mock.restoreAll(); cookie.value = ''; resetCsrf(); });

const account = {
  id: 'p1', username: 'Alice', position: 'ST', teamId: null, imageUrl: null, country: null,
  stats: { games: 0, wins: 0, draws: 0, losses: 0, goals: 0, assists: 0, passes: 0, tackles: 0, deflects: 0, catches: 0, cleanSheets: 0, motm: 0 },
  ranking: { score: 0, percentile: 0, ranked: false, gamesPlayed: 0, tier: 'BRONZE' },
  cardStats: [{ season: 'all', cells: [
    { label: 'GOALS', value: '0' }, { label: 'TKL', value: '0.0' },
    { label: 'ASSIST', value: '0' }, { label: 'W-L', value: '0-0' },
    { label: 'PASS', value: '0.0' }, { label: 'GP', value: '0' },
  ] }],
  matches: [], awards: [], championships: [], totwUntil: null, cheater: false, strikersId: null,
  steamUrl: null, createdAt: 1,
};
const wireAccount = () => ({
  ...account, __typename: 'Account', seasonStats: null,
  ranking: { __typename: 'AccountRanking', ...account.ranking },
  cardStats: account.cardStats.map(season => ({ ...season, __typename: 'AccountCardStatSeason',
    cells: season.cells.map(cell => ({ ...cell, __typename: 'AccountCardStatCell' })),
  })),
});
const me = { ...account, email: 'alice@example.test', roles: ['admin'], pendingImageUrl: null };
const memberData = () => ({ data: {
  accounts: [{ ...wireAccount() }], teams: [], teamRecords: [], season: 'S3', weightings: null, news: [], votingPeriods: [],
  me: { ...wireAccount(), ...me, __typename: 'CurrentAccount', ranking: wireAccount().ranking, cardStats: wireAccount().cardStats },
} });

test('maintained reads use their own endpoints and reuse completed responses', async () => {
  cookie.value = 'napl-csrf=csrf-value';
  const calls: { url: string; body: unknown }[] = [];
  mock.method(globalThis, 'fetch', async (url, init) => {
    const body = JSON.parse(String(init?.body));
    calls.push({ url: String(url), body });
    return json({ data: { ...memberData().data,
      accounts: [{ ...wireAccount(), seasonStats: null }],
      me: { ...wireAccount(), ...me, __typename: 'CurrentAccount', ranking: wireAccount().ranking, cardStats: wireAccount().cardStats, seasonStats: null },
      accountMatches: { __typename: 'AccountMatchPage', nodes: [], pageInfo: { __typename: 'AccountMatchPageInfo', endCursor: null, hasNextPage: false } },
      accountOpponents: [], accountCardPreviews: [], defaultPositionWeights: {},
    } });
  });
  for (const load of [loadPublicLeague, loadMemberLeague, loadTeamRecords,
    () => loadAccountMatchPage(null), () => loadAccountOpponents(),
    loadAccountCardPreviews, loadDefaultPositionWeights]) {
    await resetClient();
    assert.deepEqual(await load(), await load());
  }
  assert.deepEqual(calls, [
    { url: '/api/standings', body: { variables: {} } },
    { url: '/api/dashboard', body: { variables: {} } },
    { url: '/api/team-records', body: { variables: {} } },
    { url: '/api/account-matches', body: { variables: { id: 'p1', first: 25, after: null, season: null, opponent: null } } },
    { url: '/api/account-opponents', body: { variables: { id: 'p1' } } },
    { url: '/api/account-card-previews', body: { variables: {} } },
    { url: '/api/default-position-weights', body: { variables: {} } },
  ]);
});

test('unknown operations fail before any network request', async () => {
  const fetch = mock.method(globalThis, 'fetch');
  await assert.rejects(graphql(gql`query UnknownRead { season }`, {}), /Unknown GraphQL operation: UnknownRead/);
  await assert.rejects(graphql(gql`query { season }`, {}), /Unknown GraphQL operation/);
  assert.equal(fetch.mock.callCount(), 0);
});

test('standings uses its named endpoint in one read and requests only public account fields', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} });
    return json({ data: { accounts: [{ ...wireAccount() }], teams: [], teamRecords: [] } });
  });

  const result = await loadPublicLeague();
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, '/api/standings');
  assert.equal(calls[0]!.init.method, 'POST');
  assert.deepEqual(result.players, [account]);
  const headers = new Headers(calls[0]!.init.headers);
  assert.equal(headers.get('Apollo-Require-Preflight'), 'true');
  assert.equal(headers.get('X-CSRF-Token'), null);
  assert.equal(headers.get('Idempotency-Key'), null);
  assert.equal(headers.get('Content-Type'), 'application/json');
  assert.equal(calls[0]!.init.credentials, 'same-origin');
  assert.deepEqual(JSON.parse(String(calls[0]!.init.body)), { variables: {} });
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
  const page = await loadAccountMatchPage('previous', 'S2', 'Blue');
  assert.equal(page.nodes[0]?.id, 'm1');
  assert.deepEqual(page.pageInfo, { endCursor: 'next', hasNextPage: true });
  assert.deepEqual(requests[0]?.variables, { id: 'p1', first: 25, after: 'previous', season: 'S2', opponent: 'Blue' });
});

test('tier previews load all server computed cards in one GraphQL request', async () => {
  cookie.value = 'napl-csrf=csrf-value';
  const calls: unknown[] = [];
  mock.method(globalThis, 'fetch', async (_url, init) => {
    calls.push(init);
    return json({ data: { accountCardPreviews: [{
      label: 'BRONZE', description: 'server preview', account: { ...wireAccount() },
    }] } });
  });
  const previews = await loadAccountCardPreviews();
  assert.equal(calls.length, 1);
  assert.equal(previews[0]?.account.ranking.ranked, false);
  assert.equal(previews[0]?.account.cardStats[0]?.cells[0]?.value, '0');
});

test('tier preview GraphQL failures surface without retrying or per card requests', async () => {
  cookie.value = 'napl-csrf=csrf-value';
  let calls = 0;
  mock.method(globalThis, 'fetch', async () => {
    calls++;
    return json({ data: null, errors: [{ message: 'preview unavailable' }] });
  });
  await assert.rejects(loadAccountCardPreviews(), /preview unavailable/);
  assert.equal(calls, 1);
});

test('history loader errors are surfaced for retry UI', async () => {
  cookie.value = 'napl-csrf=csrf-value';
  mock.method(globalThis, 'fetch', async () => json({ data: { accountOpponents: [{ opponent: 'Blue', games: -1 }] } }));
  await assert.rejects(loadAccountOpponents(), /Invalid GraphQL opponent summary data/);
});

test('member dashboard loads once without role assignments and preserves private account data', async () => {
  cookie.value = 'napl-csrf=csrf-value';
  const requests: { query: string; variables: object }[] = [];
  mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(String(url), '/api/dashboard');
    requests.push(JSON.parse(String(init?.body)));
    return json(memberData());
  });
  const loaded = await loadMemberLeague();
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0]!.variables, {});
  assert.deepEqual(requests[0], { variables: {} });
  assert.deepEqual(loaded.players, [account]);
  assert.equal(loaded.currentSeason, 'S3');
  assert.equal(loaded.me.email, 'alice@example.test');
  assert.deepEqual(loaded.me.roles, ['admin']);
});

test('GraphQL errors reject partial HTTP 200 data', async () => {
  cookie.value = 'napl-csrf=csrf-value';
  mock.method(globalThis, 'fetch', async () => json({ data: { accounts: [] }, errors: [{ message: 'roles unavailable' }] }));
  await assert.rejects(graphql(StandingsDocument, {}), /roles unavailable/);
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
  assert.equal(new Headers(calls[0]!.headers).get('Apollo-Require-Preflight'), 'true');
  assert.equal(new Headers(calls[0]!.headers).get('X-CSRF-Token'), null);
});

test('Apollo and REST reads share one session renewal and retry each request once', async () => {
  cookie.value = 'napl-csrf=before';
  const renewal = Promise.withResolvers<Response>();
  const started = Promise.withResolvers<void>();
  const calls: { path: string; headers: Headers }[] = [];
  mock.method(globalThis, 'fetch', async (url, init) => {
    const path = String(url);
    calls.push({ path, headers: new Headers(init?.headers) });
    if (path === '/auth/refresh') { started.resolve(); return renewal.promise; }
    const attempts = calls.filter(call => call.path === path).length;
    if (attempts === 1) return json({ errors: [{ extensions: { code: 'session_expired' } }] }, 401);
    return json(path === '/api/team-records' ? { data: { teamRecords: [] } } : []);
  });
  const pending = Promise.all([client.query({ query: TeamRecordsDocument }), request('/api/accounts')]);
  await started.promise;
  await new Promise<void>(resolve => setImmediate(resolve));
  cookie.value = 'napl-csrf=after';
  renewal.resolve(json({ ok: true }));
  const [result, accounts] = await pending;
  assert.deepEqual(result.data, { teamRecords: [] });
  assert.deepEqual(accounts, []);
  assert.equal(calls.filter(call => call.path === '/auth/refresh').length, 1);
  for (const path of ['/api/team-records', '/api/accounts']) assert.equal(calls.filter(call => call.path === path).length, 2);
  assert.equal(calls.find(call => call.path === '/auth/refresh')!.headers.get('X-CSRF-Token'), 'before');
  for (const call of calls) {
    if (call.path !== '/api/team-records') continue;
    assert.equal(call.headers.get('Apollo-Require-Preflight'), 'true');
    assert.equal(call.headers.get('X-CSRF-Token'), null);
  }
});

test('cancelling an Apollo read during shared renewal prevents its retry without cancelling REST', async () => {
  cookie.value = 'napl-csrf=present';
  const renewal = Promise.withResolvers<Response>();
  const started = Promise.withResolvers<void>();
  const calls: string[] = [];
  let graphSignal: AbortSignal | null | undefined;
  mock.method(globalThis, 'fetch', async (url, init) => {
    const path = String(url);
    calls.push(path);
    if (path === '/auth/refresh') { assert.equal(init?.signal, undefined); started.resolve(); return renewal.promise; }
    if (path === '/api/team-records') graphSignal = init?.signal;
    return calls.filter(value => value === path).length === 1 ? json({ error: 'access_expired' }, 401) : json([]);
  });
  const graph = Promise.allSettled([client.query({ query: TeamRecordsDocument })]);
  const rest = request('/api/accounts');
  await started.promise;
  await new Promise<void>(resolve => setImmediate(resolve));
  await resetClient();
  assert.equal(graphSignal?.aborted, true);
  renewal.resolve(json({ ok: true }));
  await graph;
  assert.deepEqual(await rest, []);
  assert.equal(calls.filter(path => path === '/api/team-records').length, 1);
  assert.equal(calls.filter(path => path === '/api/accounts').length, 2);
  assert.equal(calls.filter(path => path === '/auth/refresh').length, 1);
  assert.deepEqual(client.cache.extract(), {});
});

for (const refreshFails of [false, true]) {
  test(`Apollo session renewal terminates when ${refreshFails ? 'refresh fails' : 'the retry is still expired'}`, async () => {
    cookie.value = 'napl-csrf=present';
    const calls: string[] = [];
    mock.method(globalThis, 'fetch', async url => {
      const path = String(url);
      calls.push(path);
      return path === '/auth/refresh' && !refreshFails ? json({ ok: true }) : json({ error: 'membership_refresh_required' }, 401);
    });
    await assert.rejects(client.query({ query: TeamRecordsDocument }), error => error instanceof ApiError && error.code === 'membership_refresh_required');
    assert.deepEqual(calls, refreshFails ? ['/api/team-records', '/auth/refresh'] : ['/api/team-records', '/auth/refresh', '/api/team-records']);
  });
}

test('schema-null fields and new role names have safe UI defaults', async () => {
  cookie.value = 'napl-csrf=csrf-value';
  mock.method(globalThis, 'fetch', async () => json({ data: {
    ...memberData().data,
    accounts: [{ ...wireAccount(), stats: {}, createdAt: null }],
    me: { ...wireAccount(), ...me, __typename: 'CurrentAccount', ranking: wireAccount().ranking, cardStats: wireAccount().cardStats, createdAt: null, roles: ['future_role'] },
  } }));
  const loaded = await loadMemberLeague();
  assert.equal(loaded.players[0]?.createdAt, 0);
  assert.equal(loaded.players[0]?.stats.games, 0);
  assert.deepEqual(loaded.me.roles, []);
});

test('malformed opaque JSON fails before cache writes or subscriber delivery', async () => {
  cookie.value = 'napl-csrf=csrf-value';
  mock.method(globalThis, 'fetch', async () => json({ data: {
    accounts: [{ ...wireAccount(), awards: [{ arbitrary: true }] }], teams: [], teamRecords: [],
  } }));
  const observable = client.watchQuery({ query: StandingsDocument });
  const delivered: unknown[] = [];
  const subscription = observable.subscribe(result => { if (result.data) delivered.push(result.data); });
  const result = await firstValueFrom(observable.pipe(filter(value => !value.loading)));
  subscription.unsubscribe();
  assert.match(result.error?.message ?? '', /Invalid GraphQL account JSON/);
  assert.deepEqual(delivered, []);
  assert.deepEqual(client.cache.extract(), {});
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
  const result = { players: [mapAccount({ ...account, matches: [match], awards: [award], championships: [championship] } as never)] };
  assert.equal(result.players[0]?.matches[0]?.strikersMatchId, '123');
  assert.equal(result.players[0]?.matches[0]?.historicalFlag, true);
  assert.equal(result.players[0]?.awards[0]?.awardId, 'golden-keeper-legacy');
  assert.equal(result.players[0]?.awards[0]?.legacyRank, 1);
  assert.equal(result.players[0]?.championships[0]?.source, 'archive');
});

test('account decoder rejects empty opaque records for each historical JSON field', async () => {
  cookie.value = 'napl-csrf=csrf-value';
  for (const field of ['awards', 'championships'] as const) {
    mock.method(globalThis, 'fetch', invalidHistoryResponse(field));
    await assert.rejects(loadPublicLeague(), /Invalid GraphQL account JSON/);
    mock.restoreAll();
  }
});

test('account stats keep arbitrary finite keys while record mappers reject native objects', () => {
  const decoded = mapAccount({ ...account, stats: { extraMetric: 4 } } as never);
  assert.equal(decoded.stats.extraMetric, 4);
  assert.equal(decoded.stats.games, 0);
  assert.throws(() => mapAccount({ ...account, stats: { extraMetric: null } } as never), /Invalid GraphQL account stats/);
  assert.throws(() => mapTeam({ lineup: new Date() } as never), /Invalid GraphQL team lineup/);
  assert.throws(() => mapTeam({ lineup: new Error('not a JSON record') } as never), /Invalid GraphQL team lineup/);
  assert.throws(() => mapVotingPeriod({ winners: new Error('not a JSON record') } as never), /Invalid GraphQL voting winners/);
});

test('team and voting records validate boundaries while preserving arbitrary keys and nulls', () => {
  assert.deepEqual(mapTeam({ lineup: { 'custom-slot': 'Alice' } } as never).lineup, { 'custom-slot': 'Alice' });
  assert.throws(() => mapTeam({ lineup: [] } as never), /Invalid GraphQL team lineup/);
  assert.throws(() => mapTeam({ lineup: null } as never), /Invalid GraphQL team lineup/);
  assert.deepEqual(mapVotingPeriod({ winners: { customPosition: 'Alice' } } as never).winners, { customPosition: 'Alice' });
  assert.equal(mapVotingPeriod({ winners: null } as never).winners, null);
  assert.throws(() => mapVotingPeriod({ winners: { customPosition: 1 } } as never), /Invalid GraphQL voting winners/);

});

test('Apollo deduplicates concurrent reads and reuses complete responses beyond 30 seconds', async context => {
  context.mock.timers.enable({ apis: ['Date'], now: 100 });
  cookie.value = 'napl-csrf=csrf-value';
  let calls = 0;
  mock.method(globalThis, 'fetch', async () => {
    calls++;
    return json({ data: { accounts: [{ ...wireAccount(), seasonStats: null, username: `version-${calls}` }], teams: [], teamRecords: [] } });
  });
  const [first, same] = await Promise.all([loadPublicLeague(), loadPublicLeague()]);
  assert.equal(calls, 1);
  assert.deepEqual(first, same);
  const cached = await loadPublicLeague();
  assert.equal(calls, 1);
  assert.deepEqual(cached, first);
  context.mock.timers.tick(30_001);
  const refreshed = await loadPublicLeague();
  assert.equal(calls, 1);
  assert.equal(refreshed.players[0]?.username, 'version-1');
});
