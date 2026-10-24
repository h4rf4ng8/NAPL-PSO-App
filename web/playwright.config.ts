import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test/browser',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 4,
  timeout: 30_000,
  outputDir: './test-results',
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://127.0.0.1:4174',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'chromium-mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
    { name: 'webkit-desktop', use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } } },
    { name: 'webkit-mobile', use: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } } },
    { name: 'chromium-narrow', testMatch: /(?:destinations|admin|navigation|states)\.spec\.ts/, use: { ...devices['Desktop Chrome'], viewport: { width: 320, height: 740 } } },
  ],
  webServer: {
    command: 'pnpm dev --port 4174',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_API_URL: 'http://127.0.0.1:4174',
      VITE_SUPABASE_URL: 'https://fixture.supabase.test',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'fixture-public-key',
    },
  },
});
