import { expect, test } from '@playwright/test';
import { fullTeam, opponent, pageOf, scheduledMatch } from './league-data';
import { installLeagueFixture } from './transport';
import { captureAndAudit } from './checks';

test('a delayed team load cannot replace another editor after a status change', async ({ page }, info) => {
  const fixture = await installLeagueFixture(page, 'admin');
  const pending = Promise.withResolvers<void>();
  fixture.holds.set('/api/teams/fixture-team', pending.promise);
  const other = { ...fullTeam, ...opponent, logoUrl: '/api/media/teams/fixture-opponent/logo' };
  fixture.responses.set('/api/teams/fixture-opponent', () => ({ ...other, editorUrl: '/api/teams/fixture-opponent/editor' }));
  fixture.responses.set('/api/teams/fixture-opponent/editor', () => pageOf(Object.entries(other).map(([key, value], index) => ({ index, key, value }))));
  await page.route('**/api/media/**', route => route.fulfill({ status: 204 }));
  await page.goto('/test/browser/regression.html?case=admin');
  await page.getByRole('tab', { name: 'Approved', exact: true }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await expect.poll(() => fixture.requests.some(request => request.operation === '/api/teams/fixture-team')).toBe(true);
  await expect(page.getByRole('button', { name: 'Edit', exact: true }).last()).toBeDisabled();
  await page.getByRole('tab', { name: 'Pending', exact: true }).click();
  await page.getByRole('tab', { name: 'Approved', exact: true }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).last().click();
  await expect(page.getByLabel('Team name', { exact: true })).toHaveValue(opponent.name);
  await captureAndAudit(page, info, 'team-editor');
  const lateResponse = page.waitForResponse(response => response.url().includes('/api/teams/fixture-team/editor'));
  pending.resolve();
  await lateResponse;
  await expect(page.getByLabel('Team name', { exact: true })).toHaveValue(opponent.name);
  await page.getByRole('button', { name: /^save changes$/i }).click();
  await expect.poll(() => fixture.requests.filter(request => request.method === 'PATCH').length).toBe(1);
  expect(fixture.requests.find(request => request.method === 'PATCH')).toMatchObject({ operation: '/api/teams/fixture-opponent', body: { name: opponent.name } });
  expect(fixture.unexpected).toEqual([]);
});

test('a delayed match load cannot retarget an editor after a season change', async ({ page }, info) => {
  const fixture = await installLeagueFixture(page, 'admin');
  const pending = Promise.withResolvers<void>();
  fixture.responses.set('Seasons', () => ({ data: { seasons: { ...pageOf(['S1', 'S2'], 'StringPage'), summaries: [{ games: 12, players: 24 }, { games: 1, players: 12 }] } } }));
  fixture.responses.set('/api/schedule', request => {
    if (request.method() !== 'GET') return { saved: true };
    const season = new URL(request.url()).searchParams.get('season');
    return { ...pageOf([{ ...scheduledMatch, id: season === 'S2' ? 'second-match' : 'fixture-match', season, notesUrl: `/api/schedule/${season === 'S2' ? 'second-match' : 'fixture-match'}/notes` }]), weekRange: { min: 1, max: 1, count: 1 } };
  });
  fixture.holds.set('/api/schedule/fixture-match/notes', pending.promise);
  fixture.responses.set('/api/schedule/fixture-match/links/stream-url', () => pageOf(['https://stream.example.test/old']));
  fixture.responses.set('/api/schedule/second-match/notes', () => pageOf(['Second match notes']));
  fixture.responses.set('/api/schedule/second-match/links/stream-url', () => pageOf(['https://stream.example.test/second']));
  await page.goto('/test/browser/regression.html?case=schedule');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect.poll(() => fixture.requests.some(request => request.operation === '/api/schedule/fixture-match/notes')).toBe(true);
  await page.getByRole('combobox', { name: 'Schedule season' }).click();
  await page.getByRole('option', { name: 'S2', exact: true }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Notes (optional)')).toHaveValue('Second match notes');
  const lateResponse = page.waitForResponse(response => response.url().includes('/api/schedule/fixture-match/notes'));
  pending.resolve();
  await lateResponse;
  await expect(page.getByLabel('Notes (optional)')).toHaveValue('Second match notes');
  await expect(page.getByLabel('Stream URL (optional)')).toHaveValue('https://stream.example.test/second');
  await page.getByRole('combobox', { name: 'Status', exact: true }).click();
  await page.getByRole('option', { name: 'Cancelled', exact: true }).click();
  await captureAndAudit(page, info, 'match-editor');
  await page.getByRole('button', { name: 'Save match', exact: true }).click();
  await expect.poll(() => fixture.requests.filter(request => request.operation === '/api/schedule' && request.method === 'POST').length).toBe(1);
  expect(fixture.requests.find(request => request.operation === '/api/schedule' && request.method === 'POST')?.body).toMatchObject({ id: 'second-match', season: 'S2', status: 'cancelled', notes: 'Second match notes', streamUrl: 'https://stream.example.test/second' });
  expect(fixture.unexpected).toEqual([]);
});

test('adding a match blocks duplicate teams before sending a complete schedule payload', async ({ page }) => {
  const fixture = await installLeagueFixture(page, 'admin');
  await page.goto('/test/browser/regression.html?case=schedule');
  await page.getByRole('button', { name: 'Add match', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /Add match/ });
  for (const name of ['Home team', 'Away team']) {
    await dialog.getByRole('combobox', { name, exact: true }).click();
    await page.getByRole('option', { name: /Fixture United/ }).click();
  }
  await dialog.getByRole('button', { name: 'Add match', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Home and away must be different teams.');
  const writes = () => fixture.requests.filter(request => request.operation === '/api/schedule' && request.method === 'POST');
  expect(writes()).toHaveLength(0);
  await dialog.getByRole('combobox', { name: 'Away team', exact: true }).click();
  await page.getByRole('option', { name: /Harbor Athletic/ }).click();
  await dialog.getByRole('button', { name: 'Add match', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(writes()).toHaveLength(1);
  expect(writes()[0]!.body).toMatchObject({ season: 'S1', week: 1, homeTeamId: 'fixture-team', awayTeamId: 'fixture-opponent', scheduledDate: null, status: 'scheduled', matchType: 'regular' });
  expect(fixture.unexpected).toEqual([]);
});
