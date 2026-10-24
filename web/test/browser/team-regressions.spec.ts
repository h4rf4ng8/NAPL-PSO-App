import { expect, test } from '@playwright/test';
import { fullTeam, pageOf, teamSummary, opponent, currentCard } from './league-data';
import { installLeagueFixture } from './transport';

const fixtureUrl = (kind: string) => `/test/browser/regression.html?case=${kind}`;
const seasons = Array.from({ length: 35 }, (_, index) => `CUSTOM${index}`);

for (const logoUrl of ['/api/media/teams/fixture-team/logo?v=saved', 'https://images.example.test/original.png', null]) {
  test(`team editor preserves complete exclusions and unchanged logo: ${logoUrl}`, async ({ page }) => {
    const fixture = await installLeagueFixture(page, 'admin');
    const source = { ...fullTeam, name: 'Old Name', tag: 'OLD', seasons, logoUrl, formation: 'custom', lineup: { legacy: 'Fixture Captain' } };
    const entries = Object.entries(source).map(([key, value], index) => ({ index, key, value }));
    fixture.responses.set('/api/teams/fixture-team/editor', request => {
      const after = new URL(request.url()).searchParams.has('after');
      return { ...pageOf(after ? entries.slice(10) : entries.slice(0, 10)), pageInfo: { endCursor: after ? null : 'next', hasNextPage: !after } };
    });
    // Existing image rendering must not be confused with importing/re-uploading it.
    await page.route('**/api/media/**', route => route.fulfill({ status: 204 }));
    await page.route('https://images.example.test/**', route => route.fulfill({ status: 204 }));
    await page.goto(fixtureUrl('team-editor'));
    await page.getByLabel('Team name', { exact: true }).fill('New Name');
    await expect(page.getByText('CUSTOM34', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /^save changes$/i }).click();
    const writes = () => fixture.requests.filter(request => request.method === 'PATCH');
    if (logoUrl === null) {
      await expect(page.getByText('Team must have a logo', { exact: true })).toBeVisible();
      expect(writes()).toHaveLength(0);
    } else {
      await expect(page.getByText('Team saved', { exact: true })).toBeVisible();
      expect(writes()).toHaveLength(1);
      expect(writes()[0]!.body).toMatchObject({ name: 'New Name', seasons });
      for (const key of ['logoUrl', 'lineup', 'formation']) expect(writes()[0]!.body).not.toHaveProperty(key);
    }
    expect(fixture.requests.filter(request => request.operation.endsWith('/editor'))).toHaveLength(2);
    expect(fixture.unexpected).toEqual([]);
  });
}

