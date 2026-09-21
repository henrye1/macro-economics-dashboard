# Cyte Macro Data Console - Project Overview

<!-- blueprint:source-hash bac78a0b99a85f333b06f75e54396aa56dee6c8e0ba7e1f3cb946bcc503be557 -->

> A browsable console over the Cyte Core API `/api/macro` service, built to make
> vintages, absent data and ETags tangible to anyone integrating.

## Problem

The Core API serves annual IMF WEO and World Bank WDI data for every country from
Cyte's own store, with immutable vintages for point-in-time reproducibility. Today
the only way to understand it is to read the consumer guide and write curl against
a token you must first provision. That is a slow first hour, and it hides the three
ideas that matter most: that pinning a vintage id reproduces a past reporting date
exactly, that a valid country with no data returns `200` with an empty `data`
rather than nulls, and that repeat queries should send `If-None-Match` and expect
`304`.

The console makes the service tangible: browse the catalogue, build a query, see
the rows, inspect what a new WEO release changed, and copy the exact curl.

**Not solving:** analytics, charting for its own sake, or BI. If a feature only
serves someone analysing the data rather than someone learning to consume it, it
does not belong here.

## Users

| User | Access | Needs |
| --- | --- | --- |
| **Prospective integration clients** (primary) | Anonymous, no login in v1 | Ten minutes of poking to understand the contract before they have credentials |
| **Internal Cyte and Bootsure developers** | Anonymous | Check what a query returns before writing client code |
| **Authenticated users with roles** (later) | Deferred to Post-MVP | Saved queries tied to an account; an admin role eventually sees ingestion and vintage publication |

Nothing in v1 should make the authenticated path harder to add, and nothing in v1
should guess at what those roles are.

## Features

Build-plan order. The **Request builder** (12) is the headline: it is where the
ETag and vintage-pinning habits actually get taught.

### MVP

1. **App shell** - seven-tab navigation, Angular Material setup, header vintage strip, attribution footer, hand-written API contract types, and a typed data provider seam backed by fixtures.
2. **Overview page** - service summary, source cadence, and counts of countries, indicators and published vintages.
3. **Working query** - shared query state (indicators, countries, year range, source, forecast, vintage) persisted across tabs.
4. **Catalogue browsing** - searchable country list plus the indicator catalogue with category, source and curated filters; clicking an indicator row adds it to the working query.
5. **Observations table** - paginated flat rows with actual and forecast badges, and honest empty states.
6. **Series view** - grouped series per indicator and country with the `lastActualYear` boundary made visible.
7. **Macro API service** - Express passthrough for the five read routes with server-side Auth0 token caching and retry.
8. **Live data wiring** - swap the fixture provider for the real service, including ETag passthrough and RFC 7807 error handling.
9. **Vintages and revisions** - published vintage list and the change view against the preceding vintage.
10. **Saved queries** - name, store, reload and reproduce a query with its pinned vintage ids.
11. **Export** - CSV and JSON download of the current result, with optional vintage ids in the file header. XLSX was dropped on 2026-09-11: it needs a spreadsheet dependency, and the CSV's UTF-8 byte-order mark makes it open correctly in Excel.
12. **Request builder** - live URL and curl for the working query, the real response envelope and headers, and the status code reference.
13. **Deployment readiness** - configure both Render services, env vars, health check and CORS, and verify the production build (run via `/release render`).

### Post-MVP

14. **Authentication** - Supabase Auth sign-in behind the existing auth middleware seam.
15. **Roles** - role checks on the routes that need them.
16. **Saved query accounts** - move saved queries to Supabase, keyed by user, with a one-time migration from localStorage.
17. **Generated API types** - replace the hand-written contract types with types generated from the Core API OpenAPI document.

**Out of scope for MVP:** logins, roles, user accounts, merchandised browsing of
non-curated `WEO_`-prefixed factors (reachable by typing a code, but not
surfaced), regional aggregates, quarterly data, anything writing to the Core API,
and the admin `/api/admin/macro/*` surface.

## Data model

**No database in v1.** The console owns no macro data. Every number on screen came
from `/api/macro` on this request. No ingestion, no copy, no cache table.

### Upstream contract types (hand-written for v1, feature 1)

