import { expect, test } from '@playwright/test';

import { signIn, stubMacroApi } from './stub-api';

/**
 * The auth screens are a second top-level layout, and everything that can go
 * wrong with that is geometry or routing rather than logic: a panel that does
 * not split, a guard that does not fire, or a console footer that stopped
 * reaching the bottom of the window once a sibling layout existed.
 */

test('splits the auth layout into a navy panel and a form panel', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/sign-in');

  const pitch = await page.locator('.pitch').boundingBox();
  const panel = await page.locator('.panel').boundingBox();

  expect(pitch).not.toBeNull();
  expect(panel).not.toBeNull();

  // Side by side, not stacked, and the navy panel takes the larger share.
  expect(Math.round(pitch!.y)).toBe(Math.round(panel!.y));
  expect(Math.round(pitch!.x + pitch!.width)).toBe(Math.round(panel!.x));
  expect(pitch!.width).toBeGreaterThan(panel!.width);

  // Both reach the full height of the window, as the reference has them.
  expect(Math.round(pitch!.height)).toBeGreaterThanOrEqual(900);

  await expect(page.locator('.tabs')).toHaveCount(0);
});

test('stacks to one column on a narrow window', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 900 });
  await page.goto('/sign-in');

  const pitch = await page.locator('.pitch').boundingBox();
  const panel = await page.locator('.panel').boundingBox();

  expect(panel!.y).toBeGreaterThan(pitch!.y + pitch!.height - 1);
  await expect(page.locator('input[name="email"]')).toBeVisible();
});

test('sends a signed-out deep link to sign-in and back again', async ({ page }) => {
  await stubMacroApi(page);
  await page.goto('/vintages');

  await expect(page).toHaveURL(/\/sign-in\?returnUrl=%2Fvintages$/);

  await page.locator('input[name="email"]').fill('thandi.mokoena@cyte.co.za');
  await page.locator('input[name="password"]').fill('Correct-horse-1');
  await page.locator('.auth-submit').click();

  // Back to what was asked for, not to the default landing tab.
  await expect(page).toHaveURL(/\/vintages$/);
  await expect(page.locator('.tabs a')).toHaveCount(7);
});

/**
 * Finding F-78. The console's full-height rule lives on `app-console-shell` and
 * resolves against the body only while `app-root` stays out of the way. This
 * feature adds the first sibling layout, so it is the first change that could
 * break that chain, and nothing asserted the footer's position before now.
 */
test('keeps the console attribution footer at the bottom on a short page', async ({ page }) => {
  await stubMacroApi(page);
  await signIn(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/vintages');

  await expect(page.locator('.attribution')).toBeVisible();

  const footer = await page.locator('.attribution').boundingBox();
  const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);

  // The page is shorter than the window, so the footer's bottom edge should sit
  // at the bottom of it rather than partway up.
  expect(scrollHeight).toBeLessThanOrEqual(901);
  expect(Math.round(footer!.y + footer!.height)).toBeGreaterThanOrEqual(880);
});
