import { expect, test } from '@playwright/test';
import { currentCard, period } from './league-data';
import { installLeagueFixture } from './transport';

test('season changes clear stale card metrics and restore all-time totals', async ({ page }) => {
  const fixture = await installLeagueFixture(page, 'member');
  const pending = Promise.withResolvers<void>();
  fixture.responses.set('LeagueOverview', async request => {
    const season = request.postDataJSON().variables.season;
    if (season === 'S1') await pending.promise;
    const card = currentCard('member');
    return { data: { leagueOverview: { __typename: 'LeagueOverview', season: 'S1', playerCount: 24, activeTeamCount: 2, me: { ...card, season, stats: { ...card.stats, games: season === 'S1' ? 7 : 12, goals: season === 'S1' ? 11 : 24 } }, tickerHasMore: false, tickerNews: [], activeVotingPeriod: { ...period, __typename: 'VotingPeriodSummary' } } } };
  });
  await page.goto('/#/card');
  const overview = page.getByRole('heading', { name: 'Career overview' }).locator('..');
  await expect(overview.getByText('12', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Card season', exact: true }).click();
  await page.getByRole('option', { name: /S1/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Loading league' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Career overview/ })).toHaveCount(0);
  pending.resolve();
  const seasonOverview = page.getByRole('heading', { name: /Career overview/ }).locator('..');
  await expect(seasonOverview.getByText('7', { exact: true })).toBeVisible();
  await expect(seasonOverview.getByText('11', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Card season', exact: true }).click();
  await page.getByRole('option', { name: 'All time', exact: true }).click();
  await expect(overview.getByText('12', { exact: true })).toBeVisible();
  await expect(overview.getByText('24', { exact: true })).toBeVisible();
  expect(fixture.unexpected).toEqual([]);
});

test('selected player dialog survives loading and restores its actual opener', async ({ page }) => {
  const fixture = await installLeagueFixture(page, 'member');
  const pending = Promise.withResolvers<void>();
  fixture.holds.set('PlayerCard', pending.promise);
  await page.goto('/#/leaderboard');
  await page.getByRole('combobox', { name: 'Season', exact: true }).click();
  await page.getByRole('option', { name: 'S1', exact: true }).click();
  const player = page.getByRole('table').getByRole('button', { name: 'Fixture Player', exact: true });
  await player.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Loading player card…')).toBeVisible();
  await dialog.evaluate(element => { element.dataset.fixtureIdentity = 'same-dialog'; });
  pending.resolve();
  await expect(dialog).toHaveAccessibleName(/Fixture Player's player card$/);
  await expect(dialog).toHaveAttribute('data-fixture-identity', 'same-dialog');
  expect(fixture.requests.find(request => request.operation === 'PlayerCard')?.body).toMatchObject({ variables: { id: 'fixture-player', season: 'S1' } });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(player).toBeFocused();
  await page.getByRole('combobox', { name: 'Season', exact: true }).click();
  await page.getByRole('option', { name: 'All time', exact: true }).click();
  await player.click();
  await expect(dialog).toHaveAccessibleName(/Fixture Player's player card$/);
  expect(fixture.requests.findLast(request => request.operation === 'PlayerCard')?.body).toMatchObject({ variables: { id: 'fixture-player', season: 'all' } });
  expect(fixture.unexpected).toEqual([]);
});
