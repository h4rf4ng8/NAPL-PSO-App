import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Account } from '../src/api/models';
import { resolveLineup } from '../src/utils/league';
import { DEFAULT_FORMATION, POS, SLOT } from '@napl/contracts/league';

const alice: Account = {
  id: 'alice-id', username: 'Alice', position: POS.CM, teamId: 'team', imageUrl: null,
  country: null, stats: { games: 0, wins: 0, draws: 0, losses: 0, goals: 0, assists: 0, passes: 0,
    tackles: 0, deflects: 0, catches: 0, cleanSheets: 0, motm: 0 },
  matches: [], awards: [], championships: [], totwUntil: null, cheater: false,
  strikersId: '123', steamUrl: null, createdAt: 0,
};

test('a partial saved lineup leaves empty slots instead of crashing the team view', () => {
  const lineup = resolveLineup({formation: DEFAULT_FORMATION, lineup: {[SLOT.CM]: 'alice'}}, [alice], null);
  assert.equal(lineup[SLOT.CM], alice);
  assert.equal(lineup[SLOT.GK], null);
  assert.equal(lineup[SLOT.ST_L], null);
  assert.equal(Object.values(lineup).filter(Boolean).length, 1);
});

test('a saved player who left the roster leaves an empty slot', () => {
  const lineup = resolveLineup({formation: DEFAULT_FORMATION, lineup: {[SLOT.CM]: 'FormerPlayer'}}, [alice], null);
  assert.ok(Object.values(lineup).every(player => player === null));
});
