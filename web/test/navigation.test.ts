import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashForView, viewFromHash } from '../src/features/dashboard/navigation';

test('MY CARD keeps its rendered view after hashchange and reload', () => {
  assert.equal(hashForView('me'), '#/card');
  assert.equal(viewFromHash(hashForView('me')), 'me');
  assert.equal(viewFromHash('#/card/'), 'me');
  assert.equal(viewFromHash('#card'), 'me');
});
test('voting navigation round-trips and article links select news', () => {
  assert.equal(viewFromHash(hashForView('vote')), 'vote');
  assert.equal(viewFromHash('#/articles/season-preview'), 'news');
  assert.equal(viewFromHash('#/missing'), 'home');
});
