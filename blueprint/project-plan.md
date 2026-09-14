# Project Plan

Cyte Macro Data Console — a browsable console over the Core API `/api/macro` service.

## 1. Problem - What problem are we solving?

The Core API exposes a macroeconomic data service: annual IMF WEO and World Bank WDI
data for every country, served from Cyte's own store, with immutable vintages for
point-in-time reproducibility. Right now the only way to understand it is to read the
consumer guide and start writing curl commands against a token you first have to
provision.

That is a slow first hour for anyone integrating, and it hides the parts of the service
that actually matter. Three ideas in particular don't land from prose alone:

- **Vintages.** That pinning a vintage id reproduces a past reporting date exactly, and
  that querying `latest` across a vintage boundary is why a historical number changed
  between two pulls.
- **Absence, not nulls.** A valid country with no data for an indicator returns `200`
  with nothing in `data`. Consumers who design for nulls write code that breaks.
- **ETags.** Repeat queries should send `If-None-Match` and expect `304`. Almost nobody
  does this unless they've seen it work.

The console makes the service tangible: browse the catalogue, build a query, see the rows,
inspect what a new WEO release changed, and copy out the exact curl you'd run yourself.
It is a demonstration and onboarding surface, not a replacement for the API.

**Explicitly not solving:** this is not an analytics product, a charting tool, or a
BI dashboard. It is not a place anyone does real modelling work. If a feature only makes
sense for someone analysing the data rather than someone learning to consume it, it
doesn't belong here.

## 2. Users - Who is this for?

**Primary — prospective integration clients.** External M2M consumers evaluating whether
the service fits their needs, typically before they have credentials. They arrive from a
link, poke around for ten minutes, and leave either understanding the contract or not.
This is why v1 has no login.

**Secondary — internal Cyte and Bootsure developers.** People who will build against
`/api/macro` and want to check what a query returns before writing the client code.

**Later — authenticated users with roles.** Logins and roles are planned but deliberately
deferred. The design assumption is that an authenticated user gets saved queries tied to
their account, and an admin role eventually gets visibility into ingestion and vintage
publication. Nothing in v1 should make that harder to add, and nothing in v1 should guess
at what those roles are.

## 3. Features - What does the MVP need?

Seven tabs, matching the designs:

1. **Overview** — what the service is, the two sources and their cadence, latest vintage
   labels, and counts of countries, indicators and published vintages.
2. **Countries & indicators** — searchable country list showing which sources cover each,
   alongside the indicator catalogue with filters for category, source and curated-only.
3. **Series** — chart-ready view, one series per indicator and country, with the
   history/forecast boundary at `lastActualYear` shown clearly.
4. **Observations** — the working query builder (indicators, countries, year range, source,
   forecast filter, vintage) over a paginated flat table of rows.
5. **Vintages & revisions** — published vintages newest first; select one to see what it
   changed against its predecessor, including appeared and disappeared series.
6. **Saved queries & export** — name and store the working query with its vintage ids;
   reload or reproduce it; export the current result as CSV or JSON.
7. **Request builder** — the live URL and curl for the working query, a send button showing
   the real response envelope and headers, and the status code reference.

Cross-cutting:

- A single **working query** shared across the Observations, Series, Export and Request
  builder tabs. Clicking an indicator row on the catalogue tab adds it to that query.
- **Attribution footer** on every tab, rendering `meta.attribution` verbatim. WDI is
  CC BY 4.0 and attribution is required in anything user-facing.
- **Honest empty states.** No rows means "the query was valid, the source just doesn't
  report this combination", never a spinner that never resolves or an error.

**Out of scope for MVP:** logins, roles, user accounts, non-curated WEO factor browsing
(the `WEO_`-prefixed set is reachable by typing a code, but not merchandised), regional
aggregates, quarterly data, anything writing to the Core API, and the admin
`/api/admin/macro/*` surface.

## 4. Data - What are we storing?

**Nothing in a database for v1.** The console owns no macro data. Every number on screen
came from `/api/macro` on this request. There is no ingestion, no copy, no cache table.

