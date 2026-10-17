import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { firstValueFrom, filter, type Subscription } from 'rxjs';
import { getClient, resetClient, resetQueries } from '../src/api/client';
import { TeamRecordsDocument } from '../src/api/generated/graphql';
import { request } from '../src/api/http';

Object.defineProperty(globalThis, 'document', { configurable: true, value: { cookie: 'napl-csrf=test' } });
const query = TeamRecordsDocument;
const subscriptions: Subscription[] = [];
const record = (version: number) => ({ teamId: 'blue', season: 'S1', played: version, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 });
const response = (version: number) => Response.json({ data: { teamRecords: [record(version)] } });
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function watch() {
  const observable = getClient().watchQuery({ query });
  const results: { data?: unknown; error?: Error }[] = [];
  subscriptions.push(observable.subscribe(result => { results.push(result); }));
  return { observable, results, ready: firstValueFrom(observable.pipe(filter(result => !result.loading))) };
}
afterEach(async () => {
  for (const subscription of subscriptions.splice(0)) subscription.unsubscribe();
  await resetClient();
  mock.restoreAll();
});

test('native cache-first reads deduplicate concurrent requests and retain results beyond 30 seconds', async context => {
  context.mock.timers.enable({ apis: ['Date'], now: 100 });
  let calls = 0;
  mock.method(globalThis, 'fetch', async () => { calls++; return response(calls); });
  const [first, same] = await Promise.all([getClient().query({ query }), getClient().query({ query })]);
  assert.deepEqual(first.data, same.data);
  assert.equal(calls, 1);
  context.mock.timers.tick(60_000);
  assert.deepEqual((await getClient().query({ query })).data, first.data);
  assert.equal(calls, 1);
});

test('native subscriptions react to cache writes and refetch is a one-shot network request', async () => {
  let calls = 0;
  mock.method(globalThis, 'fetch', async () => response(++calls));
  const { observable, results, ready } = watch();
  await ready;
  getClient().cache.writeQuery({ query, data: { teamRecords: [record(5)] } });
  await tick();
  assert.deepEqual(results.at(-1)?.data, { teamRecords: [record(5)] });
  await observable.refetch();
  assert.equal(calls, 2);
  assert.deepEqual((await getClient().query({ query })).data, { teamRecords: [record(2)] });
  assert.equal(calls, 2);
});

test('failed commands preserve cached reads; successful commands refetch each active query once', async () => {
  let reads = 0;
  mock.method(globalThis, 'fetch', async (url, init) => {
    if (String(url) === '/api/team-records') return response(++reads);
    return init?.method === 'DELETE' ? Response.json({ error: 'forbidden' }, { status: 403 }) : new Response(null, { status: 204 });
  });
  const { ready, results } = watch();
  await ready;
  await assert.rejects(request('/api/teams/blue', 'DELETE'));
  assert.equal(reads, 1);
  assert.deepEqual((await getClient().query({ query })).data, { teamRecords: [record(1)] });
  await request('/api/teams/blue', 'PATCH', {});
  assert.equal(reads, 2);
  assert.deepEqual(results.at(-1)?.data, { teamRecords: [record(2)] });
});

test('a successful command remains successful when its refetch fails and query subscribers see the error', async () => {
  let reads = 0;
  mock.method(globalThis, 'fetch', async url => {
    if (String(url) !== '/api/team-records') return Response.json({ saved: true });
    return ++reads === 1 ? response(1) : Response.json({ errors: [{ message: 'refresh failed' }] });
  });
  const { ready, results } = watch();
  await ready;
  assert.deepEqual(await request('/api/teams/blue', 'PATCH', {}), { saved: true });
  assert.match(results.at(-1)?.error?.message ?? '', /refresh failed/);
  assert.equal(getClient().cache.readQuery({ query }), null);
});

