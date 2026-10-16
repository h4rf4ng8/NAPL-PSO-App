import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Account } from '../src/features/accounts/models';
import { getStatsForSeason } from '../src/utils/rankings';
import { collectSeasons } from '../src/features/dashboard/selectors';

const overall = { games: 2, wins: 1, draws: 0, losses: 1, goals: 3, assists: 1, passes: 6, tackles: 4, deflects: 0, catches: 0, cleanSheets: 1, motm: 1 };
const s1 = { games: 2, wins: 1, draws: 0, losses: 1, goals: 3, assists: 1, passes: 6, tackles: 4, deflects: 0, catches: 0, cleanSheets: 1, motm: 1 };

test('season summary replaces full history and retains rounded pass average', () => {
  const account = { username: 'player', stats: overall, seasonStats: { all: overall, S1: s1 } } as Account;
  assert.deepEqual(getStatsForSeason(account, 'S1'), s1);
  assert.equal(getStatsForSeason(account, 'S1').passes, 6);
  assert.deepEqual(collectSeasons([account], 'S2'), ['S2', 'S1']);
});

test('season stats are read from the server summary without aggregating match history in the browser', () => {
  const account = {
    username: 'player', stats: overall,
    matches: [
      { season: 'S1', goals: 1, assists: 0, passes: 5, tackles: 2, result: 'W', cleanSheet: true, motm: true },
      { season: 'S1', goals: 2, assists: 1, passes: 6, tackles: 2, result: 'L' },
    ],
  } as Account;
  assert.deepEqual(getStatsForSeason(account, 'S1'), {
    games: 0, goals: 0, assists: 0, tackles: 0, passes: 0,
    cleanSheets: 0, deflects: 0, catches: 0, motm: 0,
    wins: 0, losses: 0, draws: 0,
  });
});
