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

### F-22 [P3] open - A no-op query mutation re-issues the request, and feature 10 will make that reachable

**File:** ui/src/app/core/working-query.store.ts:95
**Found:** 2026-09-11 by /audit (scope: full; lens: performance)
**Why it matters:** `patch()` always spreads into a new object, so
`setSource('preferred')` on a query already set to `preferred` produces a new
`WorkingQuery` identity. `apiQuery` recomputes, `request` returns a fresh object,
`toObservable` emits, and a full HTTP round trip is issued for a query that did
not change. `setPage` has the same shape. `addTo` and `removeFrom` are already
guarded and return `current` unchanged on a no-op, which is what makes the gap
in `patch` look accidental rather than considered.

Not reachable from the UI today, which is why this is `unverified` in substance
and P3 in severity: every caller is a `<select>` or number `(change)` handler,
and those fire only on a real change. Feature 10 changes that. Reloading a saved
query means writing a whole `WorkingQuery` back through these setters, and
reloading the query you are already looking at is the ordinary case.
**Suggested fix:** compare before updating in `patch` and `setPage`, returning
`current` when nothing changed, exactly as `addTo` already does. Cheaper than
adding equality to the `apiQuery` computed, and it keeps the guarantee in the
one place that owns mutation.
**Resolution:**

### F-23 [P3] fixed - The shared result API is named with an Observable convention but returns only Signals

**File:** ui/src/app/core/result-state.ts:36
**Found:** 2026-09-11 by /audit (scope: full; lens: quality)
**Why it matters:** The exported interface is `ResultState$<T>`. In Angular and
RxJS code a `$` suffix means an Observable, and every member of this interface is
a `Signal` or a plain function. The codebase has no other `$`-suffixed symbol, so
the convention is being introduced by this one name and introduced incorrectly.
It is also never written at a call site: both pages infer it, and a sweep for the
identifier outside its own file returns nothing, so the misleading name survives
precisely because nothing has to read it yet. Features 9 to 12 are the ones that
will read it.
**Suggested fix:** rename to `ResultState` (the private union it collides with
can become `ResultStatus` or move inline) or `ResultSignals`. Rename only; there
is no behaviour here.
**Resolution:** Fixed on 2026-09-11. `ResultState$` is now `ResultSignals`, the
private union `ResultState` is `ResultStatus`, and `ResultStateConfig` is
`ResultSignalsConfig`. `createResultState` and the file name are unchanged: the
function was never misnamed.

**One claim in this finding was wrong, and the correction matters.** It stated
that a sweep for the identifier outside its own file returned nothing. The sweep
was run as `grep "ResultState$"`, where the unescaped `$` anchors to end of line,
so it matched nothing anywhere and the zero result was meaningless rather than
informative. `result-state.spec.ts` imports the name and annotates `let state`
with it, so the misleading name already had two readers. The finding's conclusion
holds and is slightly strengthened; only its evidence was bad.

Changed files are exactly `result-state.ts` and `result-state.spec.ts`, and the
spec's entire diff is the two lines that name the type. `ui`: 317 tests pass,
build clean, both typechecks clean.