These mirror the Core API and must match it exactly. **Locked shapes** - features
5, 6, 8, 9, 10, 11 and 12 all depend on them. Types are hand-written from
`CONSUMER-GUIDE.md` until feature 17 generates them, so they are the most
drift-prone thing in the project; check them against a real response at feature 8.

`Envelope<T>`

- `data` (T[]) - the payload; an empty array is a valid `200`, never an error
- `meta.page` and `meta.pageSize` (number **or null**, 1-based; default 500, max 5000) - null on the routes that do not paginate, observed at feature 8 on `/countries` and `/vintages`
- `meta.totalCount` (number) - always present, which is why counts read it and never `page`
- `meta.vintages` (vintage refs) - `{ id, source, label }`, the values recorded for reproducibility
- `meta.attribution` (string[]) - rendered verbatim in the footer

`Country`

- `iso3` (string, ISO 3166-1 alpha-3) - primary identifier
- `name` (string) - resolved from the geo service
- `sources` (SourceCode[]) - which sources cover this country

`Indicator`

- `code` (string) - canonical code such as `GDP_GROWTH_REAL`, never a raw source code
- `name` (string), `unit` (string), `scale` (string or null)
- `category` (string), `curated` (boolean)
- `sources` - `{ source: SourceCode, sourceCode: string, preferred: boolean }[]`

`Observation`

- `indicator` (string, refs Indicator.code), `country` (string, refs Country.iso3), `year` (number)
- `value` (number), `isForecast` (boolean), `source` (SourceCode), `vintageId` (number)

`Series`

- `indicator`, `name`, `unit`, `scale` (string or null), `country`, `source`, `vintage` (label string)
- `lastActualYear` (number) - the history and forecast boundary
- `points` - `{ year: number, value: number, isForecast: boolean }[]`

`Vintage`

- `id` (number), `label` (string), `sourceVersion` (string), `retrievedAtUtc` (ISO string), `isLatest` (boolean)

`Revision` (from `/vintages/{id}/revisions`)

- previous versus new value per (indicator, country, year), plus appeared and disappeared series
- **no significance flag on the wire.** Feature 8 sampled 500 live rows and none carried one, so the console derives it: above 10 percent relative or 0.5 absolute, and says so on screen because the threshold is its own choice

`SourceCode` is `'IMF_WEO' | 'WB_WDI'`. The query `source` param also accepts
`'preferred'`, the default, where WEO wins wherever it exists because it extends
into forecast years.

`ProblemDetails` - RFC 7807 `application/problem+json`; read `detail` for the
human explanation.

### WorkingQuery (client state, feature 3)

- `indicators` (string[]) - required and non-empty before a query runs
- `countries` (string[]) - empty means all countries
- `yearFrom` and `yearTo` (number or null) - inclusive, unbounded when null
- `source` (SourceCode or `'preferred'`) - default `preferred`
- `forecast` (`'all' | 'actual' | 'forecast'`) - default `all`
- `vintage` (`'latest'`, a vintage id, or a vintage label) - default `latest`; pinning a vintage implies its source
- `page` and `pageSize` (number) - 1 and 500

### SavedQuery (browser localStorage, feature 10)

**Locked shape** - feature 16 migrates this to Supabase as a copy, not a redesign.

- `name` (string) - user-supplied
- `query` (WorkingQuery) - indicators, countries, year range, source, forecast filter
- `vintageIds` (number[]) - the `meta.vintages` ids recorded at save time, so reproduction is exact
- `savedAt` (ISO string)

Per-browser storage is honest behaviour for an anonymous console and avoids
designing a user model before there are users.

### Server-side, in memory only

- The Auth0 access token and its expiry, held in a module variable in the API
  process. Never persisted, never sent to the browser.

### When logins land (Post-MVP)

Supabase Postgres picks up users and roles (via Supabase Auth) and saved queries
keyed by user id, migrated from localStorage on first sign-in.

## Tech stack

- **Angular 20 with Angular Material** (`ui/`) - dense tables, filter bars, chips and paginators are Material's strength. Already scaffolded with standalone components and signals; Material is not installed yet and goes in with feature 1.
- **Express 5 on Node 22, TypeScript ESM** (`api/`) - a small backend-for-frontend, not a general API. The scaffold exists: `createApp()` builds the app, routes mount under `/api`, config is read only in `src/config.ts`, and one shared error handler owns the response shape.
- **No database in v1** - Supabase Postgres and Supabase Auth are the chosen path for when logins arrive, not before.
- **Render** - hosting, both services.
- **Hand-written API contract types** for v1, generated from the Core API OpenAPI document (Scalar) later.

