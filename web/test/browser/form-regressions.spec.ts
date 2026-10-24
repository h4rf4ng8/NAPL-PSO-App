import { expect, test } from '@playwright/test';
import { article, pageOf } from './league-data';
import { installLeagueFixture } from './transport';

for (const coverImageUrl of ['https://expired.example/old.png', '/api/media/articles/fixture-article/cover?v=1']) test(`article cover unchanged and removed payloads: ${coverImageUrl}`, async ({ page }) => {
  const fixture = await installLeagueFixture(page, 'admin');
  fixture.responses.set('/api/articles/slug/league-update', () => ({ ...article, title: 'Original', body: 'Full body', excerpt: 'Excerpt', coverImageUrl }));
  await page.route('**/api/media/**', route => route.fulfill({ status: 204 }));
  await page.route('https://expired.example/**', route => route.fulfill({ status: 404 }));
  await page.goto('/test/browser/regression.html?case=article');
  await page.getByRole('button', { name: 'Edit article', exact: true }).click();
  const editor = page.getByRole('dialog');
  await editor.getByRole('textbox', { name: 'Title', exact: true }).fill('Changed title');
  await editor.getByRole('button', { name: /^save changes$/i }).click();
  await expect(editor).toHaveCount(0);
  const writes = () => fixture.requests.filter(request => request.operation === '/api/articles' && request.method === 'POST');
  expect(writes()[0]!.body).toMatchObject({ title: 'Changed title' });
  expect(writes()[0]!.body).not.toHaveProperty('coverImageUrl');
  await page.getByRole('button', { name: 'Edit article', exact: true }).click();
  await page.getByRole('button', { name: 'Remove cover image', exact: true }).click();
  await page.getByRole('button', { name: /^save changes$/i }).click();
  await expect(editor).toHaveCount(0);
  expect(writes()[1]!.body).toHaveProperty('coverImageUrl', null);
  expect(fixture.requests.filter(request => /upload|import/.test(request.operation))).toHaveLength(0);
  expect(fixture.unexpected).toEqual([]);
});

test('match import scopes lookups to uploaded IDs and retains off-page manual mapping', async ({ page }) => {
  const fixture = await installLeagueFixture(page, 'admin');
  const skippedName = '未登録'.repeat(100);
  fixture.responses.set('ImportAccountMatches', request => {
    const second = !!request.postDataJSON().variables.after;
    return { data: { importAccountMatches: { ...pageOf([{ __typename: 'ImportAccountSummary', username: second ? 'Auto Two' : 'Auto One', strikersId: second ? '102' : '101' }], 'ImportAccountSummaryPage'), pageInfo: { endCursor: second ? null : 'next', hasNextPage: !second } } } };
  });
  fixture.responses.set('/api/accounts', request => {
    const second = new URL(request.url()).searchParams.has('after');
    return { ...pageOf([{ id: second ? 'manual' : 'first', username: second ? 'Manual Player' : 'First Choice', position: 'CM' }]), pageInfo: { endCursor: second ? null : 'next', hasNextPage: !second } };
  });
  fixture.responses.set('/api/match-imports', () => ({ ok: true, matchId: 'fixture', updated: 1, alreadyImported: 1, skipped: 1, skippedIndexes: [2], homeTeam: 'Fixture United', awayTeam: 'Harbor Athletic', score: '2 - 0' }));
  await page.goto('/test/browser/regression.html?case=import');
  expect(fixture.requests.filter(request => request.operation === '/api/accounts' || request.operation === 'ImportAccountMatches')).toHaveLength(0);
  const source = { match_id: 'fixture', score: { home: 2, away: 0 }, players: [{ player_id: '101', username: 'Source One', team: 'home', stats: { goals: 2 } }, { player_id: '102', username: 'Source Two', team: 'away', stats: {} }, { player_id: '103', username: skippedName, team: 'away', stats: {} }] };
  await page.locator('input[type=file]').setInputFiles({ name: 'match.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)) });
  await expect.poll(() => fixture.requests.filter(request => request.operation === 'ImportAccountMatches').length).toBe(2);
  const lookups = fixture.requests.filter(request => request.operation === 'ImportAccountMatches').map(request => (request.body as { variables: Record<string, unknown> }).variables);
  expect(lookups.map(value => value.strikersIds)).toEqual([['101', '102', '103'], ['101', '102', '103']]);
  expect(lookups[1]!.after).toBe('next');
  expect(fixture.requests.filter(request => request.operation === '/api/accounts')).toHaveLength(0);
  await page.getByRole('combobox', { name: 'Home import team', exact: true }).click();
  await page.getByRole('option', { name: /Fixture United/ }).click();
  await page.getByRole('combobox', { name: 'Away import team', exact: true }).click();
  await page.getByRole('option', { name: /Harbor Athletic/ }).click();
  await page.getByRole('button', { name: /next.*map players/i }).click();
  await expect(page.getByRole('button', { name: 'Map Source One to ASL account', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Map Source Two to ASL account', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Next page', exact: true }).click();
  await page.getByRole('option', { name: 'Manual Player · CM', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Map Source Two to ASL account', exact: true })).toContainText('Manual Player');
  await page.getByRole('button', { name: /next.*confirm/i }).click();
  await page.getByRole('button', { name: /confirm import.*2 players/i }).click();
  await expect(page.getByText(/import complete/i)).toBeVisible();
  await expect(page.getByRole('main')).toContainText(skippedName);
  await expect(page.getByText(/already imported/i)).toBeVisible();
  const writes = fixture.requests.filter(request => request.operation === '/api/match-imports');
  expect(writes).toHaveLength(1);
  expect(writes[0]!.body).toHaveProperty('playerMap', { '101': 'Auto One', '102': 'Manual Player', '103': '' });
  expect(fixture.unexpected).toEqual([]);
});
