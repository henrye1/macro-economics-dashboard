# Feature: Live data wiring

**From build-plan:** feature 8

**Branch:** `feature/live-data-wiring`

**Status:** verified

## Goal

Point the console at the real Core API. One line changes in `app.config.ts`;
everything behind it is the HTTP provider that line names, the query
serialisation the guide specifies, and honest rendering of an RFC 7807 problem
instead of a flat "unavailable".

This is also where the hand-written contract types stop being a guess. The
overview says to check them against a real response at this feature, and two
fields are flagged in `macro-contracts.ts` as unconfirmed.

## In scope

- `HttpMacroDataProvider` implementing `MacroDataProvider` against
  `/api/macro`, registered in `app.config.ts` in place of the fixture provider.
- Query serialisation exactly as `CONSUMER-GUIDE.md` section 4 documents it:
  **`indicators` and `countries` are comma-separated values, not repeated keys.**
- A typed `MacroRequestError` carrying the HTTP status and the problem's
  `detail`, and the six consumers showing that `detail` instead of a generic
  message when the service explains itself.
- Preserving browser ETag revalidation: plain `GET`s, no cache-defeating header
  or parameter.
- Reconciling `macro-contracts.ts` with observed live responses, including the
  two fields already flagged unconfirmed.
- The loading states written in features 2 to 6 becoming visible for the first
  time, because requests now take real time.

## Out of scope

- **The visible ETag and `304` demonstration.** The overview assigns the request
  builder's send button, its header display and its real `304` to feature 12.
  This feature must not break browser revalidation; it does not surface it.
- Production base URL selection. The console is a static site on its own origin
  in production, so it needs a configurable API base. The overview records that
  as an open TODO owned by feature 13. Relative `/api/macro` is correct until
  then and works in development through `ui/proxy.conf.json`.
- Retry, backoff or a client-side response cache. The API holds no cache by
  design and the browser already revalidates.
- Deleting the fixture provider. It stays as the test double every page spec
  already uses.
- Any change to `api/`. Feature 7 shipped the passthrough and it is verified.
- Revisions rendering (feature 9), export (feature 11), saved queries
  (feature 10).

## Build loop

`workflow.stepReview: "feature"` and `workflow.checkpointCommits: "disabled"`.
Build all four steps, then present one review packet. `/complete` makes the
single feature commit.

Verification per step: `npm run build` and `npm test` in `ui/`. No `Verify`
command is declared. `api/` is untouched, so run its suite once at the end only
to prove that claim.

Step 4 additionally requires **live evidence**, which is now possible: the
credentials are configured and a read-only probe through the built API returned
a real `200`, a real `304` on repeat, and a real `400` `problem+json`.

## Build steps

- [x] **1. Query serialisation.** Add `ui/src/app/core/http/macro-params.ts`
  exporting a pure function that turns a query object into `HttpParams`. Arrays
  join with commas; `undefined` keys are omitted; `null` is omitted; booleans
  and numbers stringify. Nothing else transforms.
  **Done when** `macro-params.spec.ts` proves against the guide's own examples:
  `{ indicators: ['GDP_GROWTH_REAL','CPI_INFLATION_AVG'], countries: ['ZAF','NAM'], yearFrom: 2020, yearTo: 2030 }`
  serialises to
  `indicators=GDP_GROWTH_REAL,CPI_INFLATION_AVG&countries=ZAF,NAM&yearFrom=2020&yearTo=2030`;
  a single-element array emits no comma; an empty array is omitted entirely;
  `curated: false` emits `curated=false` and not an empty string; `vintage: 12`
  and `vintage: 'WEO 9.0.0 2025-10-08'` both serialise; and no key is emitted
  twice.

- [x] **2. The HTTP provider.** Add
  `ui/src/app/core/http/http-macro-data.provider.ts` implementing all six
  `MacroDataProvider` methods against `/api/macro/...` with the step 1
  serialiser, plus `macro-error.ts` exporting `MacroRequestError` and a function
  that maps an `HttpErrorResponse` onto it. Do not register it yet.
  **Done when** `http-macro-data.provider.spec.ts`, driven by
  `provideHttpClientTesting`, proves: each method requests the expected URL and
  method, with `/vintages/14/revisions` built from the id argument; the response
  envelope passes through untouched; a `200` with empty `data` resolves
  normally and is not an error; a `400` `application/problem+json` surfaces as
  a `MacroRequestError` with `status` 400 and the problem's `detail`; a `401`,
  `404` and `500` each surface with their status and a `null` detail when the
  body is not a problem document; a network failure surfaces with status `0`;
  and every request carries no `Cache-Control`, no `If-None-Match` and no
  cache-busting parameter, so browser revalidation is left intact.

- [x] **3. Consumers show the explanation.** Give the six provider consumers a
  message derived from the error rather than a fixed string: the problem's
  `detail` when the service supplied one, otherwise each tab's existing
  wording. Consumers are `app.ts`, `overview.ts`, `countries-indicators.ts`,
  `observations.ts`, `series.ts` and `working-query-card.ts`.
  **Done when** each affected spec proves that a `MacroRequestError` carrying
  `detail: "Unknown indicator code(s): NOPE."` renders that sentence in the
  tab's error slot with `role="status"` preserved, and that an error with no
  detail still renders the wording those specs already assert, unchanged. The
  full `ui/` suite passes with no test rewritten except where the message is
  asserted.

