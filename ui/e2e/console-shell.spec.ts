import { expect, test } from '@playwright/test';

import { stubMacroApi } from './stub-api';

/**
 * The seven tabs are children of a pathless parent that supplies the chrome.
 * Deep-linking is what a mistake in that parent breaks first: the page can
 * still resolve while the topbar, tabs and footer never mount, or the URL
 * quietly gains a segment. Both are rendered facts, which is why this is here
 * rather than in a unit spec.
 */
test('renders the console chrome around a deep-linked tab', async ({ page }) => {
  await stubMacroApi(page);
  await page.goto('/vintages');

  await expect(page.locator('.topbar .wordmark')).toHaveText('CyteMacro Data');
  await expect(page.locator('.tabs a')).toHaveCount(7);
  await expect(page.locator('.attribution')).toBeVisible();

  // The URL is the one the tab owns, with nothing inherited from the parent.
  expect(new URL(page.url()).pathname).toBe('/vintages');

  // And the page itself rendered inside the shell's outlet, not beside it.
  await expect(page.locator('.app-main .vintages .card-head h2')).toHaveText(
    'Published vintages'
  );
});