test('team selector retains off-page selection and resets server search cursor', async ({ page }) => {
  const fixture = await installLeagueFixture(page, 'member');
  fixture.paginated.add('TeamSummaries');
  await page.goto(fixtureUrl('team-select'));
  const trigger = page.getByRole('combobox', { name: 'Selected team', exact: true });
  await trigger.click();
  await page.getByRole('option', { name: /Fixture United/ }).click();
  await expect(trigger).toContainText('Fixture United');
  await trigger.click();
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.getByRole('option', { name: /Harbor Athletic/ })).toBeVisible();
  await expect(trigger).toContainText('Fixture United');
  await page.getByRole('combobox', { name: 'Search Selected team' }).fill('Harbor');
  await expect.poll(() => (fixture.requests.findLast(request => request.operation === 'TeamSummaries')?.body as { variables?: unknown })?.variables).toMatchObject({ search: 'Harbor', after: null });
  await expect(page.getByRole('button', { name: 'Previous page', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Selected team ID')).toHaveText('fixture-team');
  expect(fixture.unexpected).toEqual([]);
});

test('captain editing waits for the complete roster and recovers from a failed last page', async ({ page }) => {
  const fixture = await installLeagueFixture(page, 'captain');
  let complete = false;
  fixture.responses.set('TeamPlayers', request => {
    const after = request.postDataJSON().variables.after;
    if (after) return { errors: [{ message: 'stale_cursor' }] };
    return { data: { teamPlayers: { ...pageOf(complete ? [currentCard('captain'), { ...currentCard('member'), id: 'other' }] : [currentCard('captain')], 'AccountCardPage'), pageInfo: { endCursor: complete ? null : 'next', hasNextPage: !complete } } } };
  });
  await page.goto(fixtureUrl('teams'));
  await page.getByRole('button', { name: 'View roster and team', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Load more roster cards' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit lineup', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Load more roster cards' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'stale_cursor' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit lineup', exact: true })).toHaveCount(0);
  complete = true;
  await page.getByRole('button', { name: 'Reload team', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit lineup', exact: true })).toBeEnabled();
  expect(fixture.unexpected).toEqual([]);
});

for (const privateDescriptor of [false, true]) test(`rejection reason requires its private descriptor: ${privateDescriptor}`, async ({ page }) => {
  const fixture = await installLeagueFixture(page, 'captain');
  fixture.responses.set('/api/teams/fixture-team', () => ({ ...fullTeam, status: 'rejected', formation: '2-1-2', lineupUrl: '/api/teams/fixture-team/lineup', descriptionUrl: '/api/teams/fixture-team/description', ...(privateDescriptor && { rejectionReasonUrl: '/api/teams/fixture-team/reason' }) }));
  await page.goto(fixtureUrl('teams'));
  await page.getByRole('button', { name: 'View roster and team', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Roster', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Read review reason', exact: true })).toHaveCount(Number(privateDescriptor));
  expect(fixture.requests.some(request => request.operation.endsWith('/reason'))).toBe(false);
});

test('approving a team on page two restarts the pending first page', async ({ page }) => {
  const fixture = await installLeagueFixture(page, 'admin');
  let approved = false;
  fixture.responses.set('TeamSummaries', request => {
    const after = request.postDataJSON().variables.after;
    return { data: { teamSummaries: { ...pageOf(approved ? [] : [{ ...teamSummary(after ? opponent : undefined), status: 'pending' }], 'TeamSummaryPage'), pageInfo: { endCursor: after ? null : 'next', hasNextPage: !after && !approved } } } };
  });
  fixture.responses.set('/api/teams/fixture-opponent/review', () => { approved = true; return { saved: true }; });
  await page.goto(fixtureUrl('admin'));
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await page.getByRole('button', { name: /^approve$/i }).click();
  await expect.poll(() => approved).toBe(true);
  await expect.poll(() => (fixture.requests.findLast(request => request.operation === 'TeamSummaries')?.body as { variables?: unknown })?.variables).toMatchObject({ after: null });
  await expect(page.getByRole('button', { name: 'Previous page', exact: true })).toBeDisabled();
  expect(fixture.unexpected).toEqual([]);
});

test('schedule generation retains teams across pages and resets the server search cursor', async ({ page }) => {
  const fixture = await installLeagueFixture(page, 'admin');
  fixture.paginated.add('TeamSummaries');
  await page.goto(fixtureUrl('generation'));
  await page.getByRole('checkbox', { name: /Fixture United/ }).check();
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await page.getByRole('checkbox', { name: /Harbor Athletic/ }).check();
  await expect(page.getByRole('button', { name: 'Remove Fixture United', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove Harbor Athletic', exact: true })).toBeVisible();
  await page.getByLabel('Search generation teams').fill('Fixture');
  await expect.poll(() => (fixture.requests.findLast(request => request.operation === 'TeamSummaries')?.body as { variables?: unknown })?.variables).toMatchObject({ after: null, search: 'Fixture' });
  await page.getByLabel('Search generation teams').fill('');
  await expect(page.getByRole('button', { name: 'Previous page', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Remove Fixture United', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove Harbor Athletic', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /preview schedule/i }).click();
  await expect(page.getByRole('dialog')).toContainText(/preview.*weeks/i);
  expect(fixture.unexpected).toEqual([]);
});