- [x] **4. Swap the provider and reconcile the contract.** Replace the
  `FixtureMacroDataProvider` line in `app.config.ts` with
  `HttpMacroDataProvider`. Then run the console against the live service and
  compare real responses to `macro-contracts.ts`, correcting the types and
  removing or confirming the two flagged comments.
  **Done when** the build and the full `ui/` suite pass; and the live check
  records, in the review packet, the observed shape of a `Vintage` (settling
  whether `source` exists on that route), the observed shape of a `Revision`
  from `/vintages/{id}/revisions` (settling `previousValue` and `newValue`), and
  whether `meta` carries the `page`, `pageSize`, `totalCount`, `vintages` and
  `attribution` this project assumes. Every contract change is named in the
  packet with the response that justified it.

## Repair steps (independent review, 2026-09-11)

Added after the independent review of checkpoint `7403265` returned
`changes-requested`. Each is verified; the ledger carries the evidence.

- [x] **5. F-08 - the `api` suite is red and makes a live upstream call.** The
  P1 blocker. `macro.routes.test.ts` asserted `503` on the premise that the repo
  has no credentials, which `api/.env` made false, so it received `200` and made
  a real Auth0 grant plus an upstream read on every run. **A scope addition:**
  the spec listed any `api/` change as out of scope, and the user approved this
  one specifically. Split into an injected `macroConfigured: false` case for the
  503 path and a zero-injection case asserting only `/api/health`.
  **Done when** `npm test` in `api/` is green and neither case reads `.env` or
  reaches the network. Verified: 67 passed, 6 files.

- [x] **6. F-09, F-12 - the shared test double contradicted the reconciled
  contract.** `envelope()` gave every route `page: 1`, `pageSize: 500` and
  populated `meta.vintages`, which is the exact divergence that hid the
  header-strip bug, and the fixture timestamps carried a `Z` the service does
  not send. Now modelled per route from the observed responses. One correction
  to the finding: `/countries` does populate `meta.vintages` live, so only its
  paging fields were wrong; `/indicators` returns `vintages: []`, which the
  finding did not mention.
  **Done when** the double reports the observed shape for all six routes and a
  spec asserts each. Two pre-existing assertions that encoded the old uniform
  shape were retargeted.

- [x] **7. F-10 - the header strip had no live region.** It was the only error
  slot of the six without `role="status"`, so its message was never announced.
  **Done when** the strip carries the role and the shell spec asserts it.

- [x] **8. F-11 - `loading` was reachable only once.** `switchMap` emits nothing
  while a re-query is in flight, so after a paging click both result tabs kept
  rendering the previous `rowRange()` and rows for a query no longer on screen.
  Zero-width under synchronous fixtures; a full round trip over HTTP. This is
  the defect class the spec's own notes flagged as "a real defect now".
  **Done when** a `{ status: 'loading' }` member plus `startWith` makes the
  state per-request, and an asynchronous double proves it. Verified as a real
  guard, not a mirror: removing `startWith` fails the new specs with
  `Expected 'Rows 1-22 of 22' to be 'Loading observations...'`.

- [x] **9. F-13 - the pager invented a page and a page count.** Introduced by
  the step 8 repair: with `ready()` null in flight, `page` fell back to a
  literal `1` and `pageCount` collapsed, so every paging click showed
  "Page 1 of 1" with both controls disabled before snapping to the truth. The
  loading state now carries the last settled `meta`, and `page` falls back to
  the working query as `pageSize` already did.
  **Done when** the footer reports the asked-for page and the last real count
  mid-flight, proven by specs that fail when the literal `1` is reinstated.

- [x] **10. F-14 - the repaired double could not report a historical vintage.**
  Introduced by the step 6 repair: `revisions()` filtered the latest-only refs,
  so every realistic input reported no provenance, and a new spec locked that in
  under a title describing a case it did not exercise. Now resolved from all
  published vintages, with separate specs for a superseded id and a nonexistent
  one.

- [x] **11. F-15 - nothing tested the one line this feature exists for.**
  Every page spec supplies its own `MACRO_DATA`, so reverting the provider swap
  would have shipped the console on fixtures with a green suite and a clean
  build. `app.config.spec.ts` now reads the real `appConfig`.
  **Done when** reverting the swap fails a test. Verified.

## Files / areas

| Path | Change |
| --- | --- |
| `ui/src/app/core/http/macro-params.ts` | new - query serialiser |
| `ui/src/app/core/http/macro-params.spec.ts` | new |
| `ui/src/app/core/http/macro-error.ts` | new - `MacroRequestError` and its mapper |
| `ui/src/app/core/http/macro-error.spec.ts` | new |
| `ui/src/app/core/http/http-macro-data.provider.ts` | new |
| `ui/src/app/core/http/http-macro-data.provider.spec.ts` | new |
| `ui/src/app/core/macro-contracts.ts` | corrections justified by live responses |
| `ui/src/app/app.config.ts` | the one-line provider swap |
| `ui/src/app/app.ts` | error message from the problem |
| `ui/src/app/overview/overview.ts` | same |
| `ui/src/app/countries-indicators/countries-indicators.ts` | same |
| `ui/src/app/observations/observations.ts` | same |
| `ui/src/app/series/series.ts` | same |
| `ui/src/app/query/working-query-card.ts` | same |
| the matching `.html` and `.spec.ts` for those six | message slot and assertions |

