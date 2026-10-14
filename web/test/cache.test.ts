import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { gql } from '@apollo/client';
import { graphql } from '../src/api/graphql';
import { getClient, resetClient } from '../src/api/client';
import { request } from '../src/api/http';

Object.defineProperty(globalThis, 'document', { configurable: true, value: { cookie: 'napl-csrf=test' } });
const query = gql`query CachedSeason { season }`;
afterEach(() => { mock.restoreAll(); resetClient(); });

test('GraphQL reuses fresh data, expires at 30 seconds and supports force refresh', async context => {
  context.mock.timers.enable({ apis: ['Date'], now: 100 });
  let calls = 0;
  mock.method(globalThis, 'fetch', async () => { calls++; return Response.json({ data: { season: 'S1' } }); });
  await graphql(query, {});
  await graphql(query, {});
  assert.equal(calls, 1);
  context.mock.timers.tick(30_001);
  await graphql(query, {});
  assert.equal(calls, 2);
  await graphql(query, {}, { force: true });
  assert.equal(calls, 3);
});

test('successful REST commands invalidate cached reads; failed commands do not', async () => {
  let reads = 0;
  mock.method(globalThis, 'fetch', async (url, init) => {
    if (String(url) === '/api/graphql') { reads++; return Response.json({ data: { season: 'S1' } }); }
    return init?.method === 'DELETE' ? Response.json({ error: 'forbidden' }, { status: 403 }) : new Response(null, { status: 204 });
  });
  await graphql(query, {});
  await assert.rejects(request('/api/example', 'DELETE'));
  await graphql(query, {});
  assert.equal(reads, 1);
  await request('/api/example', 'PUT', {});
  await graphql(query, {});
  assert.equal(reads, 2);
});

test('successful commands cancel pre-command reads and cannot restore their cached data', async () => {
  const response = Promise.withResolvers<Response>();
  const started = Promise.withResolvers<void>();
  mock.method(globalThis, 'fetch', async url => {
    if (String(url) === '/api/graphql') { started.resolve(); return response.promise; }
    return new Response(null, { status: 204 });
  });
  const old = getClient();
  const loading = (async () => {
    try { await graphql(query, {}); }
    catch { /* Invalidation cancels the previous client. */ }
  })();
  await started.promise;
  await request('/api/example', 'PUT', {});
  assert.notEqual(getClient(), old);
  response.resolve(Response.json({ data: { season: 'old' } }));
  await loading;
  assert.deepEqual(getClient().cache.extract(), {});
});

test('parallel distinct query completions keep browser cache entries bounded', async () => {
  const page = gql`query Pages($key: String!) { item(key: $key) { id value } }`;
  let calls = 0;
  mock.method(globalThis, 'fetch', async (_url, init) => {
    calls++;
    const { variables } = JSON.parse(String(init?.body)) as { variables: { key: string } };
    return Response.json({ data: { item: { __typename: 'Item', id: variables.key, value: variables.key } } });
  });
  await Promise.all(Array.from({ length: 40 }, (_, key) => graphql(page, { key: String(key) })));
  const cache = getClient().cache.extract();
  assert.ok(Object.keys(cache).filter(key => key.startsWith('Item:')).length <= 32);
  assert.ok(Object.keys(cache.ROOT_QUERY ?? {}).filter(key => key.startsWith('item(')).length <= 32);
  assert.equal(calls, 40);
  await graphql(page, { key: '39' });
  assert.equal(calls, 40);
  await graphql(page, { key: '0' });
  assert.equal(calls, 41);
});
