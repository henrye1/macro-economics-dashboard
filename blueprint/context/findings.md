# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to merge while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

### F-02 [P2] open - Neither upstream fetch has a timeout, and a stalled token request wedges every macro route

**File:** api/src/macro/token-provider.ts:48
**Found:** 2026-09-09 by /audit (scope: current; lens: performance)
**Why it matters:** Neither the Auth0 POST nor the Core API GET passes an
`AbortSignal`, so both rely on undici's 300 second default header timeout. For
the token provider that is compounded by the shared `inFlight` promise: if Auth0
accepts the connection and then stalls, every concurrent and subsequent
`getToken()` awaits the same unsettled promise, so the whole `/api/macro` surface
hangs for up to five minutes instead of returning the curated `502`. Also
affects api/src/macro/macro-client.ts:78.
**Suggested fix:** pass `signal: AbortSignal.timeout(ms)` on both fetches, with a
shorter budget for the token call than for the upstream read.
**Resolution:** Still open at 64e6b90, re-confirmed by this pass. Neither
`token-provider.ts:47` nor `macro-client.ts:72` passes a `signal`, and the
shared `inFlight` at `token-provider.ts:93` still hands one stalled promise to
every waiter. P2, so it does not block.

### F-03 [P2] open - invalidate() clears the cache unconditionally, so a 401 storm fires one token request per caller

**File:** api/src/macro/token-provider.ts:102
**Found:** 2026-09-09 by /audit (scope: current; lens: performance)
**Why it matters:** `invalidate()` sets `cached = null` without regard for which
token the caller was holding. With N concurrent requests all carrying the same
token that the upstream has just started rejecting, each one invalidates in turn,
and a caller whose `invalidate()` lands after a peer's refresh has already
repopulated the cache wipes that fresh token and starts another grant. The
single-flight guarantee the spec asks for holds for the cold-start path, and the
concurrency test proves it, but not for the retry path, which is the path a token
revocation actually exercises. The result is up to one Auth0 grant per in-flight
request, which is the rate-limit risk the module's own comment says it exists to
avoid.
**Suggested fix:** take the stale token as an argument, `invalidate(token)`, and
clear the cache only when `cached?.token === token`.
**Resolution:** Still open at 64e6b90, re-confirmed by this pass. `invalidate()` at
`token-provider.ts:101-103` still clears unconditionally and takes no argument.
It also leaves `inFlight` untouched, so a late invalidation can discard a token
a peer refresh has already cached. P2, so it does not block.

### F-04 [P2] open - The guide's single-indicator lookup is not proxied and answers a misleading local 404

