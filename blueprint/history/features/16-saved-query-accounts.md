# Feature: Saved query accounts

**From build-plan:** feature 16

**Branch:** `feature/saved-query-accounts`

**Status:** verified

## Goal

Saved queries follow the signed-in account instead of the browser. The console
reads and writes them through new Express routes. The API stores them in Supabase
Postgres with `SUPABASE_SERVICE_KEY`, scoped to the verified `req.auth.userId`.
On a signed-in visit, any queries still in this browser's localStorage are copied
to the account once and then removed locally.

## In scope

- One Postgres table, `public.saved_queries`, delivered as a SQL file the user
  applies in the Supabase SQL editor.
- API:
  - `SUPABASE_SERVICE_KEY` setting;
  - a saved-query repository over `@supabase/supabase-js`;
  - Zod validation;
  - three routes under `/api/saved-queries`.
- UI:
  - `SavedQueryStore` moves from localStorage to those routes;
  - the one-time localStorage migration;
  - loading, load-failure and save-failure states on the Saved queries page;
  - the auth interceptor carries the token to the new routes.
- `render.yaml` and `api/.env.example` declare the new secret, and
  `coding-standards.md` records Zod as the validation library.

## Out of scope

- Deleting or renaming saved queries. The design offers neither, and re-saving a
  name still replaces it.
- Sharing queries between users or organisations, and any role beyond the
  existing `Member` floor.
- Administration (20), generated API types (17), and any change to `/api/macro/*`.
- Applying the SQL or setting the Render secret. Those are remote changes the
  user makes.
- Redesigning the Saved queries page. Only the new state messages are added.

## Build loop

`workflow.stepReview` is `feature`: build all steps, then present one review
packet. `checkpointCommits` is disabled. This is persisted user data behind auth,
so the independent-review gate (`when-sensitive`) applies before `/complete`.

## Build steps

- [x] **1. Schema.** Add `supabase/migrations/20261006000000_saved_queries.sql`
  with the table under Data / contracts:
  - RLS enabled;
  - no policies;
  - `revoke all` from `anon` and `authenticated`, so only the service role can
    touch it.

  The script is idempotent: `create table if not exists`, and safe re-run of the
  RLS and grants.
  **Done when:** the file exists and reads correctly in review. It is not applied
  by the agent, and no live evidence is claimed.

- [x] **2. API config and repository.** Install `@supabase/supabase-js` and `zod`
  in `api/` (authorized here).
  - `src/config.ts`:
    - add `supabaseServiceKey` from `SUPABASE_SERVICE_KEY`, default `''`;
    - add `isSavedQueriesConfigured` (URL and key both non-blank) and
      `config.savedQueriesConfigured`.
  - `.env.example`:
    - add `SUPABASE_SERVICE_KEY=` with a secret warning;
    - correct the comment that says the API needs no service key. It still needs
      none for verifying tokens.
  - `src/saved-queries/saved-query.schema.ts`: Zod schemas (Data / contracts),
    plus row↔entry mapping.
  - `src/saved-queries/saved-query-repository.ts`:
    - a `SavedQueryRepository` interface with `list(userId)`,
      `save(userId, entry)` and `import(userId, entries)`;
    - `createSupabaseRepository(url, serviceKey)`, with
      `auth: { persistSession: false, autoRefreshToken: false }`.

  Add tests: `config.test.ts` cases for the new flag; `saved-query.schema.test.ts`
  for valid entries, each invalid field, trimming, an empty name, unknown keys
  stripped, and row↔entry mapping with `savedAt` serialized as `toISOString()`.
  **Done when:** `npm test` and `npm run typecheck` pass in `api/`.

