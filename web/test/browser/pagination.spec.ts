import { expect, test } from '@playwright/test';
import { currentCard, pageOf } from './league-data';
import { installLeagueFixture } from './transport';

const players = Array.from({ length: 105 }, (_, index) => ({ ...currentCard('member'), __typename: 'AccountSummary', id: `ranked-${index}`, username: `Ranked ${String(index + 1).padStart(3, '0')}`, position: 'GK' }));

test('leaderboard fills 50 visible rows from bounded transport pages and retains server order', async ({ page }) => {
  const fixture = await installLeagueFixture(page);
  fixture.responses.set('Leaderboard', request => {
    const { after = 0, first } = request.postDataJSON().variables;
    const start = Number(after);
    const end = Math.min(start + Math.min(first, 17), players.length);
    return { data: { leaderboard: { ...pageOf(players.slice(start, end), 'AccountSummaryPage'), totalCount: players.length, pageInfo: { endCursor: String(end), hasNextPage: end < players.length } } } };
  });
  await page.goto('/#/leaderboard');
  const rows = page.getByRole('table', { name: 'Player statistics' }).locator('tbody tr');
  await expect(rows).toHaveCount(50);
  await expect(rows.first()).toContainText('Ranked 001');
  await expect(rows.last()).toContainText('Ranked 050');
  await page.getByRole('button', { name: 'GP: sort by Games played', exact: true }).focus();
  await expect(page.getByRole('tooltip')).toHaveText('Games played');
  await page.keyboard.press('Escape');
  const queries = () => fixture.requests.filter(request => request.operation === 'Leaderboard').map(request => (request.body as { variables: Record<string, unknown> }).variables);
  expect(queries().map(query => query.first)).toEqual([50, 33, 16]);
  await page.getByRole('button', { name: 'Next players', exact: true }).click();
  await expect(rows.first()).toContainText('Ranked 051');
  await expect(rows.last()).toContainText('Ranked 100');
  expect(queries().slice(3).map(query => query.after)).toEqual(['50', '67', '84']);
  await page.getByRole('button', { name: 'Next players', exact: true }).click();
  await expect(rows).toHaveCount(5);
  await expect(rows.first()).toContainText('Ranked 101');
  await expect(page.getByRole('button', { name: 'Next players', exact: true })).toBeDisabled();
  await page.getByRole('combobox', { name: 'Season', exact: true }).click();
  await page.getByRole('option', { name: 'S1', exact: true }).click();
  await expect(rows).toHaveCount(50);
  await expect(rows.first()).toContainText('Ranked 001');
  expect(queries().findLast(query => query.after === null)).toMatchObject({ first: 50, season: 'S1' });
  await page.getByRole('combobox', { name: 'Position', exact: true }).click();
  await page.getByRole('option', { name: 'GK', exact: true }).click();
  await expect(rows).toHaveCount(50);
  await expect(rows.first()).toContainText('Ranked 001');
  expect(queries().findLast(query => query.after === null)).toMatchObject({ first: 50, position: 'GK' });
  await expect(page.getByRole('button', { name: 'Previous players', exact: true })).toBeDisabled();
  expect(fixture.unexpected).toEqual([]);
});

test('leaderboard rejects an empty nonadvancing continuation instead of looping', async ({ page }) => {
  const fixture = await installLeagueFixture(page);
  fixture.responses.set('Leaderboard', () => ({ data: { leaderboard: { ...pageOf([], 'AccountSummaryPage'), totalCount: 105, pageInfo: { endCursor: null, hasNextPage: true } } } }));
  await page.goto('/#/leaderboard');
  await expect(page.getByRole('alert')).toContainText(/cursor|empty|advance/i);
  expect(fixture.requests.filter(request => request.operation === 'Leaderboard')).toHaveLength(1);
  await expect(page.getByRole('button', { name: 'Next players', exact: true })).toBeDisabled();
  expect(fixture.unexpected).toEqual([]);
});

test('retrying a stale leaderboard continuation starts from a fresh cursor in the same filters', async ({ page }) => {
  const fixture = await installLeagueFixture(page);
  let starts = 0;
  fixture.responses.set('Leaderboard', request => {
    const { after, first, season, position } = request.postDataJSON().variables;
    if (season !== 'S1' || position !== 'GK') return { data: { leaderboard: pageOf(players.slice(0, 5), 'AccountSummaryPage') } };
    if (!after) starts++;
    if (String(after).startsWith('v1:')) return { errors: [{ message: 'stale_cursor' }] };
    const start = after ? Number(String(after).split(':', 2)[1]) : 0;
    const end = start + Math.min(first, 17);
    return { data: { leaderboard: { ...pageOf(players.slice(start, end), 'AccountSummaryPage'), totalCount: players.length, pageInfo: { endCursor: `v${starts}:${end}`, hasNextPage: true } } } };
  });
  await page.goto('/#/leaderboard');
  await page.getByRole('combobox', { name: 'Season', exact: true }).click();
  await page.getByRole('option', { name: 'S1', exact: true }).click();
  await page.getByRole('combobox', { name: 'Position', exact: true }).click();
  await page.getByRole('option', { name: 'GK', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('stale_cursor');
  await page.getByRole('button', { name: 'Retry players', exact: true }).click();
  const rows = page.getByRole('table', { name: 'Player statistics' }).locator('tbody tr');
  await expect(rows).toHaveCount(50);
  await expect(rows.first()).toContainText('Ranked 001');
  await expect(rows.last()).toContainText('Ranked 050');
  const queries = fixture.requests.filter(request => request.operation === 'Leaderboard').map(request => (request.body as { variables: Record<string, unknown> }).variables).filter(query => query.season === 'S1' && query.position === 'GK');
  expect(queries.filter(query => query.after === null)).toHaveLength(2);
  expect(queries.filter(query => String(query.after).startsWith('v1:'))).toHaveLength(1);
  await expect(page.getByRole('button', { name: 'Previous players', exact: true })).toBeDisabled();
  expect(fixture.unexpected).toEqual([]);
});

test('player management fills 50 rows from capped REST pages and advances by the final cursor', async ({ page }) => {
  const fixture = await installLeagueFixture(page, 'admin');
  fixture.responses.set('/api/accounts', request => {
    const query = new URL(request.url()).searchParams;
    const start = Number(query.get('after') ?? 0);
    const end = Math.min(start + Math.min(Number(query.get('first')), 17), players.length);
    return { ...pageOf(players.slice(start, end)), totalCount: players.length, pageInfo: { endCursor: String(end), hasNextPage: end < players.length } };
  });
  await page.goto('/test/browser/regression.html?case=players');
  const names = page.getByRole('heading', { level: 4, name: /^Ranked \d+$/ });
  await expect(names).toHaveCount(50);
  await expect(names.first()).toHaveText('Ranked 001');
  await expect(names.last()).toHaveText('Ranked 050');
  await page.getByRole('button', { name: 'Next page', exact: true }).last().click();
  await expect(names.first()).toHaveText('Ranked 051');
  await expect(names.last()).toHaveText('Ranked 100');
  expect(fixture.unexpected).toEqual([]);
});
