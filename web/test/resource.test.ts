import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createResource, type ResourceState } from '../src/hooks/resource';

test('an older read cannot overwrite a newer result or error', async () => {
  const states: ResourceState<string>[] = [];
  const resource = createResource<string>(state => { states.push(state); });
  const old = Promise.withResolvers<string>();
  const pending = resource.load(() => old.promise);
  await resource.load(async () => 'new');
  old.resolve('old');
  await pending;
  assert.equal(states.at(-1)?.data, 'new');

  const stale = Promise.withResolvers<string>();
  const rejected = resource.load(() => stale.promise);
  await resource.load(async () => { throw new Error('latest failure'); });
  stale.reject(new Error('old failure'));
  await rejected;
  assert.deepEqual(states.at(-1), { data: 'new', loading: false, error: 'latest failure' });
});

test('dependency resets clear data and disposal suppresses pending results', async () => {
  const states: ResourceState<string>[] = [];
  const resource = createResource<string>(state => { states.push(state); });
  await resource.load(async () => 'old account');
  const next = Promise.withResolvers<string>();
  const pending = resource.load(() => next.promise, true);
  assert.deepEqual(states.at(-1), { data: undefined, loading: true, error: '' });
  resource.invalidate();
  const count = states.length;
  next.resolve('departed account');
  await pending;
  assert.equal(states.length, count);
});

test('reload preserves data, reports failures without rejecting, and clears the error on recovery', async () => {
  const states: ResourceState<string>[] = [];
  const resource = createResource<string>(state => { states.push(state); });
  await resource.load(async () => 'saved');
  const refresh = Promise.withResolvers<string>();
  const pending = resource.load(() => refresh.promise);
  assert.deepEqual(states.at(-1), { data: 'saved', loading: true, error: '' });
  refresh.reject(new Error('read failed'));
  await pending;
  assert.deepEqual(states.at(-1), { data: 'saved', loading: false, error: 'read failed' });
  await resource.load(async () => 'recovered');
  assert.deepEqual(states.at(-2), { data: 'saved', loading: true, error: '' });
  assert.deepEqual(states.at(-1), { data: 'recovered', loading: false, error: '' });
});
