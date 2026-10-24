import { expect, test } from '@playwright/test';
import { installLeagueFixture } from './transport';

test('navigation switches at its exact CSS breakpoints without leaving a modal or scroll lock', async ({ page }) => {
  const fixture = await installLeagueFixture(page, 'admin');
  await page.setViewportSize({ width: 1023, height: 900 });
  await page.goto('/#/admin');
  await expect(page.getByRole('heading', { name: 'Administration', exact: true })).toBeVisible();
  const trigger = page.getByRole('button', { name: 'Open navigation', exact: true });
  const sections = page.getByRole('combobox', { name: 'Admin section', exact: true });
  const rail = page.getByRole('navigation', { name: 'Administration sections', exact: true });
  await expect(trigger).toBeVisible();
  await expect(sections).toBeVisible();
  await expect(rail).toBeHidden();
  await trigger.click();
  await expect(page.getByRole('dialog', { name: 'Navigation', exact: true })).toBeVisible();

  await page.setViewportSize({ width: 1024, height: 900 });
  await expect(trigger).toBeHidden();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'League navigation', exact: true })).toBeVisible();
  await expect(page.locator('#page-heading')).toBeFocused();
  await expect.poll(() => page.evaluate(() => globalThis.getComputedStyle(globalThis.document.body).overflow)).not.toBe('hidden');
  await expect(sections).toBeVisible();
  await expect(rail).toBeHidden();

  await page.setViewportSize({ width: 1279, height: 900 });
  await expect(sections).toBeVisible();
  await expect(rail).toBeHidden();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(sections).toBeHidden();
  await expect(rail).toBeVisible();
  expect(fixture.unexpected).toEqual([]);
});
