# Feature: Deployment readiness

**From build-plan:** feature 13

> **Generated file.** Holds the one feature, fix, or rollback being built right now.

**Type:** Feature
**Status:** verified
**Branch:** feature/deployment-readiness
**Fixes:** F-40, F-92

## Goal

Make both services deployable to Render from this repository with nothing left
to decide at the dashboard: a `render.yaml` Blueprint describing the console
static site and the API web service, a production console build that can reach
Supabase, and local evidence that each production build starts and answers the
way Render will check it. The deploy itself is an external action and happens
only on the user's explicit yes, through `/release render`.

The plan settled the console's route to the API on 2026-09-11: an `/api/*`
rewrite on the static site proxies to the API service, the production twin of
`ui/proxy.conf.json`. The browser only ever talks to the console's own origin, the
app keeps its relative `/api/macro`, and the console needs no `API_BASE_URL`. The
plan marks that rewrite **unverified** and names the fallback; this feature is
where it gets verified.

## In scope

- **`render.yaml` at the repository root** (Render Blueprint), two services:
  - **Console**, static site: root `ui`, build `npm ci && npm run build`, publish
    `dist/ui/browser`. Routes in this order: `/api/*` rewrite to the API service's
    `/api/*`; `/*` rewrite to `/index.html`. No env vars beyond the Node version.
  - **API**, Node web service: root `api`, build `npm ci && npm run build`, start
    `node dist/index.js`, health check `/api/health`. Env vars: `AUTH0_DOMAIN`,
    `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `AUTH0_AUDIENCE`, `CORE_API_BASE_URL`
    and `SUPABASE_URL` declared `sync: false` so their values are entered in the
    dashboard and never committed; `NODE_ENV=production`; `CORS_ORIGIN` set to the
    console's origin.
  - **Node version pinned** on both services to the major the project is built and
    tested with locally (24), so Render's default cannot drift under the build.
- **Dev dependencies at build time.** Both build commands need dev dependencies
  (`typescript` for the API, `@angular/cli` and `@angular/build` for the console).
  With `NODE_ENV=production` set on the API, `npm ci` omits them and `tsc` is
  missing. The API build command therefore installs with `npm ci --include=dev`;
  the console sets no `NODE_ENV`. Start-time behaviour is unchanged.
- **Production Supabase settings (F-92).** `ui/src/environments/environment.production.ts`
  carries the project URL and publishable anon key, as `environment.ts` already
  does. The static site has no build-time env, and both values are publishable by
  design, so they are committed like the development pair. The service key never
  appears.
  **Decided 2026-10-05 by the user:** production uses the same Supabase project
  as feature 14's live check, so the pair is identical to `environment.ts` and the
  test user and real users share one user list.
- **`api/.env.example` note (F-92).** The comment that points console settings at
  `environment.ts` names `environment.production.ts` too, since a production build
  never reads the development file.
- **Base path comment (F-40).** `ui/src/app/core/http/http-macro-data.provider.ts`
  keeps `BASE = '/api/macro'`; its comment stops calling a production base URL
  "feature 13's open TODO" and records that the rewrite is why the relative path is
  correct in production. Only if step 1 forces the fallback does this become a
  real setting.
- **Local production smoke checks**, matching what Render runs:
  - `npm ci && npm run build` in `ui/` produces `dist/ui/browser/index.html`.
  - `npm ci --include=dev && npm run build` in `api/`, then
    `NODE_ENV=production node dist/index.js` on a spare port, answers
    `GET /api/health` with `200` and `{ status, uptime }`, and an unauthenticated
    `GET /api/macro/countries` with `401` (configured) or `503` (unconfigured),
    never `200`.
- **Deploy handoff.** A short checklist for the user, recorded in this spec's
  final step: values to enter for each `sync: false` variable, the Supabase
  dashboard changes (Site URL and redirect allowlist for the production origin's
  `/set-password`), and the post-deploy smoke path.

## Out of scope

- Performing the deploy, creating Render services, buying an instance plan, or
  changing Supabase or DNS settings. Each is an external action the user takes or
  approves explicitly through `/release render`.
- The custom Cyte subdomain. The plan says "to be confirmed"; this feature uses
  Render's default `onrender.com` origins and records where the domain plugs in.
- CI, preview environments, workers, cron, a database. The plan says none in v1.
- The initial-bundle budget warning (684 kB against a 500 kB warning, 1 MB error).
  It warns and does not fail the build.
- `SUPABASE_SERVICE_KEY`. The plan's "when logins land" note lists it, but feature
  14 verifies tokens with public keys only and needs no service key.
- F-41 (the plan's notes still call CORS "the lock"), and the stale
  `API_BASE_URL` passage in `project-overview.md`. Both are plan or overview edits;
  see Notes for the AI.

## Build loop

`workflow.stepReview` is `feature`: build every step, then present one review
packet. `workflow.checkpointCommits` is `disabled`; `/complete` makes the commit.
Authentication configuration and secrets handling make this sensitive work, so
`qualityGates.regular.independentReview` (`when-sensitive`) selects an
independent review before `/complete`.

## Build steps

- [x] **1. Confirm Render can proxy the API rewrite, or stop.**
      Check Render's documentation for static-site rewrites to another service
      or an external URL. Record whether the rewrite proxies (not redirects),
      whether it forwards the `Authorization` request header and the `ETag`,
      `If-None-Match` and `304` pair, and how the Blueprint expresses a
      destination whose URL is only known once the API service exists.
      **Done when:** the findings and their sources are written into this step's
      notes. If Render cannot proxy with the bearer header intact, stop and
      return to the user: the plan's fallback (`API_BASE_URL` through a
      build-time generated file, with CORS then carrying real traffic) is a
      different feature shape and needs their decision before any code.

      **Findings, 2026-10-05:**
      - **Proxies, not redirects: documented.** Render's
        [redirects and rewrites](https://render.com/docs/redirects-rewrites) page:
        a rewrite "does not redirect the browser"; the site "serves the content
        from the rule's destination at the original path", and the destination
        "can be either a path or a full, publicly accessible URL".
      - **Header forwarding: not documented.** Neither that page nor the
        [Blueprint spec](https://render.com/docs/blueprint-spec) says whether the
        `Authorization` request header, or the `ETag` / `If-None-Match` / `304`
        pair, survive the proxy. Community threads report the same gap, and
        the community forum itself would not resolve from here. This is
        unknown, not ruled out, so the build does not stop; the first deploy is
        the test (step 5). If the bearer header is stripped, every macro request
        answers `401` and the plan's fallback applies.
      - **Destination must be literal.** The Blueprint spec allows
        `fromService` only in env vars, not in routes. The rewrite therefore
        names the API's `onrender.com` URL as text, derived from the service
        name, and must be confirmed once Render creates the service (Render may
        add a suffix if the name is taken).
      - **Private services are not reachable.** A rewrite destination must be
        publicly accessible, so the API stays a public web service.
      - **Node version** is set with the `NODE_VERSION` env var. Static sites
        take no `healthCheckPath`.

- [x] **2. The production console can reach Supabase (F-92).**
      Fill `environment.production.ts` with the same publishable pair as
      `environment.ts`, and correct the `api/.env.example` comment.
      **Done when:** `npm run build` in `ui/` succeeds and the built bundle
      contains the project URL; `git grep -i service_role` finds no key value;
      `npm test` passes in `ui/`.
      **Observed:** the pair was copied from `environment.ts` without being
      printed; the key's JWT `role` claim reads `anon`. The production bundle
      from a clean `npm ci && npm run build` contains the project URL. The only
      `service_role` match in the repository is the `.env.example` comment
      warning against it. `npm test` in `ui/`: 832 of 832.

- [x] **3. `render.yaml` describes both services.**
      Write the Blueprint per In scope, with the rewrite expressed as step 1
      found. Correct the `BASE` comment (F-40).
      **Done when:** the file parses as YAML; every API setting `config.ts` reads
      appears in it, and every secret is `sync: false` with no value; the route
      order is `/api/*` before `/*`; `npm run typecheck` and `npm test` pass in
      `api/`.
      **Observed:** every name `config.ts` reads except `PORT` (Render supplies
      it) is declared; the six secrets are `sync: false` with no value; routes
      run `/api/*` then `/*`. A YAML parse was **unavailable**: no parser is
      installed in either package and the spec does not authorise adding one.
      The file was checked by hand (no tabs, two-space nesting); Render
      validates it when the Blueprint is applied. `npm run typecheck` passed and
      `npm test` passed 96 of 96 in `api/`.

- [x] **4. Each production build starts the way Render will run it.**
      Run the local smoke checks from In scope, on a spare port so the running
      dev servers are untouched.
      **Done when:** the console publish directory holds `index.html`, and the
      production API answered `/api/health` with `200` and an unauthenticated
      macro request with `401` or `503`. Record the observed status codes here.
      **Observed 2026-10-05,** in a clean copy of the tracked tree (no
      `node_modules`, no `api/.env`), so `npm ci` could not disturb the running
      dev servers:
      - API: `NODE_ENV=production npm ci --include=dev && npm run build` passed.
        The same with a plain `npm ci` **failed** at `tsc`, confirming the
        dev-dependency trap the spec predicted.
      - API started with `NODE_ENV=production PORT=3100 node dist/index.js`
        and logged `(production)`. `GET /api/health`: `200`,
        `{"status":"ok","uptime":…}`. `GET /api/macro/countries` without a
        token: `503` unconfigured; `401` on a second instance (port 3101) with
        only `SUPABASE_URL` set. Both instances were stopped afterwards; the
        dev servers on 3000 and 4202 stayed up.
      - Console: `npm ci && npm run build` passed and produced
        `dist/ui/browser/index.html`, with the existing initial-bundle budget
        warning (684.72 kB against 500 kB).

- [x] **5. Hand off the deploy.**
      Write the deploy checklist from In scope into this step, then run
      `/release render` for its readiness pass. The deploy happens only on the
      user's explicit yes in that command.
      **Done when:** `/release render` reports ready, or lists exactly what the
      user must provide. Live behaviour on Render (sign-in, seven tabs on live
      data, bearer header through the rewrite, `401` after sign-out) is recorded
      as observed only if the user deploys and reports it; otherwise this spec
      says it was not observed.

      **Deploy checklist** (all external; nothing here has been done):
      1. **Host the repository.** Render deploys from GitHub, GitLab or
         Bitbucket. The user created
         `https://github.com/henrye1/macro-economics-dashboard.git`, added
         locally as `origin`; it is empty. Push `master` after `/complete`.
      2. **Apply the Blueprint.** Render dashboard, New, Blueprint, pick the
         repository. Choose the API's region (closest to the Core API host)
         and instance plan (`free` in the file; the plan recommends starter).
      3. **Enter the six secrets** Render prompts for, copying from your local
         `api/.env`: `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`,
         `AUTH0_AUDIENCE`, `CORE_API_BASE_URL`, `SUPABASE_URL`.
      4. **Check both hostnames.** If Render did not give the services
         `macro-economics-api.onrender.com` and
         `macro-economics-console.onrender.com`, update the `/api/*` rewrite
         destination and `CORS_ORIGIN` in `render.yaml` to match, then push.
      5. **Supabase**, Authentication, URL Configuration: set Site URL to the
         console's origin and add `<console origin>/set-password` to the
         redirect allowlist, so reset emails land on the deployed screen.
      6. **Smoke test the deploy:** `<api origin>/api/health` answers `200`;
         sign in on the console; all seven tabs show live data; in DevTools a
         `/api/macro/...` request carries `Authorization: Bearer` and answers
         `200` (this is the rewrite's header test); sign out, then
         `<console origin>/api/macro/countries` answers `401`.
      7. **If step 6's macro requests answer `401` while signed in,** the
         rewrite is stripping the bearer header. Stop and take the plan's
         fallback back to `/feature`.

      **`/release render`, run by the user 2026-10-05:** reported the config
      ready, with one blocker (no Git remote, since resolved by `origin` above)
      and the risks already listed here: the rewrite's header pass-through is
      unproven until a deploy, the hostnames must be confirmed, and Supabase's
      URL configuration must be updated. Region and instance plan are the
      user's choice at Blueprint apply. It changed no files.

      **Live behaviour on Render: not observed.** No deploy has happened. The
      seven-tab, bearer-through-rewrite and sign-out checks above remain the
      user's post-deploy smoke test.

      **Project rename, requested by the user during this step.** "Micro
      Economics" became "Macro Economics": the titles in `README.md`,
      `CLAUDE.md` and `AGENTS.md`, the API package name in `api/package.json`
      and `api/package-lock.json`, and the Render service names, which also
      move both `onrender.com` hostnames in the rewrite and `CORS_ORIGIN`.
      Archived history keeps the old name. Renaming the checkout folder itself
      is the user's, outside this session.

## Files / areas

- `render.yaml` (new, repository root).
- `ui/src/environments/environment.production.ts`.
- `api/.env.example` (comment only).
- `ui/src/app/core/http/http-macro-data.provider.ts` (comment only).
- Rename only (step 5): `README.md`, `CLAUDE.md`, `AGENTS.md`,
  `api/package.json`, `api/package-lock.json`.
- Read, not changed: `api/src/config.ts`, `api/src/app.ts`, `api/src/index.ts`,
  `ui/angular.json`, `ui/proxy.conf.json`, `api/package.json`, `ui/package.json`.

## Data / contracts

- **Env contract (API).** Exactly the names `api/src/config.ts` reads:
  `PORT` (Render supplies it; not declared), `NODE_ENV`, `CORS_ORIGIN`,
  `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `AUTH0_AUDIENCE`,
  `CORE_API_BASE_URL`, `SUPABASE_URL`. A missing macro or Supabase setting keeps
  today's fail-closed `503`; `/api/health` stays open.
- **Health check.** `GET /api/health` answers `200` with `{ status, uptime }`.
  Unchanged; Render's health check depends on it staying unauthenticated.
- **URL shape.** The console requests `/api/macro/*` on its own origin in every
  environment. Development: `proxy.conf.json`. Production: the Render rewrite.
- **Secrets.** No secret value is committed, echoed into a log, or written into
  this spec. The anon key and project URL are publishable and are not secrets.

## Testing

- No new unit tests: the changes are configuration and comments, plus one
  environment file that existing specs never import in production form.
- Existing gates: `npm run typecheck` and `npm test` in `api/`; `npm test` and
  `npm run build` in `ui/`.
- Step 4 is the integration evidence: real production builds, started locally,
  answering real requests. It does not prove Render's rewrite; only a deploy does.

## Notes for the AI

- The plan (`blueprint/project-plan.md` section 8) is newer than
  `project-overview.md` on this point. The overview's Deployment table still lists
  `API_BASE_URL` and a TODO for it; the plan replaced both on 2026-09-11. Follow
  the plan. Suggest `/overview` afterwards; do not edit the overview here.
- Never set `NODE_ENV=production` where it changes `npm ci` without
  `--include=dev`. That is the most likely first-deploy failure.
- Do not commit any value from `api/.env`. Only the publishable Supabase pair goes
  into the repository.
- F-41 asks for a plan edit. Once step 1 settles the rewrite, offer the user the
  one-line correction to the plan's CORS note; do not make it unasked.

## Open questions

- **Instance plan.** The plan recommends a paid starter instance for the API to
  avoid free-tier cold starts. That is a billing choice made in `/release render`,
  not in code; `render.yaml` will name the plan the user picks, defaulting to
  `free`.

## Findings

Resolved with this feature and archived from the live ledger. IDs carry the
archive prefix so they stay unique across the project history.

### 13-deployment-readiness/F-92 [P3] closed - The production build ships blank Supabase settings and the setup note points at the development file

**File:** api/.env.example:23
**Found:** 2026-10-05 by /audit independent (scope: current; lens: quality)
**Why it matters:** `angular.json` replaces `environment.ts` with
`environment.production.ts` for the default `production` build, and that file holds
blank `supabaseUrl` and `supabaseAnonKey`, so `npm run build` produces a console with
no Supabase client that reports sign-in as unavailable. `.env.example` tells the
operator to set the values in `ui/src/environments/environment.ts`, which a
production build never reads. Nothing is deployed yet, so nothing is broken today;
`/release render` would ship a console nobody can sign in to by following the note.
**Suggested fix:** point the note at `environment.production.ts` (or both files), or
fill the production file with the same publishable values.
**Resolution:** Fixed 2026-10-05 by /implement (feature 13 step 2). `environment.production.ts` carries the publishable URL and anon key (same project as development, by the user's decision), and `api/.env.example` names both environment files. A clean production build contains the project URL. Awaiting re-review. Closed 2026-10-05 by the independent review of `adb93db`: `environment.production.ts` holds the same URL and key as `environment.ts` (compared without printing; the key's JWT `role` claim is `anon`), `angular.json` swaps it in for the production build, a fresh `npm run build` bundle contains the project URL, and `api/.env.example:21-26` names both files. No service key appears; the only `service_role` match is the warning comment. The repair introduced no new defect.

## Independent review

**Status:** passed
**Target commit:** adb93db3262c6dcd913d8f0c1daba5b3b13a5912
**Base commit:** 4b70f16813eb4b29f53efad1d2f16077a3a53bc6
**Base ref:** master
**Spec hash:** bdcf4da2b7304d35023d2fa13700889328b550eb7b5f6908ce54ed8d0a77da0c
**Prepared by:** claude
**Builder model:** claude-opus-5-5
**Requested reviewer:** claude
**Requested model:** claude-opus-5-5
**Requested execution:** automatic
**Requested at:** 2026-10-05T09:29:30Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5-5
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-10-05T09:33:14Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

### Commands

- `git rev-parse HEAD`, `git merge-base master HEAD`, `sha256sum blueprint/context/current-feature.md`, `git status --porcelain --untracked-files=all`: pass (all match the request; only `review.md` differed)
- `npm run typecheck` in `api/`: pass
- `npm test` in `api/`: pass (96 of 96)
- `npm run build` in `api/`: pass
- `NODE_ENV=production PORT=3105 node dist/index.js` in `api/`, then curl: pass (`/api/health` 200; `/api/macro/countries` 401 without a token and 401 with a forged bearer; server stopped afterwards)
- `npm test` in `ui/`: pass (832 of 832)
- `npm run build` in `ui/`: pass (existing 684.72 kB initial-bundle budget warning; `dist/ui/browser/index.html` present; bundle contains the project URL)
- YAML parse of `render.yaml`: unavailable (no parser installed in either package or on the host)

### Evidence

- Delta: 11 files; reviewed `render.yaml`, `environment.production.ts`, `http-macro-data.provider.ts`, `api/.env.example`, rename edits in `README.md`, `CLAUDE.md`, `AGENTS.md`, `api/package.json`, `api/package-lock.json`, spec and ledger; followed into `api/src/config.ts`, `app.ts`, `index.ts`, `middleware/auth.ts`, `ui/angular.json`, `ui/proxy.conf.json`.
- `render.yaml` declares every `config.ts` name except `PORT`; the six secrets are `sync: false` with no value; routes run `/api/*` before `/*`; API build uses `npm ci --include=dev`; no tabs.
- Production and development Supabase pairs compared equal without printing; the key's JWT `role` claim is `anon`; `git grep -i service_role` matches only the warning comment.
- No leftover "Micro Economics" outside archived history.

### Findings

- F-98 [P2] open: deploy checklist never turns off Supabase self sign-up while the API admits any verified project user
- F-99 [P3] open: console static site declares no security response headers
- F-100 [P3] open: `app.ts` CORS comment claims a cross-origin production console
- F-92 [P3] closed: production Supabase settings and setup note repaired
- F-40 [P3] fixed to open: TODO comment repaired, but the base path is still declared three times
- F-75 [P3] re-examined, stays open: deployment added no API headers

### Remaining risk

- YAML parse of `render.yaml` unavailable; checked by hand only, Render validates at Blueprint apply.
- Render rewrite forwarding of `Authorization` and the `ETag` / `If-None-Match` / `304` pair is undocumented and unobserved until a deploy.
- Service hostnames in the rewrite and `CORS_ORIGIN` are assumed and must be confirmed after Render creates the services.
- Supabase project auth settings (sign-up, anonymous sign-in) not inspected; see F-98.
- Local smoke used the developer `api/.env` (configured path); the unconfigured `503` path was not re-run here.
