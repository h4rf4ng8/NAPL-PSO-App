import { expect, test } from '@playwright/test';
import { installLeagueFixture } from './transport';
import { pageOf } from './league-data';

test('linked-account editor reads the full Steam URL and preserves the locked Strikers ID', async ({ page }) => {
  const fixture = await installLeagueFixture(page, 'member');
  const original = 'https://steamcommunity.com/id/original';
  fixture.responses.set('/api/accounts/fixture-player/links/steamUrl', () => pageOf([original]));
  await page.goto('/');
  expect(fixture.requests.some(request => request.operation.endsWith('/links/steamUrl'))).toBe(false);
  await page.getByRole('button', { name: 'My profile', exact: true }).click();
  await page.getByRole('button', { name: 'Edit linked accounts', exact: true }).click();
  const steam = page.getByLabel('Steam profile URL (optional)', { exact: true });
  await expect(steam).toHaveValue(original);
  await expect(page.getByLabel('Strikers Club Player ID', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Save linked accounts', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit linked accounts', exact: true })).toBeVisible();
  const writes = () => fixture.requests.filter(request => request.method === 'PATCH');
  expect(writes()[0]!.body).toMatchObject({ steamUrl: original, strikersId: '12345' });
  await page.getByRole('button', { name: 'Edit linked accounts', exact: true }).click();
  await steam.fill('https://steamcommunity.com/id/replacement');
  fixture.failures.add('/api/accounts/me');
  await page.getByRole('button', { name: 'Save linked accounts', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Your changes were saved' })).toBeVisible();
  expect(writes()[1]!.body).toMatchObject({ steamUrl: 'https://steamcommunity.com/id/replacement', strikersId: '12345' });
  fixture.failures.delete('/api/accounts/me');
  await page.getByRole('button', { name: 'Refresh profile', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Your changes were saved' })).toHaveCount(0);
  expect(writes()).toHaveLength(2);
  expect(fixture.unexpected).toEqual([]);
});

test('public schedule hides private records retained after account removal', async ({ page }) => {
  const fixture = await installLeagueFixture(page, 'member');
  await page.goto('/test/browser/regression.html?case=public-schedule');
  await expect(page.getByRole('main')).toContainText('8W-2D-2L');
  await page.getByRole('button', { name: 'Become a visitor', exact: true }).click();
  await expect(page.getByRole('main')).not.toContainText('8W-2D-2L');
  await expect(page.getByRole('main')).toContainText(/scheduled/i);
  expect(fixture.requests.some(request => ['TeamRecords', 'TeamStandings'].includes(request.operation))).toBe(false);
  expect(fixture.unexpected).toEqual([]);
});