No root workspace and no root `package.json`; npm commands run inside `api/` or
`ui/`. In development `ng serve` proxies `/api/*` to the API via
`ui/proxy.conf.json`, so the browser only ever talks to port 4200.

### What the API does, and only this

1. Holds the Auth0 M2M credentials and performs the client-credentials grant. The token is cached in memory with its expiry and reused. On expiry, or on a `401` from the Core API, it fetches a new one and retries once.
2. Forwards five read routes - `countries`, `indicators`, `observations`, `series`, `vintages` (including `/vintages/{id}/revisions`) - passing the query string through unchanged and returning the response body and `ETag` as-is.
3. Nothing else. No reshaping, no aggregation, no business logic. The console's models are the guide's models.

**Deliberate omissions:** no Redis (data changes at most daily and the API already
carries ETags), no server-side rendering, no charting library until the Series tab
genuinely needs one, and no ORM or migrations while there are no tables.

**Auth seam:** one Express middleware goes in on day one, mounted ahead of the
`/api` router, calling `next()` for everything. When Supabase Auth arrives that
middleware starts verifying the JWT, and per-route role checks compose on top.

**Known gap, accepted:** until logins exist, anyone with the API URL can use the
M2M credentials by proxy. The mitigation if it becomes a concern first is a single
shared header the console sends and the API checks, plus an origin allowlist. Both
are throwaway code.

## Monetization

Not directly. This is a pre-sales and onboarding asset for the Core API macro
service, measured in integration friction removed: fewer support questions about
vintages and empty results, and a shorter path from evaluating to a working M2M
client. The concrete version is that recording `meta.vintages` ids alongside
results is the habit consumers most often skip, and every consumer who picks it up
here is a data-quality escalation that never happens.

## UI/UX

Cyte house style: deep navy header bar, green accents for primary actions and
links, white cards on a light grey background, generous table rows with clear
column headers. Restrained, closer to reference documentation than a marketing
site.

Principles:

- **The data is the interface.** No hero imagery, illustration, or animation beyond state transitions. Tables and values dominate every screen.
- **Semantic colour, sparingly.** Green for actuals, amber for forecasts, amber for flagged significant revisions, red and green for negative and positive change values. Nothing else is coloured for decoration.
- **Units are never assumed.** Indicators mix percent, index values and US dollars. Unit is a visible column in the catalogue and is shown alongside any series.
- **Vintage state is always visible.** The header carries the latest vintage labels, the working query shows which vintage is in effect, and exports write the vintage ids into the file header when pinning is enabled.
- **Honest empty states.** No rows means the query was valid and the source just does not report this combination, never an endless spinner or an error.
- **Be honest about being a console.** The "Token valid, M2M client" pill shows the state of the server-side client, not the visitor's. Label it so it does not read as the visitor's own session.

Design references live in `blueprint/references/`, one PNG per tab, numbered in
display order. Read the matching image when speccing or implementing a tab.

Seven tabs, in the design's display order:

- `/overview` (`references/1-overview.png`) - what the service is, the two sources and their cadence, latest vintage labels, counts (feature 2)
- `/countries-indicators` (`references/2-countries-and-indicators.png`) - searchable country list with source coverage, plus the indicator catalogue with category, source and curated-only filters (feature 4)
- `/series` (`references/3-series.png`) - one series per indicator and country, history and forecast boundary at `lastActualYear` shown clearly (feature 6)
- `/observations` (`references/4-observations.png`) - the working query builder over a paginated flat table (features 3 and 5)
- `/vintages` (`references/5-vintages-and-revisions.png`) - published vintages newest first; select one to see what it changed against its predecessor, including appeared and disappeared series (feature 9)
- `/saved-queries` (`references/6-saved-queries-and-export.png`) - name and store the working query with its vintage ids, reload or reproduce it, export as CSV or JSON (features 10 and 11)
- `/request-builder` (`references/7-request-builder.png`) - live URL and curl for the working query, a send button showing the real response envelope and headers, and the status code reference (feature 12)

Tab display order differs from build order; both are intentional.

The Request builder deserves specific care: the curl block should be exactly what
a real consumer would paste into their own terminal with their own token, and the
send button should surface the real `ETag`, `Cache-Control` and `X-Total-Count`,
and a real `304` on a repeat send.