**Browser localStorage:**

- **Saved queries** — name, the query object (indicators, countries, year range, source,
  forecast filter), the pinned vintage ids recorded at save time, and a saved timestamp.
  Per-browser is honest behaviour for an anonymous console, and it avoids designing a user
  model before there are users.

**Server-side, in memory only:**

- The Auth0 access token and its expiry, held in a module variable in the API process.
  Never persisted, never sent to the browser.

**When logins land**, Supabase Postgres picks up: users and roles (via Supabase Auth), and
saved queries keyed by user id, migrated from localStorage on first sign-in. The saved
query shape is designed now so that migration is a copy, not a redesign.

## 5. Tech - What stack are we using?

- **Angular 20 + Angular Material** for the UI, in `ui/`. The designs are dense tables,
  filter bars, chips and paginators, which is Material's strength, and it matches the
  house stack. Angular is already scaffolded with standalone components and signals;
  Material is not installed yet and goes in with feature 1.
- **Express 5 on Node 22 (TypeScript, ESM)** for a small backend-for-frontend, in `api/`.
  Not a general API. The scaffold already exists: `createApp()` builds the app, routes
  mount under `/api`, configuration is read only in `src/config.ts`, and one shared
  error handler owns the response shape. The API does so little that Express is enough,
  and there is no reason to swap frameworks to get it.
- **No database in v1.** Supabase Postgres and Supabase Auth are the chosen path for when
  logins and roles arrive, not before.
- **Render** for hosting, both services.
- **API contract types hand-written from the consumer guide for v1**, in one place, with
  generation from the Core API OpenAPI document (Scalar) as a later step once that
  document's URL and credentials are available. Either way the envelope, `meta.vintages`
  and the RFC 7807 error shape must match exactly, and vintage ids must flow untouched
  from response to saved query to export header. Because the types are hand-written for
  now, treat them as the thing most likely to drift and check them against a real
  response as soon as feature 8 wires live data.

Neither package is part of a root workspace, and there is no root `package.json`. npm
commands run inside `api/` or `ui/`. In development `ng serve` proxies `/api/*` to the
API via `ui/proxy.conf.json`, so the browser only ever talks to port 4200.

**What the API does, and only this:**

1. Holds the Auth0 M2M credentials and performs the client-credentials grant. The token is
   cached in memory with its expiry and reused. On expiry, or on a `401` from the Core API,
   it fetches a new one and retries once.
2. Forwards five read routes — `countries`, `indicators`, `observations`, `series`,
   `vintages` (including `/vintages/{id}/revisions`) — passing the query string through
   unchanged and returning the response body and `ETag` as-is.
3. Nothing else. No reshaping, no aggregation, no business logic. The console's models are
   the guide's models.

**Deliberate omissions:** no Redis (data changes at most daily and the API already carries
ETags), no server-side rendering, no charting library until the Series tab genuinely needs
one, and no ORM or migrations while there are no tables.

**Auth seam:** a single Express middleware goes in on day one, mounted ahead of the
`/api` router, and calls `next()` for everything. When Supabase Auth arrives, that one
middleware starts verifying the JWT, and per-route role checks compose on top of it. The
socket is in the wall; nothing is plugged into it yet.

**Known gap, accepted:** until logins exist, anyone with the API URL can use the M2M
credentials by proxy. Mitigation if it becomes a concern before auth lands is a single
shared header the console sends and the API checks, plus an origin allowlist. Both are
throwaway code.

## 6. Monetize - How will this make money?

Not directly. This is a pre-sales and onboarding asset for the Core API macro service, not
a product with its own revenue. Its value is measured in integration friction removed:
fewer support questions about vintages and empty results, and a shorter path from "we're
evaluating this" to a working M2M client.

If that reads as soft, the concrete version is that the guide's single most important
integration habit — recording `meta.vintages` ids alongside results so IFRS 9 output can be
reproduced — is the habit consumers most often skip. Every consumer who picks it up here
is a data-quality escalation that never happens.

## 7. UI/UX - How should this look and feel?

