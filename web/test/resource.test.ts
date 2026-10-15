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
