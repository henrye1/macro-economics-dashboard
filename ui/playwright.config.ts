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
    baseURL: 'http://localhost:4200',
    trace: 'on-first-retry'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm start',
    url: 'http://localhost:4200',
    // A dev server is often already up while working; reuse it rather than
    // failing on the port or starting a second one.
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000
  }
});
