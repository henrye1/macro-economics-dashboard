import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests for the console.
 *
 * The suite stubs `/api/macro/**` rather than running the Express relay. What it
 * is here to prove is that the console renders and behaves in a real browser --
 * geometry, layout and interaction -- and a test that reaches a live upstream
 * proves that far less repeatably. The API keeps its own Vitest suite.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  reporter: process.env['CI'] ? 'line' : [['list']],
  use: {
    baseURL: 'http://localhost:4201',
    trace: 'on-first-retry'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run start:e2e',
    url: 'http://localhost:4201',
    // Its own port and its own build configuration. A plain `npm start` serves
    // the developer's environment file, where the Supabase project is whatever
    // they put in it, and the suite must never sign in against that. Port 4201
    // lets both servers be up at once, and reuse still applies to this one.
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000
  }
});
