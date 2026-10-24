import { expect, test } from '@playwright/test';
import { installLeagueFixture } from './transport';

const endpoint = '/api/voting/periods/fixture-vote/votes/me';
const choices = { gk: 'Candidate GK', def: 'Candidate DEF', cm: 'Candidate CM', st: 'Candidate ST' };

test('ballot requires every position, preserves rejected selections and retries the same payload', async ({ page }) => {
  const fixture = await installLeagueFixture(page, 'member');
  await page.goto('/#/vote');
  const submit = page.getByRole('button', { name: 'Submit votes', exact: true });
  await expect(submit).toBeDisabled();
  for (const name of Object.values(choices)) await page.getByRole('radio', { name: new RegExp(name) }).check();
  await expect(submit).toBeEnabled();
  fixture.failures.add(endpoint);
  await submit.click();
  await expect(page.getByRole('alert').filter({ hasText: 'Could not submit' })).toBeVisible();
  for (const name of Object.values(choices)) await expect(page.getByRole('radio', { name: new RegExp(name) })).toBeChecked();
  fixture.failures.delete(endpoint);
  await submit.click();
  await expect(page.getByRole('status').filter({ hasText: 'Your votes are saved' })).toBeVisible();
  const writes = fixture.requests.filter(request => request.operation === endpoint && request.method === 'PUT');
  expect(writes.map(request => request.body)).toEqual([choices, choices]);
  expect(fixture.unexpected).toEqual([]);
});

test('previous ballot failure blocks editing until retry restores saved choices', async ({ page }) => {
  const fixture = await installLeagueFixture(page, 'member');
  fixture.failures.add(endpoint);
  fixture.responses.set(endpoint, () => Object.entries(choices).map(([position, votedForUsername]) => ({ voterUsername: 'Fixture Player', position: position.toUpperCase(), votedForUsername })));
  await page.goto('/#/vote');
  await expect(page.getByRole('button', { name: 'Submit votes', exact: true })).toBeDisabled();
  await expect(page.getByRole('radio').first()).toBeDisabled();
  fixture.failures.delete(endpoint);
  await page.getByRole('button', { name: 'Retry previous votes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Update votes', exact: true })).toBeEnabled();
  for (const name of Object.values(choices)) await expect(page.getByRole('radio', { name: new RegExp(name) })).toBeChecked();
  expect(fixture.requests.filter(request => request.operation === endpoint && request.method === 'PUT')).toHaveLength(0);
  expect(fixture.unexpected).toEqual([]);
});
