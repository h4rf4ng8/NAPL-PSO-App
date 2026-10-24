import { expect, test } from '@playwright/test';
import { installLeagueFixture } from './transport';
import { currentCard, pageOf } from './league-data';

test('leaderboard requests only explicit pages and sends season and position filters to the server', async ({ page }) => {
  const fixture = await installLeagueFixture(page);
  fixture.paginated.add('Leaderboard');
  await page.goto('/#/leaderboard');
  await expect(page.getByRole('table', { name: 'Player statistics' })).toBeVisible();
  const queries = () => fixture.requests.filter(request => request.operation === 'Leaderboard').map(request => (request.body as { variables: Record<string, unknown> }).variables);
  expect(queries()).toHaveLength(1);
  expect(queries()[0]!.after).toBeNull();
  await page.getByRole('button', { name: 'Next players', exact: true }).click();
  await expect.poll(() => queries().length).toBe(2);
  expect(queries()[1]!.after).toBe('fixture-next-page');
  await page.getByRole('combobox', { name: 'Season', exact: true }).click();
  await page.getByRole('option', { name: 'S1', exact: true }).click();
  await expect.poll(() => queries().at(-1)).toMatchObject({ season: 'S1', after: null });
  await page.getByRole('group', { name: 'Position', exact: true }).getByRole('button', { name: 'GK', exact: true }).click();
  await expect.poll(() => queries().at(-1)).toMatchObject({ position: 'GK', after: null });
  expect(queries()).toHaveLength(4);
  expect(fixture.unexpected).toEqual([]);
});

test('player assignment retains an off-page current team and submits the chosen membership ID', async ({ page }) => {
  const fixture = await installLeagueFixture(page, 'admin');
  fixture.paginated.add('TeamSummaries');
  fixture.responses.set('/api/accounts', () => pageOf([{ ...currentCard('member'), teamId: 'saved-team', team: null }]));
  await page.goto('/test/browser/regression.html?case=players');
  await page.getByRole('button', { name: 'Team', exact: true }).click();
  const selected = page.getByRole('combobox', { name: 'Team for Fixture Player', exact: true });
  await expect(selected).toContainText('Current team');
  const editor = page.locator('div').filter({ has: page.getByRole('textbox', { name: 'Find team', exact: true }) }).filter({ has: selected }).last();
  await editor.getByRole('button', { name: 'Next page', exact: true }).click();
  await selected.click();
  await expect(page.getByRole('option', { name: /Harbor Athletic/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('textbox', { name: 'Find team', exact: true }).fill('Fixture');
  await expect.poll(() => (fixture.requests.findLast(request => request.operation === 'TeamSummaries')?.body as { variables?: unknown })?.variables).toMatchObject({ after: null, search: 'Fixture' });
  await expect(selected).toContainText('Current team');
  await selected.click();
  await page.getByRole('option', { name: /Fixture United/ }).click();
  await expect.poll(() => fixture.requests.filter(request => request.operation.endsWith('/membership')).length).toBe(1);
  expect(fixture.requests.find(request => request.operation.endsWith('/membership'))).toMatchObject({ operation: '/api/teams/fixture-team/membership', body: { action: 'join', accountId: 'fixture-player' } });
  expect(fixture.unexpected).toEqual([]);
});

for (const approve of [true, false]) test(`picture review submits only after the explicit ${approve ? 'approval' : 'rejection'}`, async ({ page }) => {
  const fixture = await installLeagueFixture(page, 'admin');
  await page.goto('/test/browser/regression.html?case=pictures');
  const label = approve ? 'Approve picture' : 'Reject picture';
  await page.getByRole('button', { name: label, exact: true }).click();
  if (!approve) {
    expect(fixture.requests.filter(request => request.operation.endsWith('/image/review'))).toHaveLength(0);
    await page.getByRole('alertdialog').getByRole('button', { name: label, exact: true }).click();
  }
  await expect.poll(() => fixture.requests.filter(request => request.operation.endsWith('/image/review')).length).toBe(1);
  expect(fixture.requests.find(request => request.operation.endsWith('/image/review'))).toMatchObject({ method: 'POST', body: { approve } });
  expect(fixture.unexpected).toEqual([]);
});