- [x] **3. API routes.** Add `src/routes/saved-queries.ts` and mount it in
  `routes/index.ts` at `/saved-queries`:
  - `requireRole('Member')` on the whole router;
  - then a 503 guard when not configured;
  - then the three routes under Data / contracts.

  Add `savedQueryRepository?` to `ApiDeps` so tests inject an in-memory fake. Add
  `api/src/routes/saved-queries.routes.test.ts`, run over `node:http` as in
  `macro.routes.test.ts`. Cover:
  - list scoped to the caller, newest first;
  - save upserts by name and sets server time;
  - import keeps the account's version on a name clash and returns the full list;
  - `400` for each invalid body, with the fixed message and no echo;
  - `401` with no `req.auth`;
  - `503` when unconfigured;
  - `502` when the repository throws, with nothing leaked and a `console.error`;
  - a body `userId` is ignored, and the stored owner is always `req.auth.userId`;
  - the real auth seam still guards the route (no bearer gives `401`).

  Add `SUPABASE_SERVICE_KEY` (`sync: false`) to the API service in `render.yaml`.
  **Done when:** those tests pass, the existing suite passes unchanged, and
  `npm run typecheck` and `npm run build` pass in `api/`.

- [x] **4. UI store over HTTP, with migration.**
  - `auth.interceptor.ts`: also attaches the token, and handles `401`, for
    `/api/saved-queries`.
  - Rewrite `SavedQueryStore` on `HttpClient`, keeping `saved`, `isEmpty`,
    `storageProblem` and `clearWriteProblem()`. Add:
    - `status`: `'idle' | 'loading' | 'ready' | 'failed'`;
    - `saving`, a boolean;
    - `save()` returns `Promise<boolean>`.
  - Loading:
    - loads when `SessionStore.session()` becomes non-null, and again when its
      `email` changes;
    - clears `saved` to `[]` and returns to `idle` on sign-out.
  - Migration, on each load:
    - read `cyte.macro.saved-queries.v1` and keep the entries that pass the
      existing `isSavedQuery`;
    - if any remain, `POST /api/saved-queries/import`; on `200`, `removeItem` the
      key and use the returned list;
    - on failure, keep the local key, still `GET` the list, and set the problem
      to `Could not move this browser's saved queries to your account. They are
      still here and will be tried again next time.`;
    - with no local entries, or no usable storage, just `GET`.
  - `SavedQueryStorage` gains `removeItem`. A throwing `removeItem` counts as a
    failed migration step: report it, and duplicates are harmless because import
    keeps the account's version.
  - `save` sends `PUT` and, on `200`, puts the returned entry first, replacing
    that name. On failure the list is unchanged and the problem is
    `Could not save the query. Try again.`
  - Rewrite `saved-query.store.spec.ts` with `HttpTestingController` and a fake
    storage. Cover:
    - load;
    - migration success, which clears the key;
    - migration failure, which keeps the key, still lists, and shows the message;
    - malformed local entries filtered out before import;
    - save success and failure;
    - sign-out clears the list;
    - a user switch reloads.

  Extend `auth.interceptor.spec.ts` for the new prefix.
  **Done when:** `npm test` passes in `ui/`.

- [x] **5. Saved queries page states.** `saved-queries.ts` and `.html`:
  - `loading` shows `Loading saved queries…` (`role="status"`) in place of the
    table and empty state;
  - `failed` shows `Could not load saved queries.` (`role="status"`);
  - the empty state shows only when `ready` and empty;
  - Save is disabled while `saving` or not `ready`;
  - `save()` awaits the store. Name clearing and the confirmation happen only on
    success. On failure the name is kept and the problem shows.

  Existing copy, layout and Load/Reproduce behaviour are unchanged. Update
  `saved-queries.spec.ts` to drive the store through `HttpTestingController`.
  Cover the loading, failed, empty and saving states, plus the existing save,
  load and reproduce cases.
  **Done when:** `npm test` and `npm run build` pass in `ui/`. Browser tests are
  not extended. The e2e stub is for macro routes only, so note any spec that
  starts failing on an unstubbed `/api/saved-queries` and stub it to a `200` empty
  list in `ui/e2e/stub-api.ts`.

