import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashForView, viewFromHash } from '../src/features/dashboard/navigation';

test('MY CARD keeps its rendered view after hashchange and reload', () => {
  assert.equal(hashForView('me'), '#/card');
  assert.equal(viewFromHash(hashForView('me')), 'me');
  assert.equal(viewFromHash('#/card/'), 'me');
  assert.equal(viewFromHash('#card'), 'me');
});
test('voting and match navigation round-trips and article links select news', () => {
  for (const view of ['vote', 'matches']) assert.equal(viewFromHash(hashForView(view)), view);
  assert.equal(viewFromHash('#/articles/season-preview'), 'news');
  assert.equal(viewFromHash('#/missing'), 'home');
});

test('public routing defaults to teams, normalizes stats, and retains protected destinations', () => {
  for (const hash of ['', '#/', '#/missing']) assert.equal(viewFromHash(hash, 'teams'), 'teams');
  for (const hash of ['#/stats', '#/leaderboard']) assert.equal(viewFromHash(hash, 'teams'), 'leaderboard');
  for (const view of ['standings', 'admin', 'me', 'vote', 'matches']) assert.equal(viewFromHash(hashForView(view), 'teams'), view);
});
