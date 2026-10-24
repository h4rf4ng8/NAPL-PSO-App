import { expect, test } from '@playwright/test';
import { installLeagueFixture } from './transport';
import { pageOf } from './league-data';

test('position request keeps an explicit receipt until Done and removes repeat submission', async ({ page }) => {
  const fixture = await installLeagueFixture(page, 'member');
  fixture.responses.set('/api/position-requests', request => request.method() === 'GET' ? pageOf([]) : { saved: true });
  await page.goto('/#/card');
  await page.getByRole('button', { name: 'Position', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /Change position/ });
  await dialog.getByRole('radio', { name: 'CM', exact: true }).click();
  await dialog.getByRole('textbox', { name: /Reason/ }).fill('More experience in midfield.');
  await dialog.getByRole('button', { name: 'Submit request', exact: true }).click();

  await expect(dialog.getByRole('status')).toContainText('Request submitted');
  await expect(dialog.getByRole('status')).toContainText('change to CM');
  await expect(dialog.getByRole('button', { name: 'Submit request', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('radio')).toHaveCount(0);
  const writes = () => fixture.requests.filter(request => request.method === 'POST' && request.operation === '/api/position-requests');
  expect(writes()).toHaveLength(1);
  expect(writes()[0]!.body).toEqual({ toPos: 'CM', reason: 'More experience in midfield.' });

  const done = dialog.getByRole('button', { name: 'Done', exact: true });
  await done.focus();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  const nextDialog = page.getByRole('dialog', { name: /Player image/ });
  await expect(nextDialog).toBeVisible();
  await expect(nextDialog.getByRole('button', { name: 'Choose a picture', exact: true })).toBeVisible();
  expect(writes()).toHaveLength(1);
  await nextDialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(nextDialog).toHaveCount(0);
  expect(fixture.unexpected).toEqual([]);
});

for (const method of ['PUT', 'DELETE'] as const) {
  test(`award ${method} keeps the saved receipt when refresh fails and retries only the read`, async ({ page }) => {
    const fixture = await installLeagueFixture(page, 'admin');
    const awardPath = '/api/accounts/fixture-player/awards/striker/S1';
    fixture.responses.set(awardPath, request => {
      expect(request.method()).toBe(method);
      fixture.failures.add('AccountAwards');
      return { saved: true };
    });
    await page.goto('/#/admin');
    await expect(page.getByRole('heading', { name: 'Administration', exact: true })).toBeVisible();
    const section = page.getByRole('combobox', { name: 'Admin section', exact: true });
    if (await section.isVisible()) {
      await section.click();
      await page.getByRole('option', { name: 'Awards', exact: true }).click();
    } else {
      await page.getByRole('button', { name: 'Awards', exact: true }).click();
    }
    await page.getByRole('combobox', { name: 'Winner', exact: true }).click();
    await page.getByRole('option', { name: 'Fixture Player', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Remove award', exact: true })).toBeVisible();
    const assign = page.getByRole('button', { name: 'Assign Golden Boot', exact: true });
    if (method === 'PUT') {
      await assign.click();
    } else {
      await page.getByRole('button', { name: 'Remove award', exact: true }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Remove award', exact: true }).click();
    }

    const receipt = page.getByRole('status').filter({ hasText: method === 'PUT' ? 'Golden Boot S1 assigned to Fixture Player' : 'Golden Boot S1 removed from Fixture Player' });
    const refreshWarning = page.getByText(/The award change was saved, but the latest data could not be loaded:/);
    await expect(receipt).toBeVisible();
    await expect(refreshWarning).toBeVisible();
    await expect(page.getByText(/Could not assign award:|Could not remove award:/)).toHaveCount(0);
    await expect(assign).toBeDisabled();
    const writes = () => fixture.requests.filter(request => request.operation === awardPath);
    expect(writes()).toHaveLength(1);
    expect(writes()[0]!.method).toBe(method);

    const readsBeforeRetry = fixture.requests.filter(request => request.operation === 'AccountAwards').length;
    const requestsBeforeRetry = fixture.requests.length;
    fixture.failures.delete('AccountAwards');
    await page.getByRole('button', { name: 'Retry refresh', exact: true }).click();
    await expect(refreshWarning).toHaveCount(0);
    await expect(assign).toBeEnabled();
    await expect(receipt).toBeVisible();
    await expect.poll(() => fixture.requests.filter(request => request.operation === 'AccountAwards').length).toBeGreaterThan(readsBeforeRetry);
    expect(writes()).toHaveLength(1);
    expect(fixture.requests.slice(requestsBeforeRetry).filter(request => request.operation.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method))).toEqual([]);
    expect(fixture.unexpected).toEqual([]);
  });
}
