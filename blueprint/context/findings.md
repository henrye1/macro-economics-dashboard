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
**Resolution:** Still open, re-confirmed at 1b47282 by the 2026-09-11 full pass. Neither
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
**Resolution:** Still open, re-confirmed at 1b47282 by the 2026-09-11 full pass. `invalidate()` at
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
**Resolution:** Still open, re-confirmed at 1b47282 against the guide: section
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
**Resolution:** Still open, re-confirmed at 1b47282, with one correction to the mechanism recorded earlier:
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
**Resolution:** Still open, re-confirmed at 1b47282.
`countries-indicators.ts:190` still reads `catalogueState() === null`. P3, so it
does not block.

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
**Resolution:** Still open, re-confirmed at 1b47282. `LiveShapeProvider` is still
registered with `useClass` at `app.spec.ts:345` and `:360`. One correction to the
finding's scope: `FailingMacroDataProvider` at `:212` has the same shape and the
same inherited decorator, so the repair should cover both rather than only the
class the warning happened to name.

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
**Resolution:** Still open, re-confirmed at 1b47282. `heldMeta` at
`result-state.ts:101` survives any request change, not only a paging click. This
pass adds one detail: `pageCount` divides the held `totalCount` by `pageSize()`,
which falls back to `store.query().pageSize` while loading, so changing the page
size mid-flight computes a count from two different queries' numbers. Same defect,
same repair. P3, so it does not block.

### F-29 [P3] open - The revisions pager holds the previous vintage's page count while a different vintage loads

**File:** ui/src/app/vintages/vintages.ts:158
**Found:** 2026-09-11 by /audit (scope: full; lens: quality)
**Why it matters:** `previousTotal` is read from the settled state wherever the
inner pipe is built, which is correct for a paging click and wrong for a
selection change. `select()` at `vintages.ts:128-133` sets a new vintage and
resets `page` to 1, but the new request still inherits the old vintage's
`totalCount`, so the footer reads "Page 1 of 114" while loading a vintage that
may have four pages. Strictly better than the collapse F-26 fixed, and stale
rather than false, but it is the same question F-21 raises about
`result-state.ts` and neither finding names this file.
**Suggested fix:** carry `previousTotal` only when the in-flight request differs
from the settled one by `page` alone, and pass null on a selection change. Do it
with F-21, not separately: they are one rule applied in two pipelines.
**Resolution:**

### F-30 [P3] open - The service-token pill shows a health dot that is never driven by anything

**File:** ui/src/app/app.html:18
**Found:** 2026-09-11 by /audit (scope: full; lens: quality)
**Why it matters:** `<span class="dot"></span>` is styled at `app.scss:73-78`
with `--accent-bright` and no state binding, so it renders the same green dot
whether the API is reachable or not. The vintage strip immediately to its left
does report failure, so the two sit side by side saying different things when
`/api/macro/vintages` is down. In a console whose subject is provenance, a
decorative affordance shaped exactly like a status light is the wrong kind of
wrong. Nothing reads a stale value, so this is presentation only.
**Suggested fix:** either bind the dot to a real signal - the same request the
vintage strip already makes is the cheapest honest source - or drop the dot and
keep the label, which already says what the pill is for.
**Resolution:**

### F-31 [P2] open - The only code that actually writes a file has no test and revokes its URL before the browser may have read it

**File:** ui/src/app/core/export/export.service.ts:161
**Found:** 2026-09-11 by /audit (scope: full; lens: tests)
**Why it matters:** `EXPORT_DOWNLOADER` is overridden in every spec, which is
right for the service's logic and leaves `anchorDownload` itself with zero
coverage. That would be acceptable for a trivial adapter, but this one takes two
shortcuts known to be fragile outside Chromium: the anchor is never appended to
the document, and `URL.revokeObjectURL` runs synchronously on the line after
`click()`. Chromium takes a reference during the click, so it works there — which
is exactly why it would pass by hand. Firefox has historically needed the anchor
in the document, and revoking in the same task can abort the save.

Nothing proves this either way in this project: there is no browser harness, and
the manual try path was only ever going to be run in one browser. Recorded as a
defect rather than a risk because the shortcuts are deliberate choices visible in
the code, not an unknown.
**Suggested fix:** append the anchor, click, remove it, and revoke from a
`setTimeout(..., 0)` so the revoke lands in a later task. Then either cover it
through `/browser-tests`, or say in the comment that it is proven by hand in
Chromium only.
**Resolution:**

