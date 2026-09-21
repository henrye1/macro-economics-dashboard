import type { Page, Route } from '@playwright/test';

/**
 * Canned `/api/macro` answers.
 *
 * The suite stubs the relay rather than running it. These tests are about what
 * the browser does with a payload -- geometry, layout, interaction -- and a live
 * upstream makes that neither repeatable nor offline-runnable. The shapes below
 * follow `ui/src/app/core/macro-contracts.ts`.
 */

const META = {
  page: 1,
  pageSize: 25,
  totalCount: 1,
  vintages: [{ id: 41, source: 'IMF_WEO', label: 'WEO 10.0.0' }],
  attribution: ['IMF World Economic Outlook']
};

const INDICATORS = [
  {
    code: 'GDP_GROWTH_REAL',
    name: 'Real GDP growth',
    unit: 'Percent',
    scale: null,
    category: 'Output',
    curated: true,
    sources: [{ source: 'IMF_WEO', vintage: 'WEO 10.0.0' }]
  }
];

const VINTAGES = [
  {
    id: 41,
    label: 'WEO 10.0.0',
    source: 'IMF_WEO',
    sourceVersion: '10.0.0',
    retrievedAtUtc: '2026-04-14T01:00:31.5083586',
    isLatest: true
  }
];

const COUNTRIES = [
  { iso3: 'ZAF', name: 'South Africa', sources: ['IMF_WEO'] },
  { iso3: 'NGA', name: 'Nigeria', sources: ['IMF_WEO'] }
];

/** Two actual years then two forecast years, so a boundary falls inside. */
function points(base: number) {
  return [
    { year: 2022, value: base + 1.2, isForecast: false },
    { year: 2023, value: base + 2.4, isForecast: false },
    { year: 2024, value: base + 0.8, isForecast: false },
    { year: 2025, value: base + 1.9, isForecast: true },
    { year: 2026, value: base + 2.6, isForecast: true }
  ];
}

const SERIES = ['ZAF', 'NGA'].map((country, index) => ({
  indicator: 'GDP_GROWTH_REAL',
  name: 'Real GDP growth',
  unit: 'Percent',
  scale: null,
  country,
  source: 'IMF_WEO',
  vintage: 'WEO 10.0.0',
  lastActualYear: 2024,
  points: points(index * 2)
}));

function json(route: Route, data: unknown, totalCount = 1): Promise<void> {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data, meta: { ...META, totalCount } })
  });
}

/**
 * Answer every macro route the console calls. Registered before navigation so
 * the first request a page makes is already covered.
 */
export async function stubMacroApi(page: Page): Promise<void> {
  await page.route('**/api/macro/**', (route) => {
    const path = new URL(route.request().url()).pathname;

    if (path.endsWith('/indicators')) {
      return json(route, INDICATORS);
    }

    if (path.endsWith('/countries')) {
      return json(route, COUNTRIES);
    }

    if (path.endsWith('/vintages')) {
      return json(route, VINTAGES);
    }

    if (path.endsWith('/series')) {
      return json(route, SERIES, 2);
    }

    // Anything the console adds later should fail loudly rather than silently
    // answering an empty page that looks like a real result.
    return route.fulfill({
      status: 501,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Not stubbed', path })
    });
  });
}

/** Build the minimum working query the Series tab needs to fetch. */
export async function seedQuery(page: Page): Promise<void> {
  await page.getByLabel('Add indicator').selectOption('GDP_GROWTH_REAL');
  await page.getByLabel('Add country').selectOption('ZAF');
}
