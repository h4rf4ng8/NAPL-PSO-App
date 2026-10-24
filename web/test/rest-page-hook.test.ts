import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useRestPage } from '../src/hooks/use-rest-page';

type PageState = ReturnType<typeof useRestPage<string>>;

function PageProbe({ path, pageSize, observe }: { path: string | null; pageSize?: number; observe: (state: PageState) => void }) {
  observe(useRestPage<string>(path, pageSize));
  return null;
}

test('REST pagination starts over after changing and clearing a filter or reopening a picker', async t => {
  const paths: string[] = [];
  t.mock.method(globalThis, 'fetch', async url => {
    const request = new URL(String(url));
    paths.push(request.pathname + request.search);
    return Response.json({ nodes: [request.search], pageInfo: { endCursor: 'page-2', hasNextPage: true }, totalCount: 3 });
  });
  const observe = mock.fn<(state: PageState) => void>();
  const state = () => observe.mock.calls.at(-1)!.arguments[0];
  const all = '/api/accounts?search=';
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(createElement(PageProbe, { path: all, observe })); });
  t.after(async () => { await act(async () => { renderer.unmount(); }); });
  await act(async () => { state().next(); });
  assert.equal(state().canPrevious, true);
  await act(async () => { renderer.update(createElement(PageProbe, { path: '/api/accounts?search=alice', observe })); });
  assert.equal(state().canPrevious, false);
  await act(async () => { renderer.update(createElement(PageProbe, { path: all, observe })); });
  assert.equal(state().canPrevious, false, 'clearing a filter must not restore the old second page');
  assert.equal(paths.at(-1), all);

  await act(async () => { state().next(); });
  assert.equal(state().canPrevious, true);
  const beforeClose = paths.length;
  await act(async () => { renderer.update(createElement(PageProbe, { path: null, observe })); });
  assert.equal(paths.length, beforeClose, 'closing a lazy picker makes no request');
  await act(async () => { renderer.update(createElement(PageProbe, { path: all, observe })); });
  assert.equal(state().canPrevious, false, 'reopening starts at the first page');
  assert.deepEqual(paths, [all, `${all}&after=page-2`, '/api/accounts?search=alice', all, `${all}&after=page-2`, all]);
});

test('50-row pages collect bounded chunks, retain final cursors and restart filters without publishing a partial page', async t => {
  const calls: { first: number; after: number; search: string }[] = [];
  let failAt: number | null = null;
  t.mock.method(globalThis, 'fetch', async url => {
    const query = new URL(String(url)).searchParams;
    const first = Number(query.get('first')); const after = Number(query.get('after') ?? 0); const search = query.get('search') ?? '';
    calls.push({ first, after, search });
    if (after === failAt) return Response.json({ message: 'chunk failed' }, { status: 503 });
    const count = Math.min(first, 17, 105 - after);
    return Response.json({ nodes: Array.from({ length: count }, (_, index) => `${search}${after + index + 1}`), totalCount: 105, pageInfo: { endCursor: String(after + count), hasNextPage: after + count < 105 } });
  });
  const observe = mock.fn<(state: PageState) => void>(); const state = () => observe.mock.calls.at(-1)!.arguments[0];
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(createElement(PageProbe, { path: '/api/accounts', pageSize: 50, observe })); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  assert.deepEqual(state().data?.nodes, Array.from({ length: 50 }, (_, index) => String(index + 1)));
  assert.equal(state().data?.totalCount, 105);
  assert.equal(state().data?.pageInfo.endCursor, '50');
  assert.deepEqual(calls.slice(0, 3), [{ first: 50, after: 0, search: '' }, { first: 33, after: 17, search: '' }, { first: 16, after: 34, search: '' }]);
  failAt = 67;
  await act(async () => state().next());
  assert.equal(state().data, undefined); assert.equal(state().error, 'chunk failed');
  const failedCalls = calls.length;
  await act(async () => state().next());
  assert.equal(calls.length, failedCalls, 'next cannot skip a partially failed display page');
  failAt = null;
  await act(async () => state().reload());
  assert.deepEqual(state().data?.nodes, Array.from({ length: 50 }, (_, index) => String(index + 51)));
  assert.equal(state().data?.pageInfo.endCursor, '100');
  await act(async () => state().next());
  assert.deepEqual(state().data?.nodes, ['101', '102', '103', '104', '105']);
  assert.equal(state().data?.pageInfo.hasNextPage, false);
  await act(async () => state().previous());
  assert.equal(state().data?.nodes[0], '51');
  await act(async () => renderer.update(createElement(PageProbe, { path: '/api/accounts?search=GK', pageSize: 50, observe })));
  assert.equal(state().data?.nodes[0], 'GK1'); assert.equal(state().data?.nodes.length, 50); assert.equal(state().canPrevious, false);
  assert.ok(observe.mock.calls.every(call => !call.arguments[0].data || [5, 50].includes(call.arguments[0].data.nodes.length)), 'no partial chunk is published');
});

test('50-row pages reject an empty or repeated cursor and abort the old filter read', async t => {
  const old = Promise.withResolvers<Response>();
  let signal: AbortSignal | undefined;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const query = new URL(String(url)).searchParams;
    if (query.get('search') === 'old') { signal = options?.signal ?? undefined; return old.promise; }
    return Response.json({ nodes: query.has('after') ? [] : ['first'], totalCount: 100, pageInfo: { endCursor: 'same', hasNextPage: true } });
  });
  const observe = mock.fn<(state: PageState) => void>(); const state = () => observe.mock.calls.at(-1)!.arguments[0];
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(createElement(PageProbe, { path: '/api/accounts?search=old', pageSize: 50, observe })); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  await act(async () => renderer.update(createElement(PageProbe, { path: '/api/accounts?search=new', pageSize: 50, observe })));
  assert.equal(signal?.aborted, true);
  assert.match(state().error, /did not advance/); assert.equal(state().data, undefined);
  await act(async () => { old.resolve(Response.json({ nodes: ['stale'], totalCount: 1, pageInfo: { endCursor: '1', hasNextPage: false } })); });
  assert.equal(state().data, undefined, 'an old filter cannot publish or keep fetching after cancellation');
});
