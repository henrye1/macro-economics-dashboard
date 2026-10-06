# Cyte Macro Data Console - Project Overview

<!-- blueprint:source-hash 460734d286553a6552111eb83f06713e6cccdad6d73fc579fc4ab5ab218e82d9 -->

> A browsable console over the Cyte Core API `/api/macro` service, built to make
> vintages, absent data and ETags tangible to anyone integrating.

## Problem

The Core API serves annual IMF WEO and World Bank WDI data for every country from
Cyte's own store, with immutable vintages for point-in-time reproducibility. Today
the only way in is the consumer guide and curl against a token you must first
provision. That is a slow first hour, and it hides the three ideas that matter
most: pinning a vintage id reproduces a past reporting date exactly; a valid
country with no data returns `200` with an empty `data`, not nulls; and repeat
queries should send `If-None-Match` and expect `304`.

The console makes the service tangible: browse the catalogue, build a query, see
the rows, inspect what a new WEO release changed, and copy the exact curl.

**Not solving:** analytics, charting for its own sake, or BI. A feature that only
serves someone analysing the data, rather than someone learning to consume it,
does not belong here.

## Users

| User | Access | Needs |
| --- | --- | --- |
| **Prospective integration clients** (primary) | Anonymous in the plan's v1 | Ten minutes of poking to understand the contract before they have credentials |
| **Internal Cyte and Bootsure developers** | Anonymous in the plan's v1 | Check what a query returns before writing client code |
| **Authenticated users with roles** (later) | Post-MVP | Saved queries tied to an account; an admin role eventually sees ingestion and vintage publication |

Nothing in v1 should make the authenticated path harder to add, and nothing in v1
should guess at what those roles are. See Open questions: the build plan has since
built sign-in (14, 18, 19), which the project plan still calls deferred.

## Features

Build-plan order. The **Request builder** (12) is the headline: it is where the
ETag and vintage-pinning habits actually get taught.

### MVP (all built)

1. **App shell** - seven-tab navigation, Angular Material, header vintage strip, attribution footer, hand-written contract types, and a typed data provider seam backed by fixtures.
2. **Overview page** - service summary, source cadence, and counts of countries, indicators and published vintages.
3. **Working query** - shared query state (indicators, countries, year range, source, forecast, vintage) persisted across tabs.
4. **Catalogue browsing** - searchable country list plus the indicator catalogue with category, source and curated filters; clicking an indicator row adds it to the working query.
5. **Observations table** - paginated flat rows with actual and forecast badges, and honest empty states.
6. **Series view** - grouped series per indicator and country with the `lastActualYear` boundary visible.
7. **Macro API service** - Express passthrough for the five read routes with server-side Auth0 token caching and retry.
8. **Live data wiring** - the real service in place of fixtures, with ETag passthrough and RFC 7807 errors.
9. **Vintages and revisions** - published vintage list and the change view against the preceding vintage.
10. **Saved queries** - name, store, reload and reproduce a query with its pinned vintage ids.
11. **Export** - CSV and JSON download of the current result, with optional vintage ids in the file header. XLSX dropped 2026-09-11: it needs a spreadsheet dependency, and the CSV's UTF-8 byte-order mark opens correctly in Excel.
12. **Request builder** - live URL and curl for the working query, the real response envelope and headers, and the status code reference.
13. **Deployment readiness** - both Render services, env vars, health check and CORS, and a verified production build (run via `/release render`).

### Post-MVP

14. **Authentication** (built) - Supabase Auth sign-in behind the auth middleware seam, replacing feature 19's fixture auth provider.
15. **Roles** (built) - role checks on the routes that need them.
16. **Saved query accounts** (built) - saved queries in Supabase, keyed by user, with a one-time migration from localStorage.
18. **App shell split** (built) - the shell moves into a console shell component beside an auth layout for full-bleed split-panel screens; the seven flat routes become parents with children so a route chooses its chrome. No visible change to the seven tabs.
19. **Auth screens** (built) - sign in, reset password, and accept invitation with its expired state, against a typed auth provider seam backed by fixtures, plus the guard that sends a visitor with no session to sign-in.
20. **Administration** - split into three, built in order:
    - 20a. **Admin page and user list** (built) - a topbar user menu, an admin-only `/administration` page, and the users in the administrator's own organisation; a Member sees a not-permitted card.
    - 20b. **Role assignment** (built) - Member or Administrator; never your own role, never leaving an organisation without an Administrator.
    - 20c. **Invitations** - issue, revoke and resend through Supabase's invite email, valid for 7 days, and a real accept-invitation screen.

