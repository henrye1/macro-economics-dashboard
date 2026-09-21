import { expect, test, type Page } from '@playwright/test';

import { seedQuery, stubMacroApi } from './stub-api';

/**
 * The chart's tooltip is placed in percentages of the SVG viewBox, which only
 * lands on the point if the box those percentages resolve against is the SVG's
 * own box. That was finding F-42: the percentages resolved against a padding
 * box while `preserveAspectRatio` centred the drawing, so the two agreed at one
 * width and drifted everywhere else. Unit tests cannot see it -- the geometry is
 * correct in both cases and only the rendered boxes disagree -- so it is checked
 * here, at several widths, against what the browser actually laid out.
 */

async function openSeries(page: Page): Promise<void> {
  await stubMacroApi(page);
  await page.goto('/series');
  await seedQuery(page);
  await expect(page.locator('app-series-chart svg')).toBeVisible();
}

test.describe('the series chart', () => {
  test('draws a chart with both countries and a forecast boundary', async ({ page }) => {
    await openSeries(page);

    const chart = page.locator('app-series-chart').first();

    // Named from the catalogue, not the ISO3 the series payload carries.
    await expect(chart.locator('.legend .entry .country')).toHaveText([
      'South Africa',
      'Nigeria'
    ]);
    // Two solid paths and two dashed, one pair per country.
    await expect(chart.locator('path[stroke-dasharray]')).toHaveCount(2);
    await expect(chart.locator('rect.forecast-band')).toBeVisible();
    // Counted, not checked for visibility: a vertical SVG line has no width, so
    // the browser reports it as having no box and Playwright reads that as hidden.
    await expect(chart.locator('line.boundary')).toHaveCount(1);
    await expect(chart.locator('circle.point')).toHaveCount(10);
  });

  // Below and above the 760px viewBox width. The bug was invisible at exactly
  // one width, so one viewport would not have caught it.
  for (const width of [1440, 1024, 700]) {
    test(`puts the tooltip on the point it describes at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await openSeries(page);

      const point = page.locator('app-series-chart circle.point').nth(4);
      await point.hover();

      const tip = page.locator('app-series-chart .tip');
      await expect(tip).toBeVisible();

      const pointBox = await point.boundingBox();
      const tipBox = await tip.boundingBox();

      expect(pointBox).not.toBeNull();
      expect(tipBox).not.toBeNull();

      const pointCentre = pointBox!.x + pointBox!.width / 2;
      const tipCentre = tipBox!.x + tipBox!.width / 2;

      // The tip is translated -50% horizontally, so its centre sits on the
      // point's. Two pixels covers sub-pixel layout, not a scaling error.
      expect(Math.abs(tipCentre - pointCentre)).toBeLessThan(2);
      // And it is lifted clear of the point rather than covering it.
      expect(tipBox!.y + tipBox!.height).toBeLessThan(pointBox!.y + pointBox!.height);
    });
  }

  test('states every plotted value in text, since the drawing is aria-hidden', async ({
    page
  }) => {
    await openSeries(page);

    const chart = page.locator('app-series-chart').first();

    await expect(chart.locator('svg')).toHaveAttribute('aria-hidden', 'true');

    const rows = chart.locator('.sr-only tbody tr');
    await expect(rows).toHaveCount(2);
    await expect(rows.first().locator('th')).toHaveText('ZAF');
    await expect(rows.first().locator('td')).toHaveCount(5);
    await expect(rows.first().locator('td').last()).toContainText('forecast');
  });
});
