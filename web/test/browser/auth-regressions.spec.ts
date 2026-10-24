import { expect, test, type Page } from '@playwright/test';
import { installLeagueFixture } from './transport';
import { session } from '../session-fixture';

async function sdk(page: Page, action: 'signout' | 'refresh' | 'signin') {
  await page.evaluate(async action => {
    const path = '/src/auth/client.ts';
    const { supabase } = await import(path);
    switch (action) {
    case 'signout': {
    await supabase.auth.signOut({ scope: 'local' });
    break;
    }
    case 'refresh': {
    await supabase.auth.refreshSession();
    break;
    }
    case 'signin': {
    await supabase.auth.signInWithPassword({ email: 'second@example.test', password: 'synthetic' });
    break;
    }
    // No default
    }
  }, action);
}
async function navigate(page: Page, name: string) {
  const mobile = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await mobile.isVisible()) await mobile.click();
  await page.getByRole('navigation', { name: 'League navigation' }).getByRole('link', { name, exact: true }).click();
}

test('home reads start independently of league overview and expose its failure', async ({ page }) => {
  const fixture = await installLeagueFixture(page, 'member');
  const pending = Promise.withResolvers<void>();
  fixture.holds.set('LeagueOverview', pending.promise);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Account menu for Fixture Player' })).toBeVisible();
  await expect.poll(() => fixture.requests.filter(request => request.operation === 'HomeSummary').length).toBe(1);
  await expect.poll(() => fixture.requests.filter(request => request.operation === 'HomeNews').length).toBe(3);
  await expect(page.getByRole('main').first()).toContainText(/loading league/i);
  fixture.failures.add('LeagueOverview');
  pending.resolve();
  await expect(page.getByRole('alert').filter({ hasText: 'Fixture temporarily unavailable' })).toBeVisible();
  await expect(page.getByRole('main').first()).toContainText(/my profile/i);
});

test('career and stats refresh on navigation without duplicate initial overview', async ({ page }) => {
  const fixture = await installLeagueFixture(page, 'member');
  fixture.account.stats = { ...fixture.account.stats, games: 1 };
  fixture.account.ranking = { ...fixture.account.ranking, gamesPlayed: 1 };
  fixture.account.cardStats[5]!.value = '1';
  await page.goto('/#/card');
  await expect(page.locator('.flip-card').first()).toBeVisible();
  expect(fixture.requests.filter(request => request.operation === 'LeagueOverview')).toHaveLength(1);
  await navigate(page, 'Stats');
  await expect(page.getByRole('table')).toBeVisible();
  fixture.account.stats = { ...fixture.account.stats, games: 4 };
  fixture.account.ranking = { ...fixture.account.ranking, gamesPlayed: 4 };
  fixture.account.cardStats[5]!.value = '4';
  await navigate(page, 'My Card');
  await expect.poll(() => fixture.requests.filter(request => request.operation === 'LeagueOverview').length).toBe(2);
  await expect(page.locator('.flip-card').first()).toContainText('GP');
  await navigate(page, 'Stats');
  await expect.poll(() => fixture.requests.filter(request => request.operation === 'Leaderboard').length).toBe(2);
  await expect(page.getByRole('row').filter({ hasText: 'Fixture Player' })).toContainText('4');
  fixture.failures.add('LeagueOverview');
  await navigate(page, 'My Card');
  await expect(page.getByRole('alert').filter({ hasText: 'Fixture temporarily unavailable' })).toBeVisible();
});

test('real SDK cross-tab sign-out removes private UI and clears Apollo cache', async ({ page, context }) => {
  const fixture = await installLeagueFixture(page, 'member');
  await page.goto('/#/card');
  await expect(page.getByRole('button', { name: 'Account menu for Fixture Player' })).toBeVisible();
  const other = await context.newPage();
  await installLeagueFixture(other, 'member');
  await other.goto('/test/browser/regression.html');
  await sdk(other, 'signout');
  await expect(page.getByRole('button', { name: /Account menu for/ })).toHaveCount(0);
  await expect(page.getByRole('main').first()).not.toContainText(/my profile/i);
  const cache = await page.evaluate(async () => { const path = '/src/api/client.ts'; return (await import(path)).client.cache.extract(); });
  expect(Object.keys(cache).filter(key => key.startsWith('CurrentAccount'))).toEqual([]);
  expect(fixture.requests.filter(request => request.operation === 'TeamSummaries').every(request => request.authorization === null)).toBe(true);
  await other.close();
});

