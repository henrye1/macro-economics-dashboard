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

### F-21 [P3] open - The held page count belongs to the previous query after a filter change, not just a paging click

**File:** ui/src/app/core/result-state.ts:99
**Found:** 2026-09-11 by /audit (scope: full; lens: quality)
**Why it matters:** `heldMeta` keeps the last settled `meta` so the pager does
not collapse to "Page 1 of 1" mid-flight, which is right for a paging click:
the count genuinely does not change between page 2 and page 3 of one result.
It is not right for a filter change. Adding a country or narrowing the years
asks a different question with a different total, and `patch()` resets `page` to
1, so the footer reads "Page 1 of 7" while loading a query that may return one
page. That is stale rather than false, so it is strictly better than the F-13
and F-16 behaviour it replaced, and no spec contradicts it. But it is the third
distinct answer this pager has given to the same question, and the honest
options are narrowing: hold the count only when the non-paging part of the query
is unchanged, or render no count at all while loading. Nothing consumes a wrong
value today; the footer is the only reader.
**Suggested fix:** clear `heldMeta` when the request changes in any way other
than `page`, so a filter change falls back to the no-count state and a paging
click keeps the hold. Do it with the pager's third behaviour change, not as a
fourth standalone patch.
**Resolution:**

### F-26 [P2] fixed - The revisions pager disappears on every page change, and its count collapses behind it

**File:** ui/src/app/vintages/vintages.html:118
**Found:** 2026-09-11 by /audit (scope: full; lens: quality)
**Why it matters:** The revisions table and `app-paging-footer` sit inside the
final `@else` of a chain whose first branch is `revisionsLoading()`. Clicking
Next therefore unmounts the pager for the whole round trip: the button vanishes
from under the pointer, the layout jumps, and the control the user is operating
is missing until the answer lands. Observations and Series render their footer
unconditionally for exactly this reason, so this tab is the only one of the three
that behaves this way.

Behind it is the shape F-13 and F-16 named. `pageCount` at
`vintages.ts:221` reads `readyRevisions()?.totalCount ?? 0`, and `readyRevisions`
is null in the loading state, so the count collapses to 1 while `currentPage`
still reports the page the user asked for. That is invisible today only because
the pager is unmounted at the same moment. Moving the footer out of the `@else`
to match the other two tabs, which is the obvious repair for the first half,
would immediately render `Page 3 of 1` with Next disabled. The two halves have to
be fixed together.

`createResultState` solved this for the other tabs by carrying the last settled
`meta` on the loading state. This page has its own pipeline, correctly so, but it
did not carry that lesson across.
**Suggested fix:** hold the last settled `totalCount` the way `result-state.ts`
holds `meta` — a value kept outside the stream, updated when an answer settles,
read while one is in flight — then render the footer unconditionally like the
other two result tabs. Add a spec that pages and asserts the footer text
mid-flight, as `observations.spec.ts` already does.
**Resolution:** Fixed on 2026-09-11 as suggested. The loading state carries
`previousTotal`, captured where the inner pipe is built, and a `pagerTotal`
computed feeds `pageCount`; `app-paging-footer` now sits outside the state chain
like the other two result tabs. `ListState` is shared with the vintages list,
which passes `previousTotal: null` because it issues one request and has no pager.

Both halves were probed separately, because they fail in different ways.
Reinstating the collapse produced
`Expected 'Page 2 of 1 · pageSize 25 · vintages WDI 2026-03-27' to contain
'Page 2 of 4'` — the finding's predicted string, from one spec. Moving the footer
back inside the `@else` failed four specs on a missing element. One correction
to the done-when: the "Prev stays reachable" case does **not** guard the collapse.
With `pageCount` at 1 and `page` at 2, `canPrev` is still `page > 1`, so Prev
stays enabled either way; it failed only in the unmount probe. It is kept as a
guard against a neighbouring regression, not claimed as evidence for this one.

The specs needed a deferred provider double, which `vintages.spec.ts` did not
have: `CountingProvider` resolves synchronously, so the in-flight window was
zero-width. That is the same reason this defect, and F-11, F-13 and F-16 before
it, reached a green suite.

### F-27 [P3] fixed - The summary strip ignores the Significant only filter it sits beneath

**File:** ui/src/app/vintages/vintages.ts:243
**Found:** 2026-09-11 by /audit (scope: full; lens: quality)
**Why it matters:** `appeared` and `disappeared` derive from `views()`, the whole
page, while the table above them renders `rows()`, the page filtered by the
`Significant only` toggle. An appeared or disappeared row can never be
significant, because its change is null, so switching the filter on empties those
rows from the table while the panels beneath keep listing the same series. The
reading is then "no significant changes on this page" directly above "series that
appeared: LENDING_RATE · MUS · 2010–2024", which invites the conclusion that the
appeared series was filtered out for being insignificant rather than being a
different kind of thing entirely.

Defensible as designed — the panels summarise the page, not the filtered view,
and the titles do say "this page" — which is why this is P3 rather than a
correctness bug. But the two regions currently answer different questions from
the same toggle with no visible cue.
**Suggested fix:** either derive the panels from `rows()` so the filter reaches
them consistently, or leave them on `views()` and say so in the panel titles, for
example "this page · unfiltered". The second is likely the better product answer
because appeared and disappeared series are the one thing the significance filter
can never surface.
**Resolution:** Fixed on 2026-09-11 with the second option, and the first was
rejected on the reasoning this finding itself raised: an appeared row's change is
null, so it can never be significant, and routing the filter through the panels
would make `Significant only` permanently delete the one category it can never
surface. The titles now read `Series that appeared · this page, unfiltered` and
the same for disappeared. A spec asserts both titles and the behaviour the label
explains: with the filter on, every table row carries a Significant pill while the
appeared panel still lists its entry.
