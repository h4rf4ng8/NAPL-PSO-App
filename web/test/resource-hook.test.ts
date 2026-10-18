import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useResource } from '../src/hooks/use-resource';

type HookState = ReturnType<typeof useResource<string>>;

function ResourceProbe({ load, dependency, observe }: {
  load: () => Promise<string>;
  dependency: string;
  observe: (state: HookState) => void;
}) {
  observe(useResource(load, [dependency]));
  return null;
}

test('mounted resource clears data on dependency change and ignores the previous pending read', async t => {
  const old = Promise.withResolvers<string>();
  const next = Promise.withResolvers<string>();
  const reads = [Promise.resolve('saved'), old.promise, next.promise];
  const load = () => reads.shift()!;
  const observe = mock.fn<(state: HookState) => void>();
  const state = () => observe.mock.calls.at(-1)!.arguments[0];
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(createElement(ResourceProbe, { load, dependency: 'first', observe })); });
  t.after(async () => { await act(async () => { renderer.unmount(); }); });
  assert.equal(state().data, 'saved');

  let pending!: Promise<void>;
  await act(async () => { pending = state().reload(); });
  await act(async () => { renderer.update(createElement(ResourceProbe, { load, dependency: 'second', observe })); });
  assert.equal(state().data, undefined, 'a changed dependency discards the previous data');
  assert.equal(state().loading, true);
  await act(async () => { next.resolve('current'); });
  await act(async () => { old.resolve('stale'); await pending; });
  assert.equal(state().data, 'current', 'the older read must not replace the current dependency result');
  assert.equal(state().loading, false);
  assert.equal(state().error, '');
});

test('unmounting a resource stops observations and disables reload while a read settles', async t => {
  const pending = Promise.withResolvers<string>();
  const load = mock.fn(() => pending.promise);
  const observe = mock.fn<(state: HookState) => void>();
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(createElement(ResourceProbe, { load, dependency: 'first', observe })); });
  t.after(async () => { await act(async () => { renderer.unmount(); }); });
  const reload = observe.mock.calls.at(-1)!.arguments[0].reload;
  assert.equal(load.mock.callCount(), 1);

  await act(async () => { renderer.unmount(); });
  const observed = observe.mock.callCount();
  await act(async () => { pending.resolve('departed'); });
  assert.equal(observe.mock.callCount(), observed, 'settling a read after unmount must not render again');
  await act(async () => { await reload(); });
  assert.equal(load.mock.callCount(), 1, 'a captured reload must not start a read after unmount');
});

test('mounted resource reload retains data and resolves while recording an error', async t => {
  const refresh = Promise.withResolvers<string>();
  const reads = [Promise.resolve('saved'), refresh.promise, Promise.resolve('recovered')];
  const load = () => reads.shift()!;
  const observe = mock.fn<(state: HookState) => void>();
  const state = () => observe.mock.calls.at(-1)!.arguments[0];
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(createElement(ResourceProbe, { load, dependency: 'first', observe })); });
  t.after(async () => { await act(async () => { renderer.unmount(); }); });

  let pending!: Promise<void>;
  await act(async () => { pending = state().reload(); });
  assert.equal(state().data, 'saved', 'reload retains the last successful data while pending');
  assert.equal(state().loading, true);
  await act(async () => { refresh.reject(new Error('read failed')); await assert.doesNotReject(pending); });
  assert.equal(state().data, 'saved');
  assert.equal(state().loading, false);
  assert.equal(state().error, 'read failed');

  await act(async () => { await state().reload(); });
  assert.equal(state().data, 'recovered');
  assert.equal(state().error, '');
});
