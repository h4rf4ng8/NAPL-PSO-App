import { expect, test } from '@playwright/test';
import { installLeagueFixture } from './transport';
import { pageOf, teamSummary, opponent } from './league-data';

test('championship editor retains saved off-page winner and saves chosen runner-up after search', async ({ page }) => {
  const fixture = await installLeagueFixture(page, 'super-admin');
  fixture.paginated.add('TeamSummaries');
  fixture.responses.set('/api/settings/season_champions', request => request.method() === 'GET' ? pageOf([{ index: 0, key: 'S1', value: { winnerTeamId: 'saved-team', runnerUpTeamId: null, setAt: 1 } }]) : { saved: true });
  fixture.responses.set('/api/teams/saved-team', () => ({ ...teamSummary(), id: 'saved-team', name: 'Saved Team', memberCount: 0 }));
  fixture.responses.set('/api/teams/fixture-opponent', () => ({ ...teamSummary(opponent), memberCount: 0 }));
  fixture.responses.set('/api/teams/fixture-opponent/members', () => pageOf([]));
  fixture.responses.set('/api/teams/saved-team/members', () => pageOf([]));
  await page.goto('/test/browser/regression.html?case=champions');
  const winner = page.getByRole('combobox', { name: 'Winner · Gold trophy', exact: true });
  const runner = page.getByRole('combobox', { name: 'Runner-up · Silver trophy', exact: true });
  await expect(winner).toContainText('Saved Team');
  await page.getByRole('button', { name: 'Next page', exact: true }).first().click();
  await runner.click();
  await page.getByRole('option', { name: /Harbor Athletic/ }).click();
  await page.getByLabel('Find championship team', { exact: true }).fill('Fixture');
  await expect.poll(() => (fixture.requests.findLast(request => request.operation === 'TeamSummaries')?.body as { variables?: unknown })?.variables).toMatchObject({ after: null, search: 'Fixture' });
  await expect(winner).toContainText('Saved Team');
  await expect(runner).toContainText('Harbor Athletic');
  await page.getByRole('button', { name: 'Save S1 champions', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Award trophies', exact: true }).click();
  await expect.poll(() => fixture.requests.filter(request => request.method === 'PUT' && request.operation === '/api/settings/season_champions').length).toBe(1);
  expect(fixture.requests.find(request => request.method === 'PUT' && request.operation === '/api/settings/season_champions')!.body).toMatchObject({ value: { S1: { winnerTeamId: 'saved-team', runnerUpTeamId: 'fixture-opponent' } } });
  expect(fixture.unexpected).toEqual([]);
});

for (const failFreshRead of [false, true]) test(`administrator promotion preserves a fresh complete role snapshot: initial failure=${failFreshRead}`, async ({ page }) => {
  const fixture = await installLeagueFixture(page, 'super-admin');
  fixture.responses.set('/api/roles', request => {
    if (request.method() === 'PUT') return { saved: true };
    const second = new URL(request.url()).searchParams.has('after');
    return { ...pageOf([{ userId: second ? 'offpage' : 'first', username: second ? 'Off Page' : 'First', role: 'admin' }]), totalCount: 2, pageInfo: { endCursor: second ? null : 'next', hasNextPage: !second } };
  });
  await page.goto('/test/browser/regression.html?case=admins');
  await page.getByRole('button', { name: 'Promote a player', exact: true }).click();
  await page.getByRole('option', { name: /Fixture Player/ }).click();
  expect(fixture.requests.filter(request => request.operation === '/api/roles' && request.method === 'GET')).toHaveLength(1);
  if (failFreshRead) fixture.failures.add('/api/roles');
  await page.getByRole('button', { name: 'Promote to admin', exact: true }).click();
  if (failFreshRead) {
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Fixture temporarily unavailable');
    expect(fixture.requests.filter(request => request.method === 'PUT')).toHaveLength(0);
    fixture.failures.delete('/api/roles');
    await page.getByRole('button', { name: 'Promote to admin', exact: true }).click();
  }
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(fixture.requests.find(request => request.method === 'PUT')!.body).toEqual({ userIds: ['first', 'offpage', 'fixture-player'] });
  expect(fixture.unexpected).toEqual([]);
});

test('administrator removal checks the fresh protected super-admin role before writing', async ({ page }) => {
  const fixture = await installLeagueFixture(page, 'super-admin');
  let protectedNow = false;
  fixture.responses.set('/api/roles', () => pageOf([{ userId: 'first', username: 'First', role: protectedNow ? 'super_admin' : 'admin' }]));
  await page.goto('/test/browser/regression.html?case=admins');
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  protectedNow = true;
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove administrator', exact: true }).click();
  await expect(page.getByRole('alertdialog').getByRole('alert')).toContainText('Super administrators cannot be removed.');
  expect(fixture.requests.filter(request => request.method === 'PUT')).toHaveLength(0);
});
