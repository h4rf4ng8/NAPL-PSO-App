import { expect, test } from '@playwright/test';
import { installLeagueFixture } from './transport';
import { captureAndAudit } from './checks';

async function openNavigation(page: import('@playwright/test').Page) {
  await expect(page.locator('#page-heading')).toBeVisible();
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await menu.isVisible()) await menu.click();
  return page.getByRole('navigation', { name: 'League navigation' });
}

test('public navigation exposes exactly six destinations and preserves browser history', async ({ page }) => {
  const fixture = await installLeagueFixture(page);
  await page.goto('/');
  const nav = await openNavigation(page);
  await expect(nav.getByRole('link')).toHaveText(['Teams', 'Schedule', 'Stats', 'News', 'Transfers', 'Rules']);
  await nav.getByRole('link', { name: 'Stats', exact: true }).click();
  await expect(page).toHaveURL(/#\/leaderboard$/);
  await expect(page.locator('#page-heading')).toHaveText('Stats');
  if (page.viewportSize()!.width < 1024) {
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('#page-heading')).toBeFocused();
  }
  await (await openNavigation(page)).getByRole('link', { name: 'Schedule', exact: true }).click();
  await expect(page).toHaveURL(/#\/schedule$/);
  await page.goBack();
  await expect(page.locator('#page-heading')).toHaveText('Stats');
  await page.goForward();
  await expect(page.locator('#page-heading')).toHaveText('Schedule');
  expect(fixture.requests.some(request => ['LeagueOverview', 'TeamRecords', 'TeamStandings'].includes(request.operation))).toBe(false);
  expect(fixture.unexpected).toEqual([]);
});

test('private direct links show sign-in state without private reads', async ({ page }) => {
  const fixture = await installLeagueFixture(page);
  await page.goto('/#/card');
  await expect(page.getByRole('main')).toContainText(/sign in/i);
  expect(fixture.requests.some(request => ['LeagueOverview', 'PlayerCard', '/api/accounts/me'].includes(request.operation))).toBe(false);
});

test('theme persists across reload and mobile navigation returns focus on Escape', async ({ page }) => {
  await installLeagueFixture(page, 'member');
  await page.goto('/#/teams');
  const light = page.getByRole('button', { name: 'Switch to dark mode', exact: true });
  await light.click();
  await expect(page.getByRole('button', { name: 'Switch to light mode', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Switch to light mode', exact: true })).toBeVisible();
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (!await menu.isVisible()) {
    return;
  }

  await menu.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(menu).toBeFocused();
});

test('account menu and mobile navigation are accessible and restore focus', async ({ page }, info) => {
  await installLeagueFixture(page, 'member');
  await page.goto('/');
  const account = page.getByRole('button', { name: 'Account menu for Fixture Player', exact: true });
  await account.click();
  await expect(page.getByRole('menu')).toBeVisible();
  await captureAndAudit(page, info, 'account-menu-open');
  await page.keyboard.press('Escape');
  await expect(account).toBeFocused();
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (!await menu.isVisible()) return;
  await menu.click();
  const dialog = page.getByRole('dialog');
  const close = dialog.getByRole('button', { name: 'Close', exact: true });
  await expect(close).toBeVisible();
  const bounds = await close.boundingBox();
  expect(bounds!.width).toBeGreaterThanOrEqual(44);
  expect(bounds!.height).toBeGreaterThanOrEqual(44);
  await captureAndAudit(page, info, 'mobile-navigation-open');
  await close.click();
  await expect(dialog).toHaveCount(0);
  await expect(menu).toBeFocused();
});
