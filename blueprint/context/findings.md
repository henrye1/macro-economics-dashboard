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

### F-24 [P3] fixed - sameWorkingQuery is not exhaustive by construction, so a new query field would be silently ignored

**File:** ui/src/app/core/working-query.ts:92
**Found:** 2026-09-11 by /audit (scope: full; lens: quality)
**Why it matters:** The comparison lists all nine fields of `WorkingQuery` by
hand. Adding a tenth field compiles cleanly: `DEFAULT_WORKING_QUERY` fails
typecheck until the field is given a default, which is the safety net people will
notice, but `sameWorkingQuery` does not, and neither does anything else. The
store would then treat a mutation of that field as a no-op and refuse it
outright. That is strictly worse than the wasted request F-22 removed: a swallowed
mutation is a control that does nothing, and the suite would stay green because
no spec can know about a field that does not exist yet.

Its own doc comment already warns a reader to keep the list in step, which is an
admission that nothing enforces it. Feature 10 is the likely trigger: a saved
query wants an identifier or a name on the working query, and both are fields a
user can change.
**Suggested fix:** make the key list checkable by the compiler, for example
`const COMPARED = { indicators: true, ... } satisfies Record<keyof WorkingQuery, true>`
and iterate it, or destructure the parameter so an unhandled field is an unused
binding. Either turns the next added field into a compile error instead of a
silently dead control.
**Resolution:** Fixed on 2026-09-11 with the first suggestion. `COMPARED` in
`working-query.ts` lists the nine keys under
`satisfies Record<keyof WorkingQuery, true>`, and `sameWorkingQuery` iterates it,
dispatching on `Array.isArray` so a future array field gets content comparison
rather than identity by default. `===` was kept over `Object.is`; they differ on
`-0` and this was a no-behaviour change.

The second suggestion does not work here and should not be retried:
`ui/tsconfig.json` does not set `noUnusedLocals`, so an unhandled destructured
field is not an error and would enforce nothing.

Verified by probe, since no test can observe a field nobody has added. Adding
`savedQueryName: string` to `WorkingQuery` fails with
`TS1360 ... 'savedQueryName' is missing in type ... Record<keyof WorkingQuery, true>`
at `COMPARED`; misspelling a key as `pageSizze` fails with `TS2561`, so the guard
holds in both directions. A runtime companion spec drives a sentinel value
through every key of `DEFAULT_WORKING_QUERY` and asserts each is compared, which
catches drift within a single compile. No existing assertion was edited: `ui`
419 tests, up from 418 by exactly the one added.

### F-25 [P3] open - The store has four mutation paths and three different no-op guards

**File:** ui/src/app/core/working-query.store.ts:74
**Found:** 2026-09-11 by /audit (scope: full; lens: quality)
**Why it matters:** After the F-22 repair the store guards no-op mutations three
different ways. `patch` and `setPage` compare through `settle`. `addTo` and
`removeFrom` keep their own inline `includes` check, which is equivalent but
separate. `reset()` at line 74 has no guard at all: it assigns
`DEFAULT_WORKING_QUERY` by reference, so resetting a query that is structurally
default but a different object, which is what "add an indicator, remove it,
press Reset" produces, mints a new identity and notifies every reader.

Nothing breaks today. That reset case ends with an empty `indicators`, so
`validation()` is invalid, `request` is null and no HTTP goes out; the cost is
recomputation, not a round trip. The concern is structural rather than current:
F-22 existed because one mutator was written without the guarantee the others
had, and the repair left the surface in the same shape it was in when that
happened. Feature 10 adds the mutator most likely to repeat it, because loading a
saved query writes the whole object at once.
**Suggested fix:** route every mutation through `settle`, including `reset`
(`settle(current, DEFAULT_WORKING_QUERY)`) and the two array helpers, so the
guarantee is a property of the store rather than a habit each method has to
remember. The inline `includes` checks then become redundant and can go.
**Resolution:**
