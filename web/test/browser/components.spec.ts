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
  await expect(page.getByRole('button', { name: 'Close all dialogs', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#first-choice')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Select lineup player', exact: true })).toHaveCount(0);
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
  await expect(page.getByRole('dialog', { name: 'Mandatory onboarding', exact: true })).toBeVisible();
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
  await expect(page.locator('#export-result')).toContainText('image/png:');
  await expect(page.locator('#export-result')).toContainText('960×1530');
  await expect(page.locator('#export-preview')).toBeVisible();
});