**Out of scope for MVP:** logins, roles, user accounts, merchandised browsing of
non-curated `WEO_`-prefixed factors (reachable by typing a code), regional
aggregates, quarterly data, anything writing to the Core API, and the admin
`/api/admin/macro/*` surface.

## Data model

**No database in v1.** The console owns no macro data. Every number on screen came
from `/api/macro` on this request. No ingestion, no copy, no cache table.

### Upstream contract types (hand-written for v1, feature 1)

These mirror the Core API and must match it exactly. **Locked shapes** - features
5, 6, 8 to 12 depend on them. Hand-written from `CONSUMER-GUIDE.md`, with no
generation step planned, so they are the most drift-prone thing in the project.

`Envelope<T>`

- `data` (T[]) - the payload; an empty array is a valid `200`, never an error
- `meta.page` and `meta.pageSize` (number **or null**, 1-based; default 500, max 5000) - null on the routes that do not paginate, observed at feature 8 on `/countries` and `/vintages`
- `meta.totalCount` (number) - always present, which is why counts read it and never `page`
- `meta.vintages` (vintage refs) - `{ id, source, label }`, the values recorded for reproducibility
- `meta.attribution` (string[]) - rendered verbatim in the footer

`Country` - `iso3` (ISO 3166-1 alpha-3, primary key), `name` (from the geo service), `sources` (SourceCode[]).

`Indicator`

- `code` (string) - canonical code such as `GDP_GROWTH_REAL`, never a raw source code
- `name`, `unit` (string), `scale` (string or null), `category` (string), `curated` (boolean)
- `sources` - `{ source: SourceCode, sourceCode: string, preferred: boolean }[]`

`Observation` - `indicator` (refs Indicator.code), `country` (refs Country.iso3), `year` (number), `value` (number), `isForecast` (boolean), `source` (SourceCode), `vintageId` (number).

`Series`

- `indicator`, `name`, `unit`, `scale` (string or null), `country`, `source`, `vintage` (label)
- `lastActualYear` (number) - the history and forecast boundary
- `points` - `{ year: number, value: number, isForecast: boolean }[]`

`Vintage` - `id` (number), `label`, `sourceVersion`, `retrievedAtUtc` (ISO string), `isLatest` (boolean).

`Revision` (from `/vintages/{id}/revisions`)

- previous versus new value per (indicator, country, year), plus appeared and disappeared series
- **no significance flag on the wire.** Feature 8 sampled 500 live rows and none carried one, so the console derives it (above 10 percent relative or 0.5 absolute) and says so on screen

`SourceCode` is `'IMF_WEO' | 'WB_WDI'`. The query `source` param also accepts
`'preferred'`, the default, where WEO wins wherever it exists because it extends
into forecast years. `ProblemDetails` is RFC 7807 `application/problem+json`;
read `detail` for the human explanation.

### WorkingQuery (client state, feature 3)

- `indicators` (string[]) - required and non-empty before a query runs
- `countries` (string[]) - empty means all countries
- `yearFrom` and `yearTo` (number or null) - inclusive, unbounded when null
- `source` (SourceCode or `'preferred'`) - default `preferred`
- `forecast` (`'all' | 'actual' | 'forecast'`) - default `all`
- `vintage` (`'latest'`, a vintage id, or a vintage label) - default `latest`; pinning a vintage implies its source
- `page` and `pageSize` (number) - 1 and 500

### SavedQuery (feature 10; in Supabase from feature 16)

**Locked shape** - feature 16 moved it to Supabase as a copy, not a redesign.

- `name` (string) - user-supplied
- `query` (WorkingQuery) - indicators, countries, year range, source, forecast filter
- `vintageIds` (number[]) - the `meta.vintages` ids recorded at save time, so reproduction is exact
- `savedAt` (ISO string)

Feature 10 kept it in browser localStorage. Since feature 16 it is the
`saved_queries` table, keyed by `(user_id, name)`, and localStorage entries
move to the account on a signed-in visit.

### Server-side, in memory only

The Auth0 access token and its expiry, held in a module variable in the API
process. Never persisted, never sent to the browser.

Users and roles live in Supabase Auth: `role` and `organisation` in
`app_metadata`, which only an administrator can set.

## Tech stack

