import type { Page, Route } from '@playwright/test';

import { FIXTURE_PASSWORD, FIXTURE_SESSION } from '../src/app/core/fixtures/fixture-auth.provider';

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

/**
 * The project the e2e build points at, per `environment.e2e.ts`. Nothing here
 * reaches the network: every `/auth/v1` call is answered below.
 */
const AUTH_HOST = 'https://stub.supabase.co';

/**
 * An access token shaped like the real thing.
 *
 * Unsigned and unverified, which is exactly what it needs to be: the Supabase
 * client reads the payload for an expiry and never checks a signature, and the
 * API that does check one is not in this suite. It expires far enough out that
 * the client never tries to refresh mid-test.
 */
function accessToken(): string {
  const payload = {
    sub: '00000000-0000-4000-8000-000000000001',
    email: FIXTURE_SESSION.email,
    aud: 'authenticated',
    role: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 3600,
    app_metadata: { role: FIXTURE_SESSION.role, organisation: FIXTURE_SESSION.organisation },
    user_metadata: { full_name: FIXTURE_SESSION.fullName }
  };

  const encode = (value: object): string =>
    Buffer.from(JSON.stringify(value)).toString('base64url');

  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.stub`;
}

/** The session body GoTrue answers a password grant with. */
function tokenResponse(): object {
  const token = accessToken();

  return {
    access_token: token,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'stub-refresh-token',
    user: {
      id: '00000000-0000-4000-8000-000000000001',
      aud: 'authenticated',
      email: FIXTURE_SESSION.email,
      // Where the console really reads the role and the organisation from. A
      // stub that put them in `user_metadata` would pass while the product
      // showed nothing.
      app_metadata: { role: FIXTURE_SESSION.role, organisation: FIXTURE_SESSION.organisation },
      user_metadata: { full_name: FIXTURE_SESSION.fullName },
      created_at: '2026-09-01T09:00:00.000Z'
    }
  };
}

/**
 * Answer every Supabase Auth call locally.
 *
 * Install it before the page loads. A password grant succeeds for the fixture
 * password and is refused for anything else, so the refusal path is reachable
 * in a browser too.
 */
export async function stubAuth(page: Page): Promise<void> {
  await page.route(`${AUTH_HOST}/auth/v1/**`, async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname.endsWith('/token')) {
      const body = route.request().postDataJSON() as { password?: string } | null;
      const refused = url.searchParams.get('grant_type') === 'password'
        && body?.password !== FIXTURE_PASSWORD;

      return refused
        ? route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({
              code: 400,
              error_code: 'invalid_credentials',
              msg: 'Invalid login credentials'
            })
          })
        : route.fulfill({
            status: 200,
            contentType: 'application/json',
            // Raw, not through `json()`: that wraps a payload in the macro
            // envelope, and GoTrue answers a bare session object.
            body: JSON.stringify(tokenResponse())
          });
    }

    if (url.pathname.endsWith('/logout') || url.pathname.endsWith('/recover')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }

    // Loud, like the macro stub: a call this suite does not know about is a
    // change in the console, not an empty result.
    return route.fulfill({
      status: 501,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Not stubbed', path: url.pathname })
    });
  });
}

/**
 * Sign in, through the form a visitor uses.
 *
 * Feature 19's version wrote a `localStorage` entry and skipped the screen,
 * because a session was a display shape the store read from storage. Feature 14
 * moved that truth into the Supabase client, which persists its own session
 * under its own key, so the honest way in is the real one. Every call is
 * stubbed, so this costs one navigation and no network.
 *
 * Call it before the spec's own `goto`: the session persists for the rest of
 * the page context, exactly as it does for a visitor.
 */
export async function signIn(page: Page): Promise<void> {
  await stubAuth(page);
  await page.goto('/sign-in');
  await page.locator('input[name="email"]').fill(FIXTURE_SESSION.email);
  await page.locator('input[name="password"]').fill(FIXTURE_PASSWORD);
  await page.locator('.auth-submit').click();

  // The console, not the form. Waiting here means a spec that follows fails on
  // its own assertion rather than on a half-finished sign-in.
  await page.waitForURL(/\/overview$/);
}

/** Build the minimum working query the Series tab needs to fetch. */
export async function seedQuery(page: Page): Promise<void> {
  await page.getByLabel('Add indicator').selectOption('GDP_GROWTH_REAL');
  await page.getByLabel('Add country').selectOption('ZAF');
}