Untouched: `macro-data.provider.ts` (the interface and token do not change, which
is the point of the seam), `working-query.ts`, `working-query.store.ts`, the
fixture provider and its fixtures, `paging-footer`, `value-format`, all of
`api/`, and `ui/proxy.conf.json`.

## Data / contracts

**The interface does not change.** `MacroDataProvider` keeps its six methods and
`Observable<Envelope<T>>` return type, so no page learns that data now arrives
over HTTP. That seam is why features 2 to 6 need no rewrite.

**CSV, not repeated keys.** Guide section 4.3 states `indicators` is a "csv of
canonical codes" and `countries` a "csv of ISO3", and its worked example is
`?indicators=GDP_GROWTH_REAL,CPI_INFLATION_AVG&countries=ZAF,NAM`. The fixture
provider took arrays in memory and never had to serialise, so this is new
ground and the one place a wrong guess produces a `400` from the real service.
`HttpParams` must receive one joined value per key, never `append` per element.

**Requests are plain GETs.** No `Cache-Control`, no `If-None-Match`, no
timestamp parameter. The API relays `ETag` and
`Cache-Control: private, max-age=3600`, and the browser's own HTTP cache does
the revalidation; adding any of those three would defeat it silently. A repeat
identical query inside the hour should make no network request at all.

**Error shape.**

```ts
export class MacroRequestError extends Error {
  /** HTTP status, or 0 when the request never reached the service. */
  readonly status: number;
  /** The problem's `detail`, or null when the body was not a problem document. */
  readonly detail: string | null;
}
```

A body is treated as a problem document only when it is an object with a string
`detail`. Anything else yields `detail: null` and the consumer's own wording.
Never surface a raw body, a header, or a stack.

**Rendering rule for `detail`.** It is server-supplied text shown in the UI.
Render it through Angular interpolation only, which escapes by default. No
`innerHTML`, no `bypassSecurityTrust*`. Keep `role="status"` on the slot so the
message is announced, as features 3 to 6 established.

**A `200` with empty `data` is never an error**, at every layer. The guide says
so and features 4, 5 and 6 already depend on it.

**Observed live, and binding on this feature:**

| Observation | Consequence |
| --- | --- |
| `ETag: "macro-2"` on observations, `"macro-2-12"` on countries | Strong ETags, derived from vintages and shared across queries, exactly as guide section 6 says |
| `Cache-Control: private, max-age=3600` | Browser revalidation is real; do not defeat it |
| `400` body `{"title","status","detail","instance"}` | `ProblemDetails` matches; `detail` names the offending code |
| `vintageId: 2` | Vintage ids are service data, never assumed. Nothing may hardcode a fixture id |
| `value: -6.16892500` | Values carry more precision than the one-decimal display format. Never round the stored value |
| No `X-Total-Count` on any observed response | Feature 12's promise to show it needs checking against the service, not assumed |

**Authorization and tenancy:** unchanged and still none in the console. The
browser holds no token; the API holds the M2M credentials. This feature must not
introduce an `Authorization` header, a cookie, or any credential in the client.
The accepted gap recorded in the overview stands.

## Testing

`ui/` uses Karma and Jasmine (`npm test`). Tests gate every logic-bearing step.

- `macro-params.spec.ts` - serialisation against the guide's examples, including
  the empty-array and `false` edge cases.
- `macro-error.spec.ts` - problem document detection, status extraction, the
  network-failure case, and that a non-problem body yields a null detail.
- `http-macro-data.provider.spec.ts` - all six methods with
  `provideHttpClientTesting`: URLs, envelope passthrough, empty `data`, and each
  error status.
- The six consumer specs - the detail-bearing message and the unchanged
  no-detail fallback.

**Page specs keep using `FixtureMacroDataProvider`.** They test page behaviour,
not transport, and rewriting them onto HTTP mocks would make them slower and
less readable for no gain.

No browser-test command exists, so no browser coverage is added.

**Live evidence is required for step 4 only**, and only for the contract
reconciliation. It cannot be automated, must be recorded as observed output in
the review packet, and must never include a credential.

## Notes for the AI

- **The one-line swap is the whole point.** If a page needs editing to accept
  HTTP data, something is wrong with the change, not with the page. The only
  page edits in scope are the error message.
- **CSV is the highest-risk detail in this feature.** A repeated-key query string
  is the natural Angular default and would produce a `400` from the live
  service. Test it before wiring anything.
- **Do not add an ETag or `If-None-Match` header.** It is tempting, since the
  build-plan line says "ETag passthrough", but the passthrough is the API's job
  and the revalidation is the browser's. The console's obligation is to stay out
  of the way; feature 12 shows the mechanics deliberately.
- **A `400` is usually the console's own fault.** `validateWorkingQuery` already
  catches the two documented cases, so a live `400` most likely means a code
  that does not exist. Showing `detail` verbatim is what makes that diagnosable.
