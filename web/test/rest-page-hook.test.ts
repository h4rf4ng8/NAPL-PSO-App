import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useRestPage } from '../src/hooks/use-rest-page';

type PageState = ReturnType<typeof useRestPage<string>>;

function PageProbe({ path, observe }: { path: string | null; observe: (state: PageState) => void }) {
  observe(useRestPage<string>(path));
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