- **Angular 20 with Angular Material** (`ui/`) - dense tables, filter bars, chips and paginators are Material's strength; standalone components and signals.
- **Express 5 on Node 22, TypeScript ESM** (`api/`) - a small backend-for-frontend, not a general API. `createApp()` builds the app, routes mount under `/api`, config is read only in `src/config.ts`, and one shared error handler owns the response shape.
- **No database in v1** - Supabase Postgres and Supabase Auth are the path for logins, not before.
- **Render** - hosting, both services.
- **Hand-written API contract types.** The project plan still names OpenAPI generation as a later step; the build plan dropped it (see Open questions).

No root workspace and no root `package.json`; npm commands run inside `api/` or
`ui/`. In development `ng serve` proxies `/api/*` to the API via
`ui/proxy.conf.json`, so the browser only ever talks to port 4200.

### What the API does, and only this

1. Holds the Auth0 M2M credentials and performs the client-credentials grant. The token is cached in memory with its expiry and reused. On expiry, or on a `401` from the Core API, it fetches a new one and retries once.
2. Forwards five read routes - `countries`, `indicators`, `observations`, `series`, `vintages` (including `/vintages/{id}/revisions`) - passing the query string through unchanged and returning the body and `ETag` as-is.
3. Nothing else. No reshaping, no aggregation, no business logic. The console's models are the guide's models.

**Deliberate omissions:** no Redis (data changes at most daily and the API already
carries ETags), no server-side rendering, no charting library until the Series tab
genuinely needs one, and no ORM or migrations while there are no tables.

**Auth seam:** one Express middleware mounted ahead of the `/api` router. In the
plan it calls `next()` for everything until Supabase Auth arrives, then verifies
the JWT, with per-route role checks composing on top.

**Known gap, accepted (plan):** until logins exist, anyone with the API URL can use
the M2M credentials by proxy. The interim mitigation, if needed, is a shared header
plus an origin allowlist, both throwaway.

## Monetization

Not directly. A pre-sales and onboarding asset for the Core API macro service,
measured in integration friction removed: fewer support questions about vintages
and empty results, and a shorter path to a working M2M client.

## UI/UX

Cyte house style: deep navy header bar, green accents for primary actions and
links, white cards on a light grey background, generous table rows with clear
column headers. Restrained, closer to reference documentation than a marketing
site.

- **The data is the interface.** No hero imagery, illustration, or animation beyond state transitions.
- **Semantic colour, sparingly.** Green for actuals, amber for forecasts and flagged significant revisions, red and green for negative and positive change values. Nothing else is coloured for decoration.
- **Units are never assumed.** Indicators mix percent, index values and US dollars. Unit is a visible catalogue column and shown alongside any series.
- **Vintage state is always visible.** The header carries the latest vintage labels, the working query shows which vintage is in effect, and exports write the vintage ids into the file header when pinning is enabled.
- **Honest empty states.** No rows means the query was valid and the source does not report this combination, never an endless spinner or an error.
- **Be honest about being a console.** The "Token valid, M2M client" pill shows the server-side client's state, not the visitor's, and is labelled so.

Design references live in `blueprint/references/`, one PNG per screen, numbered in
display order. Read the matching image when speccing or implementing a screen.

Seven tabs, in display order (which differs from build order, intentionally):

- `/overview` (`1-overview.png`) - what the service is, sources and cadence, latest vintage labels, counts (feature 2)
- `/countries-indicators` (`2-countries-and-indicators.png`) - country list with source coverage, plus the indicator catalogue with category, source and curated-only filters (feature 4)
- `/series` (`3-series.png`) - one series per indicator and country, with the `lastActualYear` boundary (feature 6)
- `/observations` (`4-observations.png`) - the working query builder over a paginated flat table (features 3 and 5)
- `/vintages` (`5-vintages-and-revisions.png`) - vintages newest first; select one to see what it changed, including appeared and disappeared series (feature 9)
- `/saved-queries` (`6-saved-queries-and-export.png`) - store the working query with its vintage ids, reload or reproduce it, export CSV or JSON (features 10 and 11)
- `/request-builder` (`7-request-builder.png`) - live URL and curl, a send button showing the real envelope and headers, and the status code reference (feature 12)

Auth screens (features 18 and 19) render in the auth layout, outside the tab chrome:
sign in (`8-sign-in.png`), reset password (`9-reset-password.png`), and accept
invitation (`10-accept-invitation.png`) with its expired state
(`11-expired-invitation.png`).

The Request builder deserves specific care: the curl block is exactly what a real
consumer would paste with their own token, and the send button surfaces the real
`ETag`, `Cache-Control` and `X-Total-Count`, and a real `304` on a repeat send.

## Deployment

