import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Account, VotingPeriod } from '../src/api/models';
import { activePeriod, collectSeasons } from '../src/features/dashboard/selectors';

test('season selection sorts numerically and retains the current empty season', () => {
  const players = [{ matches: [{ season: 'S2' }, { season: 'S10' }, { season: '' }, { season: 'S2' }] }] as Account[];
  assert.deepEqual(collectSeasons(players, 'S11'), ['S11', 'S10', 'S2', 'S1']);
});

test('voting opens at its start and closes at its deadline', () => {
  const period: VotingPeriod = {
    id: 'period', opensAt: 100, closesAt: 200, status: 'open', eligiblePlayers: [],
    winners: null, createdBy: 'owner', createdAt: 50, resolvedAt: null,
  };
  assert.equal(activePeriod([period], 99), null);
  assert.equal(activePeriod([period], 100), period);
  assert.equal(activePeriod([period], 199), period);
  assert.equal(activePeriod([period], 200), null);
  assert.equal(activePeriod([{ ...period, status: 'closed' }], 150), null);
});
