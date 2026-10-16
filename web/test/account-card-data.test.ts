import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlayerCard } from '../src/components/PlayerCard';
import { mapAccount } from '../src/features/accounts/api';
import { getCardStatsForSeason } from '../src/utils/rankings';

const stats = {
  games: 1, wins: 1, draws: 0, losses: 0, goals: 1, assists: 2,
  passes: 3, tackles: 4, deflects: 0, catches: 0, cleanSheets: 0, motm: 0,
};

const accountRow = (computed: Record<string, unknown> = {}) => ({
  id: 'id', username: 'Player', position: 'ST', teamId: null,
  imageUrl: null, country: null, stats, seasonStats: { all: stats, S1: stats },
  awards: [], championships: [], totwUntil: null, cheater: false,
  strikersId: null, steamUrl: null, createdAt: 1,
  ...computed,
}) as never;

test('account decoding preserves server ranking and card cells for each season', () => {
  const ranking = { score: 82, percentile: 0.73, ranked: true, gamesPlayed: 12, tier: 'GOLD' };
  const cells = ['GOALS', 'TKL/G', 'ASSIST', 'W-L', 'PASS/G', 'GP'].map((label, i) => ({ label, value: String(i) }));
  const account = mapAccount(accountRow({ ranking, cardStats: [{ season: 'all', cells }, { season: 'S1', cells }] }));
  assert.deepEqual(account.ranking, ranking);
  assert.equal(account.cardStats.find(item => item.season === 'S1')?.cells[1]?.label, 'TKL/G');
});

test('unranked accounts and selected season card cells remain server supplied', () => {
  const ranking = { score: 0, percentile: 0, ranked: false, gamesPlayed: 0, tier: 'BRONZE' };
  const allCells = ['GOALS', 'TKL/G', 'ASSIST', 'W-L', 'PASS/G', 'GP'].map(label => ({ label, value: '0' }));
  const seasonCells = allCells.map((cell, i) => ({ ...cell, value: String(i + 1) }));
  const emptyCells = allCells.map(cell => ({ ...cell, value: '0' }));
  const account = mapAccount(accountRow({ ranking, cardStats: [{ season: 'all', cells: allCells }, { season: 'S1', cells: seasonCells }, { season: null, cells: emptyCells }] }));
  assert.deepEqual(account.ranking, ranking);
  assert.deepEqual(getCardStatsForSeason(account, 'S1'), seasonCells);
  assert.deepEqual(getCardStatsForSeason(account, 'all'), allCells);
  assert.deepEqual(getCardStatsForSeason(account, 'S2'), emptyCells);
});

test('player card SSR renders server OVR state and season cells without calculating them', () => {
  const ranking = { score: 0, percentile: 0, ranked: false, gamesPlayed: 0, tier: 'BRONZE' };
  const allCells = ['GOALS', 'TKL', 'ASSIST', 'W-L', 'PASS', 'GP'].map(label => ({ label, value: 'ALL' }));
  const seasonCells = ['GOALS', 'TKL/G', 'ASSIST', 'W-L', 'PASS/G', 'GP'].map((label, i) => ({ label, value: `S${i}` }));
  const account = mapAccount(accountRow({ ranking, cardStats: [{ season: 'all', cells: allCells }, { season: 'S1', cells: seasonCells }] }));
  const html = renderToStaticMarkup(React.createElement(PlayerCard, { account: { ...account, _cardSeason: 'S1' }, size: 'lg' }));
  assert.match(html, />NR<\/text>/);
  assert.match(html, />S0<\/text>/);
  assert.match(html, />S5<\/text>/);
  assert.match(html, />TKL\/G<\/text>/);
  assert.doesNotMatch(html, />ALL<\/text>/);
});

test('account decoding rejects malformed server ranking and card cells', () => {
  assert.throws(() => mapAccount(accountRow({ ranking: {}, cardStats: [] })), /Invalid GraphQL account JSON data/);
  assert.throws(() => mapAccount(accountRow({ ranking: { score: 80 }, cardStats: [] })), /Invalid GraphQL account JSON data/);
});

test('account decoding rejects malformed card cells with a valid server ranking', () => {
  const ranking = { score: 82, percentile: 0.73, ranked: true, gamesPlayed: 12, tier: 'GOLD' };
  const cells = ['GOALS', 'TKL/G', 'ASSIST', 'W-L', 'PASS/G', 'GP'].map(label => ({ label, value: '1' }));
  cells[2] = { label: 'ASSIST', value: 2 as unknown as string };

  assert.throws(() => mapAccount(accountRow({ ranking, cardStats: [{ season: 'S1', cells }] })), /Invalid GraphQL account JSON data/);
});