## Files / areas

- `supabase/migrations/20261006000000_saved_queries.sql` (new)
- `api/package.json`, `api/package-lock.json`: `@supabase/supabase-js`, `zod`
- `api/src/config.ts`, `api/src/config.test.ts`, `api/.env.example`
- `api/src/saved-queries/` (new): `saved-query.schema.ts`, `saved-query-repository.ts`, tests
- `api/src/routes/saved-queries.ts`, `api/src/routes/saved-queries.routes.test.ts` (new); `api/src/routes/index.ts`
- `render.yaml`
- `ui/src/app/core/saved-query.store.ts` and spec; `ui/src/app/core/http/auth.interceptor.ts` and spec
- `ui/src/app/saved-queries/saved-queries.ts`, `.html` and spec; `ui/e2e/stub-api.ts` only if needed
- `blueprint/context/coding-standards.md`: replace the validation TODO with Zod

## Data / contracts

**Table**

```sql
create table if not exists public.saved_queries (
  user_id     uuid        not null references auth.users (id) on delete cascade,
  name        text        not null check (name <> '' and name = btrim(name)),
  query       jsonb       not null,
  vintage_ids integer[]   not null default '{}',
  saved_at    timestamptz not null default now(),
  primary key (user_id, name)
);
```

RLS is enabled with no policies, and all privileges are revoked from `anon` and
`authenticated`. Only the API's service role reads or writes it.

**Entry (unchanged locked shape):** `{ name, query: WorkingQuery, vintageIds: number[], savedAt: ISO string }`.

- The server accepts what feature 10's `isSavedQuery` accepts:
  - `name`: a string, trimmed, non-empty after the trim;
  - `query`: every `WorkingQuery` key present, `indicators` and `countries` as
    string arrays, `yearFrom` and `yearTo` as number or null, `source` and
    `forecast` as strings, `vintage` as a string or number, and `page` and
    `pageSize` as numbers;
  - `vintageIds`: integers.
- Unknown keys are stripped at every level.
- `savedAt` is returned as `new Date(saved_at).toISOString()`.
- Order is `saved_at desc, name asc`.
- No size limits beyond Express's existing 100 kB JSON body limit.

**Routes.** All need a verified session (`requireRole('Member')`), and the owner
is only ever `req.auth.userId`. Any `userId` or `user_id` in a body is ignored.

| Route | Body | Success |
| --- | --- | --- |
| `GET /api/saved-queries` | none | `200 { data: SavedQuery[] }` |
| `PUT /api/saved-queries` | `{ name, query, vintageIds }` | `200 { data: SavedQuery }`, upserted on `(user_id, name)`, `saved_at = now()` |
| `POST /api/saved-queries/import` | `{ data: SavedQuery[] }` (may be empty) | `200 { data: SavedQuery[] }`, the full list after import |

- Import inserts each entry with its own `savedAt`.
- On an existing `(user_id, name)` it does nothing, so the account's version
  wins.
- Within one import, a repeated name keeps its first entry.

**Errors** use the shared `{ error }` shape with fixed strings:

| Status | When | Message |
| --- | --- | --- |
| `400` | Invalid body | `The saved query is not valid.` |
| `401` | No session | From the seam or `requireRole` |
| `503` | Not configured | `Saved queries are not configured on this service.` |
| `502` | Repository failure | `Saved queries could not be reached.` |

On a `502`, the caught error is logged with `console.error` and never returned.
The service key is never logged.

## Testing

- `api/`, Vitest:
  - schema and mapping;
  - config flag;
  - routes over HTTP against an in-memory fake repository;
  - one test with the real auth seam.

  The Supabase repository itself is not unit-tested against a database.
- `ui/`, Karma: the store, interceptor and page specs with
  `HttpTestingController`.