### F-32 [P3] open - The Export card reads "1 indicators", and a spec asserts the mistake

**File:** ui/src/app/export/export-card.ts:105
**Found:** 2026-09-11 by /audit (scope: full; lens: quality)
**Why it matters:** `scopeLine` interpolates the count straight into the full
word, so a single-indicator query reads `56 rows · 1 indicators · all countries`.
The saved-queries `scopeLabel` gets away without pluralising because it uses the
design's terse `1 ind`; this line spells the word out, so the same shortcut reads
as a bug rather than a convention. `1 rows` has the same problem.

Recorded partly because `export-card.spec.ts:226` and `:234` both assert
`1 indicators` verbatim. The suite pins the wrong string, which is the F-17 shape
once more: a test that will resist the repair.
**Suggested fix:** pluralise `rows`, `indicators` and `countries` on their own
counts, and update the two specs to the corrected wording rather than leaving
them to fail.
**Resolution:**

### F-35 [P3] unverified - Nothing confirms the live service honours pageSize=5000, and the refusal names our number as if it were the limit

**File:** ui/src/app/core/export/export.service.ts:20
**Found:** 2026-09-11 by /audit (scope: full; lens: quality)
**Why it matters:** `EXPORT_PAGE_SIZE` is 5000 because CONSUMER-GUIDE section 6
steers bulk consumers there, but feature 8's live reconciliation never probed it,
and `/countries` was observed ignoring `pageSize` entirely. If the service caps
the page lower — 500, say — then `data.length` is the cap rather than our request,
and every export above it refuses with "one export can carry 500", which reads as
a limit this console chose. The user would be told to narrow a query that paging
would have answered.

Unverified on purpose: confirming it needs a live request against a result larger
than 5000 rows, which this session did not make. A lead, not a defect, and it
gates nothing.
**Suggested fix:** probe `/observations?pageSize=5000` against the live service
and record what `meta.pageSize` comes back as. If it is capped, either page the
export or word the refusal as the service's limit rather than ours.
**Resolution:**

### F-36 [P3] fixed - A newline in an attribution line or a vintage label breaks out of the CSV header comments

**File:** ui/src/app/core/export/export-csv.ts:74
**Found:** 2026-09-11 by /audit (scope: full; lens: security)
**Why it matters:** Every data field goes through `csvField`, which quotes and
now guards it. The header comment lines do not: `toCsv` interpolates
`meta.attribution` straight into `` `${COMMENT}${line}` `` at `:74`, and
`vintageHeader` at `:92` joins `vintage.label` the same way. Both strings come
from the Core API.

A newline in either value ends the comment and starts a new physical line with
no `# ` prefix, above the column header. A reader is then handed a line it
cannot classify: too few columns to be a row, not marked as a comment, and
positioned where the header is expected. A carriage return does the same. The
file stops being well formed, and unlike F-34 no hostile intent is needed —
a multi-line attribution string is an ordinary thing for an upstream to send.

F-34 deliberately ruled these lines out of scope, and correctly, on the grounds
that a `# ` prefix means they can never begin with a formula character. That
reasoning holds for formula injection and says nothing about line injection,
which is a different failure of the same untrusted text.
**Suggested fix:** strip or replace CR and LF in every value interpolated into a
comment line, in one small helper beside `csvField` so both the attribution loop
and `vintageHeader` use it. Collapsing them to a space keeps the text readable
and cannot break the line structure.
**Resolution:** Fixed on 2026-09-11 as suggested. `commentSafe` at
`export-csv.ts:115` collapses any run of CR and LF to one space and trims the
ends, applied to each attribution entry, to each `vintage.label` inside
`vintageHeader`, and to the stamp. The stamp does not need it — it is sliced to
ten characters first — and goes through anyway so no reader has to work out which
of the three is the exception.

Collapsed rather than stripped: a line wrapped mid-sentence would otherwise read
as `IMFWorld Economic Outlook`.

Eight specs. Two of them exist to stop the helper being over-applied: an ordinary
attribution line must be byte-for-byte unchanged, and a newline inside a *data*
field must still be quoted and preserved, because RFC 4180 handles that case
correctly and the comment lines are the only place with no such mechanism.

Probed by reverting `commentSafe` to the identity function, which failed six
specs including the header-position case this finding is actually about, and left
those same two passing — the split the probe was designed to show. Restored and
re-run green at 604.

Not covered: the defect in the wild. It needs an upstream returning a multi-line
attribution string, and the live service returns single-line values.