**File:** api/src/routes/macro.ts:20
**Found:** 2026-09-09 by /audit (scope: current; lens: quality)
**Why it matters:** `CONSUMER-GUIDE.md` section 4.2 documents
`GET /api/macro/indicators/{code}` as part of the consumer surface, and the
section 8 error table lists its `404` ("Unknown indicator on
`/indicators/{code}`"). `READ_ROUTES` registers only the five collection paths,
so `/api/macro/indicators/GDP_GROWTH_REAL` matches no route, falls through to the
shared `notFound`, and returns `{ error: 'Not Found', path: ... }`. The console
cannot reach a documented endpoint, and the failure is indistinguishable from a
typo in our own router rather than the relayed upstream answer. The spec's In
scope list names five routes plus revisions and never mentions this one, so it
reads as an oversight rather than a deliberate exclusion.
**Suggested fix:** either add `/indicators/:code` to the relay, where the code is
opaque to us in the same way the query string is, so no new validation is needed,
or record the omission explicitly in the spec and the overview so feature 8 does
not plan around it.
**Resolution:** Still open at 64e6b90, re-confirmed by this pass against the guide: section
4.2 documents `GET /api/macro/indicators/{code}` and the section 8 table lists
its `404`, while `READ_ROUTES` at `macro.ts:20-26` registers only the five
collections. The repair commit added neither the route nor an explicit
exclusion note, so the omission is still unrecorded. P2, so it does not block.

### F-06 [P3] open - The relay buffers each upstream body twice instead of streaming it

**File:** api/src/macro/macro-client.ts:117
**Found:** 2026-09-09 by /audit (scope: current; lens: performance)
**Why it matters:** `read()` does `await response.text()`, and `res.send` then
converts that string to a Buffer for any payload of 1000 bytes or more, so a
response is held twice in memory before the first byte reaches the caller. Guide
section 6 explicitly steers bulk consumers to `pageSize=5000`, which is exactly
the payload size where this matters most for a service whose only job is to move
bytes. Impact is unquantified: no load evidence exists and the deployment target
is not configured yet.
**Suggested fix:** if this shows up under real payloads, pipe `response.body`
through to `res` instead of materialising the text. Not worth doing on
speculation.
**Resolution:** Still open at 64e6b90, re-confirmed by this pass, with one correction to the mechanism recorded earlier:
the repair replaced `res.send` with `res.end`, so the second copy is now made
by Node converting the string for the socket rather than by Express's
1000-byte Buffer threshold. `macro-client.ts:110` still does
`await response.text()`, so the body is still fully materialised before the
first byte leaves. Impact remains unquantified, no load evidence exists, and
there is still no deployment target. P3, so it does not block.

### F-13 [P2] fixed - The paging footer claims "Page 1 of 1" for the whole round trip after every paging click

**File:** ui/src/app/observations/observations.ts:155
**Found:** 2026-09-11 by /audit (scope: current; lens: quality)
**Why it matters:** Introduced by the F-11 repair. `page` is
`this.ready()?.meta.page ?? 1`, and `ready()` is now deliberately null while a
request is in flight, so for the whole of every re-query the footer reports page
1. `pageCount` collapses the same way (a null `ready()` returns 1) and
`vintageLabels()` becomes an em dash. `PagingFooter` derives `canPrev` from
`page() > 1` and `canNext` from `page() < pageCount()`, so both buttons are
disabled too. A user on page 3 who clicks Prev therefore reads
"Page 1 of 1 - pageSize 25 - vintages -" until the answer lands, then sees it
snap to "Page 2 of N": the footer states a page and a page count that were never
asked for and were never true. Before F-11 that window held the previous, at
least plausible, numbers; the repair removed the stale state and replaced it with
a wrong one. `paging-footer.ts:10-13` names the states that legitimately report
page 1 of 1, "empty, invalid, unavailable", and `loading` is a fourth state that
inherited a fallback written for three. The asymmetry is the tell: `pageSize`
already falls back to `this.query().pageSize`, the size the user asked for, while
`page` falls back to a literal `1` even though `this.query().page` holds the page
the user asked for. Zero-width under fixtures, a full round trip over HTTP, which
is the same reason F-11 itself went unnoticed. No spec asserts the footer during
loading, on either page. Identical code at ui/src/app/series/series.ts:160.
**Suggested fix:** fall back to the working query on both pages, as `pageSize`
already does: `this.ready()?.meta.page ?? this.query().page`, and either hold the
previous `pageCount` or disable the controls deliberately rather than by
accident. Add one spec per page driving the existing `DeferredProvider` to assert
the footer text mid-flight. That the same one-line defect has to be fixed in two
files is itself the signal that the two pages' duplicated state machine wants
extracting; this delta widened that duplication by about ten lines.
**Resolution:** Fixed on 2026-09-11. Both pages now carry the last settled
`meta` on the loading state (`{ status: 'loading'; previousMeta }`) and derive
the pager from a new `pagerMeta` computed, while `page` falls back to
`this.query().page` the way `pageSize` already fell back to
`this.query().pageSize`. The footer therefore reports the page the user asked
for, out of the count last known to be real, and `PagingFooter` keeps Prev
reachable instead of disabling both controls by accident. `result` needed an
explicit `Signal<ResultState | null>` annotation because the pipeline now reads
its own previous value. Verified as a real guard: reinstating the literal `1`
fails the new specs with
`Expected 'Page 1 of 1 - pageSize 25 - vintages -' to contain 'Page 2 of'`,
which is this finding's described defect verbatim. The observations block was
reseeded with the 56-row design query so the page count is genuinely greater
than one; the series tab groups into 4 series under a single page of 25, so its
spec proves the page number only and says so. The duplicated state machine this
finding flags remains duplicated - extracting it is a refactor beyond this
feature and is not recorded as done.
Re-reviewed by the third independent pass at cb9b41d. The described defect is gone for a
single re-query: `pagerMeta` (`observations.ts:108`, `series.ts:128`) returns the settled
`meta` when there is one and the loading state's `previousMeta` otherwise, and `page` now
falls back to `this.query().page`. **Held at `fixed` rather than closed** because the repair
introduced a new defect on the same lines, recorded as F-16: `previousMeta` is captured
from `ready()`, which is null during a re-query, so a second re-query issued before the
first settles carries `null` forward and the footer collapses again. P2 either way, so it
does not block.

### F-16 [P2] fixed - A second re-query issued before the first settles loses the held meta, and the footer collapses to "Page N of 1"

**File:** ui/src/app/observations/observations.ts:76
**Found:** 2026-09-11 by /audit (scope: current; lens: quality)
**Why it matters:** Introduced by the F-13 repair. The loading state's
`previousMeta` is captured as `this.ready()?.meta ?? null`, read inside the
`switchMap` projection. `ready()` is non-null only in the settled state, so the
capture works for the **first** re-query and fails for every one issued while a
request is already in flight: the projection then sees the `loading` state,
reads `null`, and emits `{ status: 'loading', previousMeta: null }`. `pagerMeta`
returns null, `pageCount` falls to 1, and `page` still reads
`this.query().page`, so from page 2 a second Next click renders
`Page 3 of 1 - pageSize 25 - vintages -` with Next disabled until the answer
lands. That is the same false statement F-13 named, and now a
self-contradictory one. It is not paging-specific: any two working-query
mutations inside one round trip (two catalogue clicks, a year edit followed by a
source change) take the same path, and over real HTTP that window is a full
round trip. Identical code at ui/src/app/series/series.ts:96. Neither page's
specs exercise two in-flight re-queries in a row - each `DeferredProvider` test
releases the first request before changing the query again - which is why a
green suite does not cover it.
**Suggested fix:** capture the value the pager is already deriving rather than
the settled state: `const previousMeta = this.pagerMeta();` on both pages, which
chains the held meta through consecutive loading states. Add one spec per page
that calls `setPage(2)` then `setPage(3)` without releasing, and asserts the
footer still reports the real count.
**Resolution:**
**Resolution:** Fixed on 2026-09-11 by the shared extraction. The held `meta`
now lives in the pipeline itself (`heldMeta` in `core/result-state.ts`), updated
in a `tap` when an answer settles and read when each inner pipe is built, so it
chains through any number of consecutive in-flight re-queries instead of being
lost on the second. Worth recording: the literal suggested fix,
`previousMeta = this.pagerMeta()`, does not compile in the extracted form - it
reintroduces the circular inference the page code needed an explicit
`Signal<ResultState | null>` annotation to work around. Holding the value
outside the stream removes the cycle rather than annotating around it. Verified
by simulating the defect (clearing the hold after one read): three specs fail
with `Expected 1 to be 3`.

### F-17 [P2] fixed - The series tab's half of the F-13 guard cannot fail, so that page's pager repair is unproven

**File:** ui/src/app/series/series.spec.ts:498
**Found:** 2026-09-11 by /audit (scope: current; lens: tests)
**Why it matters:** The spec derives `settledCount` from the settled footer and
then asserts `expect(loading).toContain('of ' + settledCount)`. On the series
tab the fixtures group into 4 series under a single page of 25, so
`settledCount` is `'1'` and the assertion reduces to "the footer contains
`of 1`" - exactly what the collapsed, defective footer also produces. Reinstate
the F-13 defect on `series.ts` alone and this spec still passes. The spec's own
comment concedes the page count "cannot be exercised here", but the assertion
was left in, which reads as coverage it does not provide. The observations tab
is genuinely covered (56 rows, `settledCount` 3, plus an explicit
`not.toContain('Page 1 of 1')`); the series tab is covered for the page
*number* only. Because the two pages carry a verbatim copy of the same state
machine (F-18), the weaker of the two tests is the one guarding the copy that is
easier to forget.
**Suggested fix:** either seed a query whose series count exceeds one page so
the count assertion can fail, or drop the `of ' + settledCount` assertion and
state plainly that the count is not exercised on this tab. Do not leave an
assertion that the defect satisfies.
**Resolution:**
**Resolution:** Fixed on 2026-09-11. The degenerate
`toContain('of ' + settledCount)` is gone, replaced by a comment stating plainly
that the page count is not exercisable on this tab and naming where it is
covered instead: `core/result-state.spec.ts` drives the shared machine with a
61-row answer, and the observations tab has 56 rows. The page-number assertion
in the same spec was always a genuine guard and remains; reinstating the F-13
defect still fails it.

### F-18 [P2] fixed - Observations and Series carry a verbatim copy of the same result state machine, and every repair has had to be made twice

**File:** ui/src/app/series/series.ts:13
**Found:** 2026-09-11 by /audit (scope: current; lens: quality)
**Why it matters:** `observations.ts:13-198` and `series.ts:13-203` hold the
same `ResultState` union, the same doc comments, the same `request`, `result`,
`pagerMeta`, `loading`, `invalid`, `unavailable`, `unavailableMessage`, `ready`,
`page`, `pageSize`, `pageCount` and `vintageLabels` members and the same
`prev`/`next`, differing only in the provider method, the payload field name and
two strings. This is not incidental similarity: three consecutive repairs on
this feature (F-11, F-13, and F-16 raised by this pass) have each had to be
applied identically in both files, and the delta under review widened the
duplication by roughly forty lines. F-13's own suggested fix already named the
pattern. The risk is now measurable rather than theoretical: the copies have
begun to diverge in their **tests** rather than their code (F-17), which is the
configuration in which one file silently keeps a defect the other loses.
**Suggested fix:** extract the shared machine once, for example a
`resultState(source, fallbackMessage, store)` helper in `core/` returning the
state signal plus the pager computeds, and have both pages supply only the
provider call and their wording. Do it before feature 11 or 12 adds a third
consumer, not during one.
**Resolution:**
**Resolution:** Fixed on 2026-09-11. `ui/src/app/core/result-state.ts` now owns
the union, the pipeline, and the `loading`/`invalid`/`unavailable`/`settled`/
`items`/`totalCount`/`page`/`pageSize`/`pageCount`/`vintageLabels` signals plus
`prev`/`next`. Both pages call `createResultState<T>({ fetch, unavailable })` and
keep only what is genuinely theirs: `rows`/`rowRange` on observations,
`total`/`views` on series, and each tab's own `resultSummary` wording. The two
pages lost 279 lines and gained 58; the extracted module is 198, so total
production lines are roughly level while the duplicated logic goes from two
copies to one owner. No template changed and no existing spec was rewritten
except F-17's. F-16 was then repaired once, in the shared code, which is the
whole point.

### F-19 [P3] open - The indicator catalogue still holds the previous filter's result for a whole round trip, which is the defect F-11 fixed on the other two lists

**File:** ui/src/app/countries-indicators/countries-indicators.ts:189
**Found:** 2026-09-11 by /audit (scope: current; lens: quality)
**Why it matters:** `catalogueLoading` is `this.catalogueState() === null`, the
exact shape F-11 identified and repaired on `observations.ts` and `series.ts`:
true before the first response and never again. The catalogue is re-queried
through `switchMap` on every debounced search, category or source change, so
once requests are real the list and its head count keep describing the previous
filter for the whole round trip. It is less severe than F-13 because the list
and the count stay consistent with each other, so the page is stale rather than
self-contradictory, and holding results under a search box is a defensible
choice - but it is a choice this code never makes explicitly, and the repair
this feature applied to the other two re-queried lists was not applied here.
**Suggested fix:** either give `catalogueState` the same per-request loading
member, or record in the component's doc comment that holding the previous
catalogue during a re-query is deliberate, so the next reader does not have to
re-derive the question.
**Resolution:**

### F-20 [P3] open - A test double registered with useClass trips an Angular DI deprecation that is scheduled to become an error

**File:** ui/src/app/app.spec.ts:284
**Found:** 2026-09-11 by /audit (scope: current; lens: tests)
**Why it matters:** `LiveShapeProvider extends FixtureMacroDataProvider` and is
registered with `useClass` at `app.spec.ts:328` and `:343`, so Angular
instantiates it through a decorator it inherits rather than declares. `npm test`
prints, three times, `DEPRECATED: DI is instantiating a token
"LiveShapeProvider" that inherits its @Injectable decorator but does not provide
one itself. This will become an error in a future version of Angular.` It is the
only deprecation warning the suite emits, and it is new in this delta. Every
other double in the suite avoids it by using `useValue` with an already
constructed instance.
**Suggested fix:** register it as `useValue: new LiveShapeProvider()`, matching
the surrounding specs, or add `@Injectable()` to the class.
**Resolution:**