test('successful commands cancel old reads and their late responses cannot overwrite the refetch', async () => {
  const late = Promise.withResolvers<Response>();
  const started = Promise.withResolvers<void>();
  let reads = 0;
  mock.method(globalThis, 'fetch', async url => {
    if (String(url) !== '/api/team-records') return new Response(null, { status: 204 });
    if (++reads === 1) { started.resolve(); return late.promise; }
    return response(2);
  });
  const old = Promise.allSettled([getClient().query({ query })]);
  const { ready } = watch();
  await started.promise;
  await request('/api/teams/blue', 'PATCH', {});
  await ready;
  late.resolve(response(1));
  await old;
  await tick();
  assert.deepEqual(getClient().cache.readQuery({ query }), { teamRecords: [record(2)] });
  assert.equal(reads, 2);
});

test('overlapping successful writes keep the final refetch and both command results', async () => {
  const firstRefetch = Promise.withResolvers<Response>();
  const firstStarted = Promise.withResolvers<void>();
  const commands = [Promise.withResolvers<Response>(), Promise.withResolvers<Response>()];
  let reads = 0;
  let writes = 0;
  mock.method(globalThis, 'fetch', async url => {
    if (String(url) !== '/api/team-records') return commands[writes++]!.promise;
    if (++reads === 2) { firstStarted.resolve(); return firstRefetch.promise; }
    return response(reads);
  });
  const { ready } = watch();
  await ready;
  const first = request('/api/teams/blue', 'PATCH', {});
  const second = request('/api/teams/red', 'PATCH', {});
  await tick();
  commands[0]!.resolve(Response.json({ saved: 1 }));
  await firstStarted.promise;
  commands[1]!.resolve(Response.json({ saved: 2 }));
  assert.deepEqual(await Promise.all([first, second]), [{ saved: 1 }, { saved: 2 }]);
  firstRefetch.resolve(response(2));
  await tick();
  assert.deepEqual(getClient().cache.readQuery({ query }), { teamRecords: [record(3)] });
  assert.equal(reads, 3);
});

for (const reason of ['logout', 'account change', 'cross-tab session change']) {
  test(`${reason} clears identity data without refetching and blocks late reads`, async () => {
    const late = Promise.withResolvers<Response>();
    const started = Promise.withResolvers<void>();
    let reads = 0;
    mock.method(globalThis, 'fetch', async () => { reads++; started.resolve(); return late.promise; });
    const client = getClient();
    const old = Promise.allSettled([client.query({ query })]);
    const delivered: unknown[] = [];
    subscriptions.push(client.watchQuery({ query }).subscribe(result => { if (result.data) delivered.push(result.data); }));
    await started.promise;
    await resetClient();
    assert.equal(getClient(), client);
    late.resolve(response(1));
    await old;
    await tick();
    assert.deepEqual(client.cache.extract(), {});
    assert.deepEqual(delivered, []);
    assert.equal(reads, 1);
  });
}

for (const resets of [1, 2]) {
  test(`identity clear stops departing observers before ${resets} queued resetStore refetches`, async () => {
    let reads = 0;
    mock.method(globalThis, 'fetch', async () => response(++reads));
    const { ready, observable } = watch();
    await ready;
    const invalidations = Array.from({ length: resets }, () => resetQueries());
    await resetClient();
    await Promise.all(invalidations);
    assert.equal(reads, 1);
    assert.deepEqual(getClient().cache.extract(), {});

    // The stable client and stopped observable can serve a fresh identity subscription.
    subscriptions.push(observable.subscribe(() => {}));
    await firstValueFrom(observable.pipe(filter(result => !result.loading)));
    assert.equal(reads, 2);
    assert.deepEqual(getClient().cache.readQuery({ query }), { teamRecords: [record(2)] });
  });
}

test('identity clear cancels an in-flight mutation refetch and a second queued resetStore', async () => {
  const late = Promise.withResolvers<Response>();
  const started = Promise.withResolvers<void>();
  let reads = 0;
  mock.method(globalThis, 'fetch', async () => {
    if (++reads === 2) { started.resolve(); return late.promise; }
    return response(reads);
  });
  const { ready } = watch();
  await ready;
  const first = resetQueries();
  await started.promise;
  const second = resetQueries();
  await resetClient();
  late.resolve(response(2));
  await Promise.all([first, second]);
  await tick();
  assert.equal(reads, 2);
  assert.deepEqual(getClient().cache.extract(), {});
});
