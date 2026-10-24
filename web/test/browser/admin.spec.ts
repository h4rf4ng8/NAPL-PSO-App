import { expect, test, type Page } from '@playwright/test';
import { captureAndAudit } from './checks';
import { installLeagueFixture } from './transport';

export async function adminSection(page: Page, name: string) {
  const mobile = page.getByRole('combobox', { name: 'Admin section', exact: true });
  if (await mobile.isVisible()) { await mobile.click(); await page.getByRole('option', { name, exact: true }).click(); }
  else await page.getByRole('navigation', { name: 'Administration sections' }).getByRole('button', { name, exact: true }).click();
}
for (const theme of ['light', 'dark']) test(`super-admin sections work in ${theme} theme`, async ({ page }, info) => {
  test.setTimeout(180_000);
  const fixture = await installLeagueFixture(page, 'super-admin');
  await page.addInitScript(value => localStorage.setItem('asl_theme', value), theme);
  await page.goto('/#/admin');
  await expect(page.getByRole('heading', { name: 'Administration', exact: true })).toBeVisible();
  for (const name of ['Teams', 'Team of the Week', 'Players', 'Import matches', 'Rules', 'Pictures', 'Awards', 'Season', 'Administrators', 'Rating weights', 'Discord']) {
    await test.step(name, async () => {
      await adminSection(page, name);
      await expect(page.getByRole('alert')).toHaveCount(0);
      if (name === 'Rules' && page.viewportSize()!.width < 640) {
        const title = page.getByRole('heading', { name: 'Fair play', exact: true });
        await expect(title).toBeVisible();
        expect((await title.boundingBox())!.width, 'rule title must have a readable line width').toBeGreaterThanOrEqual(160);
      }
      await captureAndAudit(page, info, `admin-${theme}-${name}`);
    });
  }
  expect(fixture.unexpected).toEqual([]);
});
