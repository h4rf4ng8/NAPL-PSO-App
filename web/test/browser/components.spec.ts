import { expect, test } from '@playwright/test';
import { installLeagueFixture } from './transport';

test.beforeEach(async ({ page }) => {
  await installLeagueFixture(page);
  await page.goto('/test/browser/index.html');
});

test('nested dialogs contain keyboard focus and restore the opener', async ({ page }) => {
  await page.getByRole('button', { name: 'Open team details', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Choose lineup player', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#first-choice')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('dialog', { name: /Select lineup player/ }).getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#first-choice')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: /Select lineup player/ })).toHaveCount(0);
  await expect(page.locator('#open-picker')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('#open-dialog')).toBeFocused();
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
});

test('mandatory onboarding ignores Escape and completes explicitly', async ({ page }) => {
  const opener = page.getByRole('button', { name: 'Open mandatory onboarding', exact: true });
  await opener.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: /Mandatory onboarding/ })).toBeVisible();
  await page.getByRole('button', { name: 'Complete onboarding', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('flipped card exports a front-facing full-resolution PNG', async ({ page }) => {
  const card = page.locator('.flip-card').first();
  await card.focus();
  await page.keyboard.press('Enter');
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Export actual card PNG', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#export-result')).toContainText('image/png:', { timeout: 20_000 });
  await expect(page.locator('#export-result')).toContainText('960×1530');
  await expect(page.locator('#export-preview')).toBeVisible();
});

test('ordinary editors block outside clicks and invoke the latest close callback', async ({ page }) => {
  await page.getByRole('button', { name: 'Open team details', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.mouse.click(2, 2);
  await expect(page.getByRole('dialog', { name: /Team details/ })).toBeVisible();
  await page.getByRole('button', { name: 'Change callback version' }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#closed-by')).toContainText('Closed callback: 1; current: 1');
  await expect(page.locator('#open-dialog')).toBeFocused();
});

test('closing nested dialogs together restores page focus and scroll', async ({ page }) => {
  await page.locator('#open-dialog').focus();
  await page.keyboard.press('Enter');
  await page.locator('#open-picker').focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Close all dialogs', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('#open-dialog')).toBeFocused();
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  await expect(page.locator('body')).not.toHaveCSS('pointer-events', 'none');
});

test('an empty mandatory dialog focuses its panel and blocks dismissal', async ({ page }) => {
  const opener = page.getByRole('button', { name: 'Open empty dialog', exact: true });
  await opener.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: /Empty dialog/ });
  await expect(dialog).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog).toBeFocused();
  await page.keyboard.press('Escape');
  await page.mouse.click(2, 2);
  await expect(dialog).toBeVisible();
  await page.locator('#close-all').evaluate((button: HTMLButtonElement) => button.click());
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('share dialog dismisses outside and fits its card at 360px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const opener = page.getByRole('button', { name: 'Open shareable card', exact: true });
  await opener.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  const bounds = await dialog.locator('.flip-card').boundingBox();
  expect(bounds!.width).toBeLessThanOrEqual(328);
  await page.mouse.click(2, 2);
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});