- **Loading states go live here.** Every `loading()` written since feature 2 has
  been unreachable because fixtures resolve synchronously. Watch them in the
  browser during step 4; a flash of the wrong state is a real defect now.
- **Vintage labels will change.** The header strip will show the service's real
  vintages, not `WEO 10.0.0 2026-04-14`. That is correct, not a regression.
- `api/.env` holds live credentials, is git-ignored and untracked. Never read,
  print, log or commit its values.

## Open questions

> **None blocking.** The credentials that blocked this feature are configured and
> a live read-only probe succeeded, so the overview's standing open question is
> now answered for QA.
>
> Two things this feature is expected to settle rather than assume, both recorded
> as step 4 done-when items: whether `Vintage` carries `source` on the
> `/vintages` route, and the real property names on `Revision`. Both are flagged
> in `macro-contracts.ts` today.
>
> One thing it will surface but must not fix: no observed response carried
> `X-Total-Count`, which the overview's request-builder section promises. That is
> a feature 12 scope question, not a change to make here.

## Findings

### 08/F-07 [P3] invalid - A stray CLI analytics id in angular.json opts every checkout into usage reporting

**File:** ui/angular.json:6
**Found:** 2026-09-10 by /audit (scope: current; lens: quality)
**Why it matters:** The working tree adds `"analytics": "000e871c-..."` under
`cli` in the tracked workspace config. The Angular CLI wrote it as a side effect
of a local command, not as part of feature 8, and it is unrelated to every step
in the active spec. Because it lives in `angular.json` rather than the user's
global `~/.angular-config.json`, committing it turns on anonymous usage
reporting to Google for anyone who clones the repo and runs an `ng` command,
and it silently attaches this machine's generated id to that stream. It is also
an unexplained diff sitting in the way of a clean feature-8 branch.
**Suggested fix:** revert the hunk (`git checkout -- ui/angular.json`), or set
`"analytics": false` deliberately if the project wants reporting off for
everyone. Do not carry the id into the feature commit.
**Resolution:** Reverted at the user's direction on 2026-09-10, before the
feature 8 review checkpoint. `git diff ui/angular.json` is empty and the file
matches master, so the id never reaches a commit. Recorded `invalid` rather than
`closed` because it was never a defect in committed code: it was uncommitted
tool exhaust that the audit caught in the working tree. Re-confirmed by the
independent pass at 7403265: `git diff master -- ui/angular.json` is empty and
the file carries no `analytics` key, so nothing reached the checkpoint. Status
stands as `invalid`.

### 08/F-08 [P1] closed - The api suite is red at this checkpoint, and the failing test makes a live authenticated upstream call

**File:** api/src/routes/macro.routes.test.ts:318
**Found:** 2026-09-10 by /audit (scope: current; lens: tests)
**Why it matters:** `npm test` in `api/` fails: `1 failed | 65 passed`, expected
`503` and received `200`. The test's own comment states its premise, "the real
config has no credentials in this repository", and that premise is no longer
true. `api/src/config.ts:38-42` reads the credentials from `process.env` at
module load, `api/.env` is now populated, so `macroConfigured` is true and the
route relays a real request to the Core API instead of answering the curated
`503`.

Three separate problems fall out of that. The declared `Test` gate for `api/` is
red at the review checkpoint while the spec is marked `verified`, and the spec's
own build loop requires running this suite "once at the end only to prove that
claim" about `api/` being untouched. A unit suite now performs an authenticated
third-party network call on every run, consuming an Auth0 grant and an upstream
read, which also makes it fail differently offline and in CI. And the assertion
tests the developer's local `.env` rather than the 503 wiring it was written for.

This is not introduced by this delta: `git diff --name-only 64e6b9065779..740326534352 -- api/`
is empty, so the file is byte-identical to its state at the base commit. The
cause is environmental, and configuring the credentials was itself a
prerequisite of this feature, which is why it surfaces here.
**Suggested fix:** make the case explicit rather than ambient. Pass an
unconfigured settings object into `serve()` for this test, the way the sibling
cases already inject `macroConfigured: true`, so the 503 path is exercised
without reading the real environment and without reaching the network.
**Resolution:** Fixed on 2026-09-11 at the user's direction, as a scope addition
to feature 8 recorded as repair step 5 in the spec. The single ambient test was
split so that neither half depends on the local `.env`:
`serve({ macroConfigured: false })` now exercises the 503 path deterministically,
and a second case keeps the zero-injection smoke test but asserts only
`/api/health`, the one route that reaches no upstream either way. `api/` is
green: 67 passed, 6 files, and the suite no longer consumes an Auth0 grant or an
upstream read, so it is offline- and CI-safe again.
Closed by the independent pass at a0f4a01. Re-examined
`api/src/routes/macro.routes.test.ts:313-333` directly: the 503 case now injects
`serve({ macroConfigured: false })`, so `createMacroRouter` short-circuits at its
`configured` guard before any handler and no client call is made; the second case
injects nothing but asserts only `/api/health`, which reaches no upstream under
either configuration. Neither assertion's outcome depends on the contents of the
local env file, and `createTokenProvider` performs no work at construction, so no
grant is requested. `npm test` in `api/` is green (6 files, 67 tests) and
`npm run typecheck` passes. The 503 wiring is still genuinely exercised.