- No live evidence is claimed. End-to-end behaviour needs:
  - the SQL applied;
  - `SUPABASE_SERVICE_KEY` set locally and on Render;
  - a signed-in run (`/check` afterwards).

## Notes for the AI

- The service key bypasses RLS, so every repository query must filter on the
  `userId` passed in. The routes pass only `req.auth.userId`. Test that a body
  owner is ignored.
- Never put the service key in the UI, in a response, or in a log line.
- The interceptor currently matches only `/api/macro`. Without step 4's change
  every new route answers `401` and signs the user out.
- `SessionStore.Session` has no user id. Key reloads on `email`, which comes from
  the verified session. The server, not the client, decides whose rows these are.
- Keep `isSavedQuery` as the client-side filter for migration. The server schema
  mirrors it, so a locally valid entry is never rejected forever.
- After this lands, the overview's `SUPABASE_SERVICE_KEY` open question is
  answered: the saved-query routes use it. Re-run `/overview` after updating the
  plan.

## Independent review

**Status:** passed
**Target commit:** d45bd8860070be5899f5a58d4d503475c6eb2c58
**Base commit:** 80b746975f27e05b1774c3e37c800163e8e68690
**Base ref:** master
**Spec hash:** 3adf2ed2e8cfcb37a29d9d7638d93ac780504ba13f6eba0679a184981e4b034f
**Prepared by:** claude
**Builder model:** claude-opus-5-5
**Requested reviewer:** claude
**Requested model:** claude-opus-5-5
**Requested execution:** automatic
**Requested at:** 2026-10-06T08:16:38Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5-5
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-10-06T08:20:07Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

### Commands

- `api/: npm run typecheck`: pass
- `api/: npm test`: pass (9 files, 151 tests)
- `api/: npm run build`: pass
- `ui/: npm test`: pass (827 specs)
- `ui/: npm run build`: pass (existing initial-bundle budget warning, 686.53 kB over 500 kB; no dependency added to `ui/` by this delta)

### Evidence

- Freshness: `HEAD` = target, `git merge-base master HEAD` = base, spec SHA-256 matches, only `blueprint/context/review.md` differed from target.
- All 22 changed paths reviewed against the spec's steps 1-5 and Data / contracts.
- Owner scoping: every repository query filters or writes `user_id` from the `userId` argument (`saved-query-repository.ts`); routes pass only `req.auth!.userId` after `requireRole('Member')`; Zod `z.object` strips body `userId`/`user_id`; route test asserts owners and stored rows.
- Error hygiene: fixed strings for 400/503/502; `errorHandler` relays only `err.message` of `SavedQueryError`; caught repository error logged via `console.error`, never returned; service key held only in `config`, never logged or served (health route returns status and uptime only).
- Migration SQL: RLS on, no policies, `revoke all` from `anon`, `authenticated`; idempotent.
- UI: interceptor prefix match rejects lookalike paths; store generation guard drops a previous visitor's late answers; sign-out clears to `idle`; import-then-remove, failure-keeps-key and remove-throws paths implemented and specced; page gates Save on `ready` and `!saving`.
- No skipped, focused or placeholder tests found in the changed specs.

### Findings

- F-99 [P3] open: schema admits int4-overflow vintage ids and NUL strings that Postgres refuses, answering 502 and failing a migrated batch on every visit.
- F-100 [P3] open: the real-seam test accepts 401 or 503 and would pass with the seam unmounted.

### Remaining risk

- `createSupabaseRepository` is not exercised against a database (excluded by the spec); `upsert` with `ignoreDuplicates` and ordering are unverified live.
- Migration SQL not applied; Supabase default grants to `service_role` on the new table assumed, not verified.
- Browser tests (`ui/: npm run test:browser`) not run in this review; the e2e stub does not cover `/api/saved-queries` (only the Saved queries page instantiates the store).
- `/check` not run (not required); no signed-in end-to-end evidence.
- No lint, security-scan or performance command is declared in either package.