test('token renewal keeps the mounted account and cache without refetching profile', async ({ page }) => {
  const fixture = await installLeagueFixture(page, 'member');
  await page.goto('/#/card');
  await expect(page.locator('.flip-card').first()).toBeVisible();
  const reads = fixture.requests.filter(request => request.operation === '/api/accounts/me').length;
  const cached = await page.evaluate(async () => { const path = '/src/api/client.ts'; return Object.keys((await import(path)).client.cache.extract()); });
  fixture.authSession = session('fixture-player', 2);
  await sdk(page, 'refresh');
  await expect(page.getByRole('button', { name: 'Account menu for Fixture Player' })).toBeVisible();
  expect(fixture.requests.filter(request => request.operation === '/api/accounts/me')).toHaveLength(reads);
  expect(await page.evaluate(async () => { const path = '/src/api/client.ts'; return Object.keys((await import(path)).client.cache.extract()); })).toEqual(cached);
});

test('late profile loads cannot expose the previous account after a switch', async ({ page }) => {
  const fixture = await installLeagueFixture(page, 'member');
  const delayed = Promise.withResolvers<unknown>();
  let loads = 0;
  fixture.responses.set('/api/accounts/me', () => ++loads === 1 ? delayed.promise : { ...fixture.account, id: 'user-b', username: 'Second Player' });
  await page.goto('/');
  await expect.poll(() => loads).toBe(1);
  fixture.authSession = session('user-b');
  Object.assign(fixture.account, { id: 'user-b', username: 'Second Player' });
  await sdk(page, 'signin');
  await expect(page.getByRole('button', { name: 'Account menu for Second Player' })).toBeVisible();
  delayed.resolve({ ...fixture.account, id: 'fixture-player', username: 'Old Player' });
  await expect(page.getByRole('button', { name: 'Account menu for Second Player' })).toBeVisible();
  await expect(page.getByRole('main').first()).not.toContainText('Old Player');
});

test('sign-out hides private state while token refresh and revocation are pending', async ({ page }) => {
  const fixture = await installLeagueFixture(page, 'member');
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Account menu for Fixture Player' })).toBeVisible();
  const refresh = Promise.withResolvers<void>();
  const revoke = Promise.withResolvers<void>();
  fixture.holds.set('/auth/v1/token', refresh.promise);
  fixture.holds.set('/auth/v1/logout', revoke.promise);
  fixture.authSession = session('fixture-player', 2);
  const refreshing = sdk(page, 'refresh');
  await page.getByRole('button', { name: 'Account menu for Fixture Player' }).click();
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: /Account menu for/ })).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText(/loading league/i);
  expect(fixture.requests.filter(request => request.operation === 'TeamSummaries')).toHaveLength(0);
  refresh.resolve();
  await refreshing;
  await expect(page.getByRole('status')).toContainText(/loading league/i);
  expect(fixture.requests.filter(request => request.operation === 'TeamSummaries')).toHaveLength(0);
  revoke.resolve();
  await expect.poll(() => fixture.requests.filter(request => request.operation === 'TeamSummaries').length).toBe(1);
  expect(fixture.requests.find(request => request.operation === 'TeamSummaries')!.authorization).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('napl-auth'))).toBeNull();
});

test('an old visible account cannot borrow a cross-tab login token for a mutation', async ({ page }) => {
  const fixture = await installLeagueFixture(page, 'member');
  await page.goto('/#/card');
  await expect(page.getByRole('button', { name: 'Account menu for Fixture Player' })).toBeVisible();
  fixture.authSession = session('user-b');
  Object.assign(fixture.account, { id: 'user-b', username: 'Second Player' });
  const result = await page.evaluate(async () => {
    const clientPath = '/src/auth/client.ts?secondary';
    const httpPath = '/src/api/http.ts';
    const other = (await import(clientPath)).supabase;
    const { request } = await import(httpPath);
    try {
      await other.auth.signInWithPassword({ email: 'second@example.test', password: 'synthetic' });
      try { await request('/api/teams', 'POST', { name: 'from old account' }); return 'unexpected-write'; }
      catch (error) { return (error as { code?: string }).code; }
    } finally { await other.auth.dispose(); }
  });
  expect(result).toBe('login_required');
  expect(fixture.requests.filter(request => request.operation === '/api/teams' && request.method === 'POST')).toHaveLength(0);
  await expect(page.getByRole('button', { name: 'Account menu for Second Player' })).toBeVisible();
});
