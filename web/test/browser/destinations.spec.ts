import { expect, test } from '@playwright/test';
import { installLeagueFixture } from './transport';
import { captureAndAudit } from './checks';

const memberDestinations = [
  ['/', /my profile/i], ['/card', /Fixture Player/i], ['/news', /news/i], ['/teams', /Fixture United/i],
  ['/schedule', /schedule/i], ['/standings', /standings/i], ['/leaderboard', /stats/i],
  ['/transfers', /transfer market/i], ['/hof', /hall of fame/i], ['/tiers', /tier preview/i],
  ['/rules', /rulebook/i], ['/vote', /vote/i], ['/matches', /match log/i], ['/articles/league-update', /league update/i],
] as const;

for (const theme of ['light', 'dark'] as const) {
  test(`member destinations are usable in ${theme} theme`, async ({ page }, info) => {
    test.setTimeout(180_000);
    const fixture = await installLeagueFixture(page, 'member');
    await page.addInitScript(mode => localStorage.setItem('asl_theme', mode), theme);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const [path, expected] of memberDestinations) {
      await test.step(path, async () => {
        await page.goto(`/#${path}`);
        await expect(page.getByRole('main').first()).toContainText(expected);
        await expect(page.getByRole('alert')).toHaveCount(0);
        await captureAndAudit(page, info, `member-${theme}-${path.replaceAll('/', '-') || 'home'}`);
      });
    }
    expect(fixture.unexpected).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('visitor navigation never requests private league operations', async ({ page }, info) => {
  test.setTimeout(90_000);
  const fixture = await installLeagueFixture(page);
  for (const [path, expected] of [
    ['/teams', /Fixture United/], ['/leaderboard', /stats/i], ['/schedule', /schedule/i],
    ['/news', /news/i], ['/transfers', /transfer market/i], ['/rules', /rulebook/i], ['/articles/league-update', /league update/i],
  ] as const) {
    await test.step(path, async () => {
      await page.goto(`/#${path}`);
      await expect(page.getByRole('main').first()).toContainText(expected);
      await expect(page.getByRole('alert')).toHaveCount(0);
      await captureAndAudit(page, info, `visitor-${path.replaceAll('/', '-')}`);
    });
  }
  expect(fixture.requests.filter(({ operation }) => ['LeagueOverview', 'TeamRecords', 'TeamStandings'].includes(operation))).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
});