## Deployment

Two Render services, one repo. Because there is no root `package.json`, each
service sets its own root directory and runs its commands from there.

**Console (Angular)** - Render Static Site

| Setting | Value |
| --- | --- |
| Root directory | `ui` |
| Build command | `npm ci && npm run build` |
| Publish directory | `dist/ui/browser`, relative to the `ui` root; `angular.json` sets no `outputPath`, so the builder defaults to the project name |
| Rewrite rule | `/*` to `/index.html` (200) for client-side routing |
| Env vars (build time, non-secret) | `API_BASE_URL` |

> TODO: Angular does not read process env at build time by itself. Feature 13 must
> choose the mechanism, most likely a build-time file replacement or a small
> generated config file.

**API (Express)** - Render Web Service

| Setting | Value |
| --- | --- |
| Root directory | `api` |
| Build command | `npm ci && npm run build` |
| Start command | `node dist/index.js` |
| Health check path | `/api/health`; all routes mount under `/api`, and the scaffolded route returns `{ status, uptime }` |
| Env vars (secret) | `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `AUTH0_AUDIENCE`, `CORE_API_BASE_URL` |
| Env vars (non-secret, existing) | `PORT`, `NODE_ENV`, `CORS_ORIGIN` |
| Region | Closest available to the Core API host, to keep the proxy hop cheap |

Secrets are set in the Render dashboard, never in the repo or the Angular build.
CORS is locked to the console's origin via the existing `CORS_ORIGIN` name already
read in `api/src/config.ts`. Every new setting is added to `src/config.ts` and
`.env.example`.

**No database, no workers, no cron jobs in v1.**

Notes:

- Render's free web service tier sleeps on inactivity, so the first request after a quiet period pays a cold start. For a demo people arrive at from a link, a starter instance is worth paying for rather than explaining.
- Domain: a subdomain of the Cyte domain, to be confirmed.
- When logins land this grows by one Supabase project (Postgres plus Auth) and two API env vars, `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`. Still no workers, still no cron.

## Constraints from the consumer guide

These are contract facts, not preferences. Getting them wrong makes the console
teach the wrong habit.

- **Annual data only.** One value per indicator, per country, per calendar year. No quarterly or monthly in v1.
- **Design for absence, not nulls.** Missing series simply do not appear. An unknown indicator or ISO3 code is a `400` naming the offending code; a valid code with no data is a `200` with empty `data`.
- **Published data is immutable.** New upstream releases create a new vintage; old vintages stay queryable forever.
- **Attribution is required.** WDI is CC BY 4.0. Render `meta.attribution` verbatim wherever numbers are shown.
- **ETags.** Responses carry an `ETag` derived from the underlying vintages, plus `Cache-Control: private, max-age=3600`. The API passes both through untouched.
- **Pagination.** `page` is 1-based, `pageSize` defaults to 500 with a max of 5000. `/series` paginates series, not rows.
- **Data range.** History from 2010, configurable server-side, forward through the WEO forecast horizon of roughly the current year plus five.
- **Status codes to handle.** `400`, `401`, `404`, `304`, `5xx`, and `200` with empty `data` as a success.

## Open questions

> **Core API host and Auth0 tenant are unnamed in the plans.** `CORE_API_BASE_URL`,
> the Auth0 domain and the audience appear as env var names only. Real values exist
> locally in a git-ignored `api/.env` and features 7 and 8 used them, but nothing
> generated from the plans may name the host: the request builder therefore renders
> `https://<core-api-host>`, exactly as `CONSUMER-GUIDE.md` does.

> **OpenAPI document URL is unknown.** Feature 17 is blocked until the Scalar
> document's URL and credentials exist. Until then contract types are hand-written
> and unverified against the real service.

> **Angular build-time config mechanism undecided.** See the Deployment TODO on
> `API_BASE_URL`.

> **No `Verify` command and no browser harness.** `AGENTS.md` now declares a `Test`
> command for both packages, so the unit gate is on. What is still missing is a
> single `Verify` command (`/ci`) and any browser coverage (`/browser-tests`).
> Every double in the suite resolves synchronously, so the window between a request
> and its answer is zero-width, and file-level behaviour - what a browser writes and
> a spreadsheet opens - cannot be checked here at all.