### 08/F-09 [P2] closed - The shared fixture double still models the pre-reconciliation meta shape

**File:** ui/src/app/core/fixtures/fixture-macro-data.provider.ts:113
**Found:** 2026-09-10 by /audit (scope: current; lens: tests)
**Why it matters:** This feature reconciled `EnvelopeMeta` against the live
service and documented, at `ui/src/app/core/macro-contracts.ts:31-38`, that
`/countries` and `/vintages` answer `page: null, pageSize: null`. It also found
that `/vintages` answers `meta.vintages: []`, because that array reports the
provenance of a result and this route's result *is* the vintage list. The
`envelope()` helper still defaults every route to `page: 1`,
`pageSize: DEFAULT_PAGE_SIZE` and `vintages: FIXTURE_VINTAGE_REFS`, and
`countries()` at line 56 and `vintages()` at line 105 both take that default
unchanged.

That is the exact divergence that hid the header-strip bug this feature had to
repair: every fixture-backed spec passed while the strip rendered blank against
the real service. The repair added a one-off `LiveShapeProvider` inline in
`app.spec.ts` and left the shared double wrong. The spec's Testing section
commits features 9 to 13 to this double ("Page specs keep using
`FixtureMacroDataProvider`"), so they inherit a test double that cannot
reproduce the shape the service actually sends.
**Suggested fix:** give `countries()` and `vintages()` the observed meta:
`page: null`, `pageSize: null`, and `vintages: []` on the vintages route. The
null-safe computeds in `observations.ts` and `series.ts` already handle it, so
this should not change a passing assertion.
**Resolution:** Fixed on 2026-09-10. `fixture-macro-data.provider.ts` now
models the observed meta per route: `/countries` unpaginated with populated
provenance, `/vintages` unpaginated with `vintages: []`, `/indicators` paginated
with `vintages: []`, `/observations` and `/series` unchanged, and `/revisions`
reporting only the vintage it was asked about. One correction to this finding:
`/countries` does populate `meta.vintages` live, so emptying it there would have
been wrong; only its paging fields were. `/indicators` also returns
`vintages: []`, which this finding did not mention and the repair covers. Seven
assertions in `fixture-macro-data.provider.spec.ts` lock the per-route shape.
Two pre-existing assertions in that file encoded the old uniform shape and were
retargeted: the envelope test now expects `page: null` on `/countries`, and the
`meta.vintages` test now asks `/countries` instead of `/vintages`.
Re-reviewed by the independent pass at a0f4a01. The original defect is gone:
`/countries` and `/vintages` now answer `page: null, pageSize: null` via
`UNPAGINATED`, `/vintages` and `/indicators` answer `vintages: []`, and seven
assertions in the new `observed meta shape` block lock each route. The two
retargeted assertions were checked and are not weakened: the envelope test's
`page` expectation moved from `1` to `null` on the same route it always asked
(`/countries`), and the paginated default it used to prove is now asserted on
`/indicators`; the `meta.vintages` test changed route but still proves two refs,
one per source, with integer ids. **Held at `fixed` rather than closed** because
the same repair introduced a new defect in the same method it changed, recorded
as F-14. P2 either way, so it does not block.
**Closed** by the third independent pass at cb9b41d. `fixture-macro-data.provider.ts:38`
defines `UNPAGINATED` and `countries()`/`vintages()` both apply it; `vintages()` and
`indicators()` both answer `vintages: []`; `observations()`/`series()` keep real paging
and row-derived provenance. The assertions in the `observed meta shape` block were
re-read against the code rather than against this finding. The defect the repair
introduced (F-14) is itself now verified repaired and closed, so the condition the
previous pass held this entry on no longer holds.

### 08/F-10 [P2] closed - The header strip is the one error slot with no live region, so its message is never announced

**File:** ui/src/app/app.html:11
**Found:** 2026-09-10 by /audit (scope: current; lens: quality)
**Why it matters:** The spec's rendering rule for `detail` is explicit: "Keep
`role="status"` on the slot so the message is announced, as features 3 to 6
established." Every other consumer does. `overview.html:34` gained the attribute
in this very diff, and `countries-indicators`, `observations`, `series` and
`working-query-card` all carry it. The header strip renders
`{{ unavailableMessage() }}` into a plain `<div class="value muted">`. The
message replaces "Loading..." after the request settles, so a screen reader user
gets no announcement of the one text that explains why the console is empty.

The new consumer specs assert the attribute alongside the sentence, five of six
of them: `observations.spec.ts:455`, `overview.spec.ts:241` and their siblings
all check `getAttribute('role')`. `app.spec.ts` is the only one that asserts the
sentence and quietly omits the role, so the gap is invisible from the suite.
**Suggested fix:** add `role="status"` to the strip's value div, or to the
`.vintage-strip` wrapper, and assert it in `app.spec.ts` the way the other five
consumer specs do.
**Resolution:** Fixed on 2026-09-10. `app.html` now carries `role="status"` on
both the loading and unavailable strip nodes, matching the five sibling slots,
and the existing shell spec asserts the role alongside the text so the gap
cannot reopen unnoticed.
Closed by the independent pass at a0f4a01. `ui/src/app/app.html:8-11` carries
`role="status"` on both the loading and the unavailable strip nodes, matching the
five sibling slots, and `app.spec.ts:201-209` asserts the role alongside the
text. No new defect in that file: the unavailable branch renders
`{{ unavailableMessage() }}` through interpolation only, so the server-supplied
`detail` is escaped, and no `innerHTML` or `bypassSecurityTrust*` call exists
anywhere in `ui/src`.

### 08/F-11 [P2] closed - A re-query keeps asserting the previous result, because loading is only reachable once

**File:** ui/src/app/observations/observations.ts:80
**Found:** 2026-09-10 by /audit (scope: current; lens: quality)
**Why it matters:** `loading` is `this.result() === null`, and `result` is a
`toSignal` with `initialValue: null` that retains its last emission. It is
therefore true only before the first response and can never become true again.
`switchMap` unsubscribes the previous inner request when the query changes but
emits nothing until the new response arrives, so for the whole round trip after
a paging click or a query edit the page holds the previous `ready` state: the
head keeps rendering the stale `rowRange()`, the shared card keeps the stale
`resultSummary()`, and the table keeps the old rows, all describing a query that
is no longer the one on screen. `series/series.ts:100` has the identical shape.

Under fixtures that window was zero, because `of()` resolves synchronously,
which is why no spec catches it and why the spec says a flash of the wrong
state "is a real defect now" that this feature is meant to watch for. The
loading branch is now first-render-only rather than per-request.
**Suggested fix:** emit a pending state at the head of each inner request, for
example a `{ status: 'loading' }` member of `ResultState` via `startWith`, so
`loading` tracks the in-flight request rather than the first one only. A spec
needs an asynchronous provider double to cover it.
**Resolution:** Fixed on 2026-09-10 as suggested. Both pages gained a
`{ status: 'loading' }` member and `startWith` at the head of each inner
request, and `loading` now reports `null || status === 'loading'`. Three specs
per page drive a deferred provider double that holds its emission until
released. Verified to be a real regression guard, not a mirror: with
`startWith` removed the new specs fail with `Expected 'Rows 1-22 of 22' to be
'Loading observations...'` and `Expected 22 to be 0`, which is precisely the
stale-result window this finding describes.
Re-reviewed by the independent pass at a0f4a01. The original defect is gone and
the guard is genuine: `observations.ts:66-87` and `series.ts:84-107` place
`startWith<ResultState>({ status: 'loading' })` at the tail of each **inner**
pipe, so it re-emits on every `switchMap` subscription rather than once, and
`loading` is now `state === null || state.status === 'loading'`. The other states
still resolve correctly, because `ready()` narrows on `status === 'ready'` and
every derived computed reads it: during a re-query `rows()` is `[]`, `empty()` is
false (it requires a non-null `ready()`), and `rowRange()` is `''`, while the
template's `loading()` branch is ordered first so it cannot be masked by
`invalid`, `unavailable` or `empty`. The `invalid` path correctly gets no
`startWith`, since `of({ status: 'invalid' })` is synchronous. The three new
`DeferredProvider` specs per page are real guards, not mirrors: they hold the
inner emission until `release()` and then assert rendered DOM text and row
counts, which the implementation cannot satisfy without the per-request loading
state. **Held at `fixed` rather than closed** because the repair introduced a new
user-visible defect on the same code path, recorded as F-13. P2 either way, so it
does not block.
**Closed** by the third independent pass at cb9b41d. The change this finding asked for is
correct and remains correct: `observations.ts:96` and `series.ts:116` place
`startWith<ResultState>({ status: 'loading', previousMeta })` inside the **inner** pipe, so
it re-emits on every `switchMap` subscription, and `loading` is
`state === null || state.status === 'loading'`. The `invalid` branch correctly takes no
`startWith`. The downstream defects this code path has since produced are tracked on their
own entries (F-13, and F-16 raised by this pass); they are not this finding's original
defect, which is gone.

### 08/F-12 [P3] closed - The vintage fixtures use a timestamp format the live service does not send

**File:** ui/src/app/core/fixtures/macro-fixtures.ts:38
**Found:** 2026-09-10 by /audit (scope: current; lens: tests)
**Why it matters:** `macro-contracts.ts:125-129` now records the observed value
as `"2026-09-08T01:00:31.5083586"`, with no zone designator and sub-millisecond
precision, and warns that `new Date(...)` therefore reads it as local time. All
five fixture vintages still carry a `Z` suffix and whole seconds. Nothing renders
`retrievedAtUtc` yet, so nothing is wrong today, but the first feature that
formats it will write and green-light UTC handling against a fixture that already
is UTC, then be an hour or more out against the real service. Same failure mode
as F-09, one field further on.
**Suggested fix:** restate the five fixture timestamps in the observed format so
the double and the contract agree.
**Resolution:** Fixed on 2026-09-10. All five fixture `retrievedAtUtc` values
now use the observed wire format with sub-second precision and no zone
designator. A spec asserts the format across every fixture vintage, so a `Z`
cannot creep back in.
Closed by the independent pass at a0f4a01. All five `retrievedAtUtc` values in
`macro-fixtures.ts:32-72` now match the observed wire format, and
`fixture-macro-data.provider.spec.ts:624-633` asserts a no-zone-designator,
sub-second pattern across every fixture vintage, which rejects a trailing `Z`.
Nothing renders the field yet, so no consumer changed, and the repair introduced
no new defect in that file.

### 08/F-14 [P3] closed - The repaired fixture double cannot report a historical vintage as its revisions provenance, and a new spec locks that in

**File:** ui/src/app/core/fixtures/fixture-macro-data.provider.ts:128
**Found:** 2026-09-11 by /audit (scope: current; lens: tests)
**Why it matters:** Introduced by the F-09 repair. `revisions()` filters
`FIXTURE_VINTAGE_REFS`, which `macro-fixtures.ts:76-78` builds from
`FIXTURE_VINTAGES.filter(isLatest)` and which therefore holds only ids 14 and 13.
The method's own new comment says "Provenance is the one vintage that was asked
about", but for any vintage that is not one of the two latest the filter matches
nothing and `meta.vintages` is `[]`. That is every input the route exists for: a
revisions query is about a superseded vintage, and the live probe this
reconciliation was based on was `/vintages/12/revisions`, an id the double cannot
report. `fixture-macro-data.provider.spec.ts:616` then asserts the wrong shape as
intended behaviour, and its title, "emits no revision provenance for a vintage
that is not the latest", states the defect as the contract while the case it
actually exercises is `-1`, a vintage that does not exist at all. Nothing
consumes `Revision` yet, so nothing is wrong today, which is exactly the F-09 and
F-12 pattern: feature 9 owns revisions rendering and is committed by the spec's
Testing section to this double, so it would inherit a provenance footer that is
empty for every real input.
**Suggested fix:** filter `FIXTURE_VINTAGES` rather than `FIXTURE_VINTAGE_REFS`
and map to a `VintageRef`, so any published vintage reports itself. Keep a case
for an unknown id, under a title that says so, and add one for a real historical
id such as 12.
**Resolution:** Fixed on 2026-09-11. `revisions()` now resolves the asked-about
id from `FIXTURE_VINTAGES` rather than `FIXTURE_VINTAGE_REFS` and maps it to a
`VintageRef`, so any published vintage reports itself, including the superseded
ids that are the only realistic input to a revisions query. The misleading spec
was replaced by two honest ones: a superseded vintage (found via `!isLatest`,
which covers fixture id 12, the id the live probe used) reports itself with its
own label, and a genuinely nonexistent id reports none. The old title claimed to
test "a vintage that is not the latest" while passing `-1`.
**Closed** by the third independent pass at cb9b41d. `fixture-macro-data.provider.ts:129`
resolves the asked-about id from `FIXTURE_VINTAGES` and maps it to a `VintageRef`. Read
against the code, not the finding: `revisions(12)` (superseded, `isLatest: false`) reports
`[{ id: 12, ... }]`, and `revisions(-1)` reports `[]`. The two replacement specs each
exercise the case their titles name, and the superseded case additionally asserts the
label so it cannot pass on a wrong ref. The repair introduced no new defect.

### 08/F-15 [P3] closed - Nothing in either suite would fail if the one-line provider swap were reverted

**File:** ui/src/app/app.config.ts:17
**Found:** 2026-09-11 by /audit (scope: current; lens: tests)
**Why it matters:** The spec's Notes call the swap "the whole point" of the
feature, and it is the only line that chooses live data over fixtures. No test
reads `appConfig`: every page spec provides `MACRO_DATA` itself, and the one
assertion that inspects the token, `app.spec.ts:220-232`, supplies
`FixtureMacroDataProvider` explicitly, so it passes identically either way. The
live evidence that proves the swap works is a manual step-4 observation recorded
in prose, not a repeatable signal. A future edit, or a revert of this line in a
merge, would ship the console on fixtures with 292 green tests and a clean build.
The risk is small, but so is the guard.
**Suggested fix:** one spec that configures a TestBed from `appConfig.providers`
and asserts `TestBed.inject(MACRO_DATA)` is an `HttpMacroDataProvider`, or a
plain assertion over the `providers` array.
**Resolution:** Fixed on 2026-09-11. Added `ui/src/app/app.config.spec.ts`, the
only spec that reads the real `appConfig`: it asserts `MACRO_DATA` resolves to
`HttpMacroDataProvider`, that it is not the fixture double, and that injection
does not throw, which also covers the `provideHttpClient` the swap depends on.
Verified as a real guard: reverting the one-line swap fails it with
`Expected instance of FixtureMacroDataProvider to be an instance of
HttpMacroDataProvider`, where previously the whole suite stayed green.
**Closed** by the third independent pass at cb9b41d. `app.config.spec.ts` is the only
spec that reads the real `appConfig`, and `TestBed.inject(MACRO_DATA)` genuinely resolves
through it, so a reverted swap fails here and nowhere else. The forward-looking hazard in
how it does that (spreading every `appConfig` provider into the TestBed) is recorded as a
remaining risk on the review receipt and does not keep this entry open.

## Independent review

**Status:** passed
**Target commit:** cb9b41d805e522432d4ab85d88a8d639235f2b7d
**Base commit:** 64e6b90657791d9d952e3fe705a3ceeb2e534a7e
**Base ref:** master
**Spec hash:** 09936535d6f2c269ee02fc81bf713e477f8c2dea99e351af340e7431498dc8c7
**Prepared by:** claude
**Builder model:** claude-opus-5[1m]
**Requested reviewer:** claude
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-09-11T09:21:10Z
**Workflow:** regular
**Check required:** no

**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5[1m]
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-09-11T09:31:00Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

## Commands

- `git rev-parse HEAD`, `git merge-base master cb9b41d`, `git status --porcelain`, `sha256sum blueprint/context/current-feature.md`: pass - target, base, spec hash and clean-tree preconditions all matched; only `review.md` differed
- `ui/ npm test` (Karma, headless Chrome): pass - 300 of 300, with three DI deprecation warnings (F-20)
- `ui/ npm run build`: pass - 353.00 kB initial, no diagnostics
- `api/ npm run typecheck`: pass
- `api/ npm test` (Vitest): pass - 67 tests, 6 files, 718 ms, no network round trip

## Evidence

- Reviewed the whole `64e6b9065779..cb9b41d805e5` delta: 34 files, +2609/-116, excluding `review.md` and `findings.md` from the code scope. `api/` changed only in `macro.routes.test.ts`.
- Pager state machine traced by hand through first load, invalid, unavailable, empty, single re-query and back-to-back re-query on both `observations.ts` and `series.ts`. The first five are correct; the sixth is F-16.
- The `Signal<ResultState | null>` annotation is a TypeScript inference fix, not a reactive hazard. Confirmed against the installed runtime that `toObservable` wraps its emission in `untracked` (`@angular/core@20.3.30` `rxjs-interop.mjs:162`), so reading `ready()` inside the `switchMap` projection registers no dependency and cannot loop.
- Cache neutrality holds at the source, not just in the spec: `http-macro-data.provider.ts` sets no headers on any route, adds no parameter, and `withFetch()` leaves the fetch cache mode at its default. CSV serialisation verified in `macro-params.ts` (`join(',')`, never `append`) and asserted end to end through `urlWithParams`.
- Error boundary: `MacroRequestError` carries only `status` and `detail`; `problemDetail` accepts a non-array object with a non-empty string `detail` and nothing else; all six consumers render it through interpolation with `role="status"`, no `innerHTML` and no `bypassSecurityTrust*`. No `Authorization` header, cookie or credential is introduced in the client. `api/.env` was not read.
- `revisions()` re-checked against the code: resolves from `FIXTURE_VINTAGES`, so a superseded id reports itself and a nonexistent id reports none; the two replacement specs each exercise the case their title names.
- `app.config.spec.ts` genuinely resolves `MACRO_DATA` through the real `appConfig`, so a reverted swap fails there and nowhere else.
- Nullable `meta.page`/`meta.pageSize` handled correctly: `this.ready()?.meta.page ?? this.query().page` falls back on a null value as well as a null state.

## Findings

- F-16 [P2] open - back-to-back re-queries drop the held `meta`; footer renders "Page N of 1" with Next dead (`observations.ts:76`, `series.ts:96`)
- F-17 [P2] open - the series half of the F-13 guard passes with the defect reinstated (`series.spec.ts:498`)
- F-18 [P2] open - the duplicated result state machine across both result pages, now repaired in lockstep three times (`series.ts:13`)
- F-19 [P3] open - the indicator catalogue keeps the previous filter's result across a re-query (`countries-indicators.ts:189`)
- F-20 [P3] open - `useClass` on an inherited-decorator test double trips a scheduled-to-become-error DI deprecation (`app.spec.ts:284`)
- Closed this pass: F-09, F-11, F-14, F-15
- Held at `fixed`: F-13, because its repair introduced F-16
- Unchanged pre-existing `api/` context, not re-reviewed this pass: F-02, F-03, F-04, F-06 (all `open`, P2/P3), F-07 (`invalid`)

## Remaining risk

- No `Verify` command is declared, so there is no single gate covering both packages; each suite was run from its own directory.
- No lint command exists in either package, so standards drift has no automated signal.
- No browser-test command exists. Every loading, pager and error state was judged from source and from Karma DOM assertions, never from a real round trip; the live evidence behind the contract reconciliation is prose in the spec, not a repeatable signal.
- `/check` was not required and was not run, so no state was proved against the running app.
- F-16 is reasoned from the code path rather than executed: writing the spec that demonstrates it is outside a reviewer's boundary. The reasoning is that `ready()` is null in the `loading` state, which the code and the existing specs both establish.
- `app.config.spec.ts` spreads every `appConfig` provider into the TestBed. That is what makes it a real wiring proof, but it also means any provider later added to `appConfig` executes for real in a unit test, and `provideHttpClient(withFetch())` is already in that list - a future `provideAppInitializer` that fetches would make a live request from the suite.
- Both result pages depend on `toObservable` never emitting synchronously: `this.ready()` is read inside the `switchMap` projection but declared after `result`, so a synchronous source would throw at construction. It holds today and is not a defect, but the constraint is undocumented in the code.
- `revisions(vintageId)` interpolates its id straight into the path. It is typed `number` and sourced from service data, and nothing calls it yet, so there is no reachable defect; it is worth a guard before feature 9 consumes it.
- No dependency or vulnerability scanner is configured; no claim is made about third-party CVEs.
