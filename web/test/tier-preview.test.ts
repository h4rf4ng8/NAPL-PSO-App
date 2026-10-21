import { apiTarget } from './auth-fixture';
import assert from 'node:assert/strict';
import { after, afterEach, before, mock, test } from 'node:test';
import React, { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ApolloProvider } from '@apollo/client/react';
import { client, resetClient } from '../src/api/client';
import { TierPreview } from '../src/features/dashboard/TierPreview';

const originalReact = Object.getOwnPropertyDescriptor(globalThis, 'React');
before(() => Object.defineProperty(globalThis, 'React', { configurable: true, value: React }));
after(() => {
  if (originalReact) Object.defineProperty(globalThis, 'React', originalReact);
  else Reflect.deleteProperty(globalThis, 'React');
});
/* eslint-disable unicorn/no-top-level-assignment-in-function -- Cleanup owns the currently mounted tree. */
let renderer: ReactTestRenderer | undefined;
afterEach(async () => {
  await act(async () => { renderer?.unmount(); });
  renderer = undefined;
  mock.restoreAll();
  await resetClient();
});
const savedPage=(value:unknown)=>({nodes:value===null?[{index:0,key:null,value:null}]:Object.entries(value as Record<string,unknown>).map(([key,value],index)=>({index,key,value})),totalCount:value===null?1:Object.keys(value as object).length,pageInfo:{endCursor:null,hasNextPage:false}});
const previewPath = 'AccountCardPreviews';
const savedPath = '/api/settings/position_weights';
const defaultPath = 'DefaultPositionWeights';
const text = () => renderer!.root.findAll(node => typeof node.type === 'string')
  .flatMap(node => node.children.filter(child => typeof child === 'string')).join(' ');
const flush = async () => { await act(async () => { await new Promise<void>(resolve => setImmediate(resolve)); }); };
async function mount() {
  await act(async () => { renderer = create(createElement(ApolloProvider, { client }, createElement(TierPreview))); });
  await flush();
}
function transport(saved: () => Response | Promise<Response>, previews = () => Promise.resolve(Response.json({ data: { accountCardPreviews: [] } }))) {
  const calls: string[] = [];
  mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const path = apiTarget(input, init);
    calls.push(path);
    assert.equal(init?.method, path === savedPath ? 'GET' : 'POST');
    if (path !== savedPath) assert.equal((init?.headers as Record<string, string>)['Apollo-Require-Preflight'], 'true');
    if (path === savedPath) return saved();
    if (path === previewPath) return previews();
    assert.equal(path, defaultPath, `Unexpected endpoint: ${path}`);
    return Response.json({ data: { defaultPositionWeights: { ST: { goalsPerGame: 0.62, assistsPerGame: 0.38 } } } });
  });
  return calls;
}

test('saved REST weightings render unchanged without fetching defaults', async () => {
  const calls = transport(() => Response.json(savedPage({ ST: { goalsPerGame: 0.73, assistsPerGame: 0.27 } })));
  await mount();
  assert.match(text(), /73%/);
  assert.match(text(), /27%/);
  assert.deepEqual(new Set(calls), new Set([previewPath, savedPath]));
  assert.equal(calls.length, 2);
  assert.equal(renderer!.root.findAllByProps({ role: 'status' }).length, 0);
});

test('a confirmed null saved value fetches defaults once after loading', async () => {
  const saved = Promise.withResolvers<Response>();
  const calls = transport(() => saved.promise);
  await mount();
  assert.match(text(), /Loading weightings/);
  assert.equal(calls.includes(defaultPath), false);
  await act(async () => { saved.resolve(Response.json(savedPage(null))); });
  await flush();
  assert.match(text(), /62%/);
  assert.equal(calls.filter(path => path === defaultPath).length, 1);
  await act(async () => { renderer!.update(createElement(ApolloProvider, { client }, createElement(TierPreview))); });
  await flush();
  assert.equal(calls.filter(path => path === defaultPath).length, 1);
});

test('saved weightings errors suppress defaults and retry recovers saved values', async () => {
  let attempts = 0;
  const calls = transport(() => ++attempts === 1
    ? Response.json({ message: 'Weightings unavailable' }, { status: 503 })
    : Response.json(savedPage({ GK: { catchesPerGame: 0.91, cleanSheetPct: 0.09 } })));
  await mount();
  assert.match(text(), /Weightings unavailable/);
  assert.equal(calls.includes(defaultPath), false);
  await act(async () => { renderer!.root.findByType('button').props.onClick(); });
  await flush();
  assert.match(text(), /91%/);
  assert.doesNotMatch(text(), /Weightings unavailable/);
  assert.equal(attempts, 2);
  assert.equal(calls.includes(defaultPath), false);
});

test('preview loading and error remain visible independently of saved weightings', async () => {
  const previews = Promise.withResolvers<Response>();
  transport(() => Response.json(savedPage({ ST: { goalsPerGame: 1 } })), () => previews.promise);
  await mount();
  assert.match(text(), /Loading card previews/);
  assert.match(text(), /100%/);
  await act(async () => { previews.resolve(Response.json({ errors: [{ message: 'Preview unavailable' }] })); });
  await flush();
  assert.match(text(), /Preview unavailable/);
  assert.doesNotMatch(text(), /Loading card previews/);
  assert.match(text(), /100%/);
});