Two Render services, one repo. With no root `package.json`, each service sets its
own root directory and runs its commands from there.

**Console (Angular)** - Render Static Site

| Setting | Value |
| --- | --- |
| Root directory | `ui` |
| Build command | `npm ci && npm run build` |
| Publish directory | `dist/ui/browser`, relative to `ui`; `angular.json` sets no `outputPath`, so the builder defaults to the project name |
| Rewrites, in order | 1. `/api/*` to the API service, as a proxy: the production twin of `proxy.conf.json`, so the console keeps its relative `/api/macro` and never makes a cross-origin request. 2. `/*` to `/index.html` (200) for client-side routing |
| Env vars | **None.** Decided 2026-09-11, replacing an earlier `API_BASE_URL` build-time variable, which needed a generated file and one build per environment |

**API (Express)** - Render Web Service

| Setting | Value |
| --- | --- |
| Root directory | `api` |
| Build command | `npm ci && npm run build` |
| Start command | `node dist/index.js` |
| Health check path | `/api/health`; all routes mount under `/api`, and it returns `{ status, uptime }` |
| Env vars (secret, Render dashboard only) | `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `AUTH0_AUDIENCE`, `CORE_API_BASE_URL` |
| Env vars (non-secret) | `PORT`, `NODE_ENV`, `CORS_ORIGIN` |
| Region | Closest available to the Core API host |

Secrets never go in the repo or the Angular build. CORS uses the existing
`CORS_ORIGIN` name in `api/src/config.ts`, locked to the console's origin. Every
new setting is added to `src/config.ts` and `.env.example`.

**No database, no workers, no cron jobs in v1.** Render's free web tier sleeps
when idle, so a starter instance is worth paying for. Domain: a Cyte subdomain,
to be confirmed. When logins land this grows by one Supabase project and two API
env vars, `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`.

## Constraints from the consumer guide

Contract facts, not preferences. Getting them wrong teaches the wrong habit.

- **Annual data only.** One value per indicator, country and calendar year.
- **Design for absence, not nulls.** Missing series do not appear. An unknown indicator or ISO3 code is a `400` naming it; a valid code with no data is a `200` with empty `data`.
- **Published data is immutable.** New releases create a new vintage; old vintages stay queryable forever.
- **Attribution is required.** WDI is CC BY 4.0. Render `meta.attribution` verbatim wherever numbers are shown.
- **ETags.** Responses carry an `ETag` derived from the underlying vintages, plus `Cache-Control: private, max-age=3600`. The API passes both through untouched.
- **Pagination.** `page` is 1-based, `pageSize` defaults to 500, max 5000. `/series` paginates series, not rows.
- **Data range.** History from 2010, configurable server-side, through the WEO forecast horizon of about the current year plus five.
- **Status codes to handle.** `400`, `401`, `404`, `304`, `5xx`, and `200` with empty `data` as a success.

## Open questions

> **The project plan predates the auth work.** Sections 2, 3, 4 and 5 still say v1
> has no login, list logins as out of scope, describe the seam as calling `next()`
> for everything, and accept the M2M-by-proxy gap. The build plan has since built
> features 18, 19 and 14, and none of 18, 19 or 20 appears in the project plan's
> feature list. Update the project plan to say what sign-in now means for the
> anonymous primary user.

> **CORS described as the lock (plan section 8 notes).** With the `/api/*` rewrite
> no browser request is cross-origin, so `CORS_ORIGIN` is a backstop, not the
> thing keeping other origins out (ledger F-41).

> **Rewrite still marked unverified in the plan.** Observed live on 2026-10-05:
> the `/api/*` rewrite forwards `Authorization: Bearer`, ETag/`304` work, and
> sign-out returns `401`. The `API_BASE_URL` fallback is not needed; the plan's
> note should say so.

> **Stale stack notes (plan section 5).** "Material is not installed yet" is no
> longer true, and the deployment now pins Node 24, not the Node 22 the plan names.

> **Core API host and Auth0 tenant are unnamed in the plans.** They appear as env
> var names only. Real values live in a git-ignored `api/.env`; nothing generated
> from the plans may name the host, so the request builder renders
> `https://<core-api-host>`, as `CONSUMER-GUIDE.md` does.

> **Generated API types dropped from the build plan (2026-10-06).** Project plan
> section 5 still describes OpenAPI (Scalar) generation as a later step. Remove it
> there, or restore the build-plan item.

> **No `Verify` command.** `AGENTS.md` declares `Test` for both packages and a
> browser suite exists, but there is still no single `Verify` command (`/ci`).
