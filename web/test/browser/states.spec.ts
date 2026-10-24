import { expect, test } from '@playwright/test';
import { installLeagueFixture } from './transport';
import { captureAndAudit } from './checks';

for (const [route, operation, loading, empty, retry] of [
  ['teams', 'TeamSummaries', 'Loading teams', 'No teams match this view.', 'Restart teams'],
  ['leaderboard', 'Leaderboard', 'Loading players', 'No players match this filter.', 'Retry players'],
] as const) test(`${route} recovers from a failed read and explains an empty result`, async ({ page }, info) => {
  const fixture = await installLeagueFixture(page);
  const pending = Promise.withResolvers<void>();
  fixture.holds.set(operation, pending.promise);
  await page.goto(`/#/${route}`);
  await expect(page.getByRole('status').filter({ hasText: loading })).toBeVisible();
  await captureAndAudit(page, info, `${route}-loading`);
  fixture.failures.add(operation);
  pending.resolve();
  await expect(page.getByRole('alert').filter({ hasText: 'Fixture temporarily unavailable' })).toBeVisible();
  await captureAndAudit(page, info, `${route}-failure`);
  fixture.failures.delete(operation);
  fixture.empty = true;
  await page.getByRole('button', { name: retry, exact: true }).click();
  await expect(page.getByText(empty, { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await captureAndAudit(page, info, `${route}-empty`);
  expect(fixture.requests.filter(request => request.operation === operation)).toHaveLength(2);
  expect(fixture.unexpected).toEqual([]);
});

test('successful leave survives a failed profile refresh and retries only reads', async ({ page }) => {
  const fixture = await installLeagueFixture(page, 'member');
  await page.goto('/#/teams');
  await page.getByRole('button', { name: 'View roster and team', exact: true }).first().click();
  await page.getByRole('button', { name: 'Leave team', exact: true }).click();
  const confirmation = page.getByRole('alertdialog');
  await expect(confirmation).toBeVisible();
  expect(fixture.requests.filter(request => request.operation.endsWith('/membership'))).toHaveLength(0);
  fixture.failures.add('/api/accounts/me');
  await confirmation.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(confirmation).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'You left the team.' })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'Your change was saved, but refreshing failed:' })).toBeVisible();
  fixture.failures.delete('/api/accounts/me');
  await page.getByRole('button', { name: 'Retry refresh', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry refresh', exact: true })).toHaveCount(0);
  expect(fixture.requests.filter(request => request.operation.endsWith('/membership'))).toHaveLength(1);
  expect(fixture.requests.find(request => request.operation.endsWith('/membership'))?.body).toEqual({ action: 'leave' });
  expect(fixture.unexpected).toEqual([]);
});

test('successful approval survives a failed administration refresh without repeating the write', async ({ page }) => {
  const fixture = await installLeagueFixture(page, 'admin');
  await page.goto('/test/browser/regression.html?case=admin');
  await expect(page.getByRole('heading', { name: 'Team reviews' })).toBeVisible();
  fixture.failures.add('/api/settings/current_season');
  await page.getByRole('button', { name: 'APPROVE', exact: true }).first().click();
  await expect(page.getByRole('status').filter({ hasText: 'Fixture United approved.' })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'Changes were saved, but refreshing' })).toBeVisible();
  fixture.failures.delete('/api/settings/current_season');
  await page.getByRole('button', { name: 'Retry administration refresh', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry administration refresh', exact: true })).toHaveCount(0);
  expect(fixture.requests.filter(request => request.operation.endsWith('/review'))).toHaveLength(1);
  expect(fixture.unexpected).toEqual([]);
});
