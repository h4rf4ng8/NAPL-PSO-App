import { expect, test } from '@playwright/test';
import { installLeagueFixture } from './transport';

for (const role of ['visitor', 'member', 'captain', 'admin', 'super-admin'] as const) {
  test(`${role} loads the real application with only synthetic transport`, async ({ page }, testInfo) => {
    const fixture = await installLeagueFixture(page, role);
    const errors: string[] = [];
    page.on('pageerror', error => { errors.push(error.message); });
    const administrator = role === 'admin' || role === 'super-admin';
    await page.goto(administrator ? '/#/admin' : '/');
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('main')).toContainText(role === 'visitor' ? 'Fixture United' : (administrator ? /administration/i : /my profile/i));
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(fixture.unexpected).toEqual([]);
    expect(errors).toEqual([]);
    await testInfo.attach(`${role}-${testInfo.project.name}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  });
}
