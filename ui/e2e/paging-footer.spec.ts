import { expect, test } from '@playwright/test';

import { seedQuery, stubMacroApi } from './stub-api';

/**
 * The paging footer puts its state text and its Prev/Next controls on one row,
 * with the controls pushed to the right by `margin-left: auto`. That only works
 * while `.card-foot` is a flex container, which makes it exactly the kind of
 * layout contract no unit test can hold: the markup is unchanged and correct
 * either way, and only the computed style says which it is.
 */
test('keeps the paging state and its controls on one row', async ({ page }) => {
  await stubMacroApi(page);
  await page.goto('/series');
  await seedQuery(page);

  const footer = page.locator('app-paging-footer .card-foot');
  await expect(footer).toBeVisible();

  const state = await footer.locator('.paging-state').boundingBox();
  const controls = await footer.locator('.paging-controls').boundingBox();

  expect(state).not.toBeNull();
  expect(controls).not.toBeNull();

  // Same row: their vertical extents overlap rather than stacking.
  expect(controls!.y).toBeLessThan(state!.y + state!.height);

  // And the controls sit at the right-hand end, not at the left margin.
  const footerBox = await footer.boundingBox();
  const controlsRight = controls!.x + controls!.width;
  expect(footerBox!.x + footerBox!.width - controlsRight).toBeLessThan(40);
});