Cyte house style, as in the designs: deep navy header bar, green accents for primary
actions and links, white cards on a light grey background, generous table rows with clear
column headers. Restrained, closer to reference documentation than to a marketing site.

Principles:

- **The data is the interface.** No hero imagery, no illustration, no animation beyond
  state transitions. Tables and values dominate every screen.
- **Semantic colour, sparingly.** Green for actuals, amber for forecasts, amber for flagged
  significant revisions, red and green for negative and positive change values. Nothing
  else is coloured for decoration.
- **Units are never assumed.** Indicators mix percent, index values and US dollars. Unit is
  a visible column in the catalogue and shown alongside any series, because the guide is
  emphatic that consumers must read it.
- **Vintage state is always visible.** The header carries the latest vintage labels; the
  working query shows which vintage is in effect; exports write the vintage ids into the
  file header when pinning is enabled.
- **Be honest about being a console.** Where the design currently shows a "Token valid ·
  M2M client" pill, the console is showing the state of the server-side client, not the
  visitor's. Label it so it doesn't read as the visitor's own session.

The Request builder deserves specific care: the curl block should be exactly what a real
consumer would paste into their own terminal with their own token, and the send button
should surface the real `ETag`, `Cache-Control` and `X-Total-Count`, and a real `304` on a
repeat send. That tab is where the caching habit gets taught.

## 8. Deployment - Where and how will this ship?

Two Render services, one repo.

Because there is no root `package.json`, each Render service sets its own root
directory and runs its commands from there.

**Console (Angular)** — Render Static Site

- Root directory: `ui`
- Build command: `npm ci && npm run build`
- Publish directory: `dist/ui/browser` (relative to the `ui` root directory). `ui/angular.json`
  sets no explicit `outputPath`, so the builder defaults to the project name, `ui`.
- Rewrite rules, in order:
  1. `/api/*` → the API service, as a proxy. This is the production equivalent of
     `ui/proxy.conf.json` in development: the browser only ever talks to the console's
     own origin, so the console needs no API base URL and the app code keeps its
     relative `/api/macro`.
  2. `/*` → `/index.html` (200) for client-side routing
- Env vars: **none.** Decided on 2026-09-11, replacing an earlier `API_BASE_URL`
  build-time variable. Angular does not read process env at build time, so that
  approach needed a generated file and one build per environment; the rewrite needs
  neither, and it also means no cross-origin request is ever made from the browser.
  > **Unverified.** Render's rewrite-to-an-external-service behaviour has not been
  > confirmed against its documentation or a real service. `/release render` must
  > check it. If a static site cannot proxy to another service, the fallback is the
  > build-time generated file and `API_BASE_URL` returns.

**API (Express)** — Render Web Service

- Root directory: `api`
- Build command: `npm ci && npm run build`
- Start command: `node dist/index.js`
- Health check path: `/api/health` (all routes mount under `/api`; the scaffolded route
  already returns `{ status, uptime }`)
- Env vars (all secret, set in the Render dashboard, never in the repo or the Angular
  build): `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `AUTH0_AUDIENCE`,
  `CORE_API_BASE_URL`. Plus the existing non-secret `PORT`, `NODE_ENV` and `CORS_ORIGIN`.
- CORS uses the existing `CORS_ORIGIN` name already read in `api/src/config.ts`, not a new
  `ALLOWED_ORIGIN`. Every new setting is added to `src/config.ts` and `.env.example`.
- Region: closest available to the Core API host, to keep the proxy hop cheap

**No database, no workers, no cron jobs in v1.**

Notes:

- Render's free web service tier sleeps on inactivity, so the first request after a quiet
  period pays a cold start. For a demo people arrive at from a link, that's worth paying
  for with a starter instance rather than explaining.
- CORS on the API is locked to the console's origin via `CORS_ORIGIN`.
- Domain: a subdomain of the Cyte domain, to be confirmed.

**When logins land**, this grows by one Supabase project (Postgres plus Auth) and two env
vars on the API (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`). Still no workers, still no cron.