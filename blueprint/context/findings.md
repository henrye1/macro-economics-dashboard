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

### F-37 [P2] open - The curl's ETag line depends on a signal it does not read, through a bare statement

**File:** ui/src/app/request-builder/request-builder.ts:101
**Found:** 2026-09-11 by /audit (scope: full; lens: quality)
**Why it matters:** `heldEtag` opens with a bare `this.result();` whose only
purpose is to register a dependency. It exists because
`RequestSendService.held` is a plain field rather than a signal, so nothing in
the computed would otherwise re-run when a send stores a new validator.

It works today only because `send()` assigns a freshly built object every time,
so the `result` signal's identity always changes. Nothing enforces that. Add an
`equal` comparator to the signal, or dedupe two identical `304` outcomes, and the
`If-None-Match` line silently stops appearing — or worse, keeps showing a
validator that has since been dropped. A statement evaluated purely for its
effect on dependency tracking is the kind of line that survives a refactor and
then quietly stops working, and the comment above it explains what it does
without saying what breaks if it goes.
**Suggested fix:** hold the validator in a signal inside `RequestSendService`.
`heldEtag(endpoint, query)` then reads it, the card's computed tracks it for
real, and the bare statement and its comment both disappear.
**Resolution:**

### F-39 [P3] open - A held validator outlives the card that could explain it

**File:** ui/src/app/core/request/request-send.service.ts:56
**Found:** 2026-09-11 by /audit (scope: full; lens: quality)
**Why it matters:** `RequestSendService` is `providedIn: 'root'` and the page is
not, so navigating away from the request builder and back destroys the component
while the held `{ requestKey, etag }` survives. The status pill then reads
`Not sent` — correct, this component has sent nothing — while the curl beneath it
carries an `If-None-Match` line, which only exists because something *was* sent.
A reader has no way to tell where that validator came from.

Defensible as designed: the validator genuinely is still current, and sending it
is what produces the `304` the tab teaches. That is why this is P3 rather than a
correctness bug. But the two regions disagree about whether a request has
happened, and nothing on screen reconciles them.
**Suggested fix:** either note beside the curl that the validator came from an
earlier send in this session, or clear the hold when the page is destroyed. The
first keeps the `304` demonstration working across a tab change; the second is
simpler and gives it up.
**Resolution:**

### F-40 [P3] open - The base path is defined twice, and the comment on one of them claims it is the only one

**File:** ui/src/app/core/http/http-macro-data.provider.ts:23
**Found:** 2026-09-11 by /audit (scope: changed; lens: quality)
**Why it matters:** `BASE = '/api/macro'` at `:29` carries a comment saying a
configurable production base URL "is feature 13's open TODO, and inventing one
here would be a second source of truth to unpick later." Two things about that
are now wrong.

The TODO is resolved: the plan change under review chooses a Render rewrite that
proxies `/api/*` to the API service, so the relative path is correct in
production and no configurable base URL is coming. A comment pointing at a
decision that has been made sends the next reader looking for work that does not
exist.

And the second source of truth already exists. `request-text.ts:15` declares
`PROXY_BASE = '/api/macro'` independently, for the request builder's own send.
They cannot diverge silently today, because specs in both files assert the
literal path — but the comment asserts a uniqueness the code does not have, and
if the rewrite assumption fails and `API_BASE_URL` returns, the repair has two
constants to find rather than the one the comment promises.
**Suggested fix:** have `request-text.ts` export the base and the provider import
it, or the reverse — one owner either way — and rewrite the comment to record the
rewrite decision rather than the TODO it replaced.
**Resolution:**

### F-41 [P3] open - The plan now makes CORS unexercised while still describing it as the lock

**File:** blueprint/project-plan.md:220
**Found:** 2026-09-11 by /audit (scope: changed; lens: security)
**Why it matters:** The change under review states that with the `/api/*` rewrite
"no cross-origin request is ever made from the browser." That is the point of the
approach and it is correct. The same document's Notes still read "CORS on the API
is locked to the console's origin via `CORS_ORIGIN`", and `api/src/app.ts:17`
configures `cors({ origin: config.corsOrigin })` accordingly.

Both statements can be true at once, and that is the problem: after the rewrite,
requests reach the API from Render's proxy rather than from a browser, so the
`Origin` header may not be present and the CORS headers stop being the control
they are described as. Nothing breaks — `cors()` simply adds nothing when there
is no origin to match — but `/release render` will otherwise configure
`CORS_ORIGIN` believing it gates access, when the only thing actually gating
access is that the API's URL is not published.

The project overview already records the underlying gap as accepted: until
logins exist, anyone with the API URL can use the M2M credentials by proxy. This
finding is that the plan's CORS sentence now reads as a mitigation it is not.
**Suggested fix:** keep `CORS_ORIGIN` configured — it costs nothing and still
applies if the console ever calls the API directly — and correct the sentence to
say CORS is defence in depth rather than the lock. Then decide at
`/release render` whether the accepted gap needs the shared-header mitigation the
plan already describes as throwaway code.

### F-45 [P3] open - series.scss keeps a hundred lines of rules for markup the rewrite deleted

**File:** ui/src/app/series/series.scss:12
**Found:** 2026-09-14 by /audit (scope: current; lens: quality)
**Why it matters:** `series.html` no longer emits `.series-title`, `.series-sub`,
`.points`, `.point` or the top-level `.boundary`, but all five blocks are still
in `series.scss`, roughly lines 12 to 115. The file was not touched in this
delta at all. The standards call out "no unused imports or variables"; this is
the CSS form of it, and it is the kind of dead weight that gets copied forward
because it looks like it is in use.

Two of the names now exist twice with different meanings, which is the part that
will cost someone time: `.boundary` is dead here but live in
`series-chart.scss` as the dashed rule, and `.legend` here styles the head strip
while `series-chart.scss` styles the per-chart one. View encapsulation keeps them
apart, so nothing renders wrong; a reader grepping for either name does not get
that for free.

The reverse also happened: `series.html:51` and `:57` apply `class="tight"`, and
no rule for it exists in `series.scss` or `styles.scss`. The only `td.tight` in
the project is scoped to `countries-indicators`.
**Suggested fix:** delete the five dead blocks, and either define `tight` for
this table or drop the class from the two cells.
**Resolution:** Still open, re-confirmed at 6bec3ed by the independent review,
with one correction: the file *was* touched in this delta after all. The repair
commit rewrote the `.legend .box` rules into `.rule` for F-44
(`series.scss:133-152`). The five dead blocks above them are untouched and still
there, `.boundary` and `.legend` still carry one meaning here and another in
`series-chart.scss`, and `series.html:66` and `:70` still apply an undefined
`tight`. Not worse, not smaller. P3, so it does not block.

### F-46 [P3] open - Eight icons now depend on a Google Fonts ligature that has no fallback, and they fail as visible words

**File:** ui/src/index.html:11
**Found:** 2026-09-14 by /audit (scope: current; lens: quality)
**Why it matters:** The delta swaps the HTML entities (`&#9906;`, `&times;`,
`&#8594;`) for Material Symbols Outlined ligatures, so the markup now literally
contains `<span class="ms-icon">close</span>` at eight sites. `--font-icon` is
`"Material Symbols Outlined"` with no fallback family, and the font is only
reachable from `fonts.googleapis.com`. If that request is blocked - an offline
run, a CSP without the font hosts, a corporate proxy, or a font that has simply
not arrived yet - the ligature never forms and the browser renders the word: a
chip's remove button reads "close", the Observations header reads "download
Export", and the query card reads "restart_alt Reset".

The entities this replaced needed no network. Nothing here is a functional break
and every one of the eight is `aria-hidden`, so assistive tech is unaffected;
it is a first-paint and offline-resilience regression introduced by the port.
**Suggested fix:** self-host the subset the console uses, or keep the CDN and
give `.ms-icon` a `font-size: 0` with the glyph sized on a child, so a missing
font collapses rather than spelling itself out.
**Resolution:** Still open, and now wider. The 2026-09-21 fidelity pass closed
F-62 by converting the three overview use-case glyphs to `trending_up`,
`leaderboard` and `history`, so the count is eleven sites, not eight, and the
overview is now among the screens that would spell themselves out. The two
findings pull in opposite directions and F-62 wins on the evidence: the
reference uses the ligatures, and the spec's Done when rules the entities out.
The fallback is the thing that needs building. P3, so it does not block.

### F-48 [P2] open - The port dropped three action buttons to 3.0:1, under the AA floor they used to clear

**File:** ui/src/app/export/export-card.scss:102
**Found:** 2026-09-14 by /audit (scope: current; lens: quality)
**Why it matters:** Three filled action buttons carried a hand-picked dark green
before this delta and read the theme token after it: `.btn.download` here,
`.btn.send` at `request-builder.scss:91`, and `.btn.save` at
`saved-queries.scss:67`. All three were `#1f7a44`; all three are now
`var(--accent)`, which the port sets to the design system's
`--cl-action-color: #3faa24`.

White on `#1f7a44` is 5.35:1. White on `#3faa24` is 3.01:1, both computed from
the running app's own colours. The label is 12px at weight 600 or 700, which is
not WCAG large text, so the floor is 4.5:1 and these three now fail it where
they used to clear it comfortably.

The new `.btn.primary` Save query control this delta adds to the working query
card (`working-query-card.html:178`) lands on the same 3.01:1, so the fix also
ships one new control already under the floor. `.btn.primary` elsewhere was
already at 3.09:1 on the old `#2fa83c`, so that part is not a regression; the
three named above are.

This is faithful to the reference token set, which is the fix's stated goal, and
that is the tension worth recording. The honest options are to darken the ink
pairing for text or to accept the reference's contrast out loud rather than by
inheritance.
**Suggested fix:** either give filled action buttons a darker background behind
their text - `--cl-action-700: #319a1b` at minimum, though that is still only
3.9:1, so a dedicated on-action token is the real answer - or record the
decision to follow the design system's contrast in the `styles.scss` header so
the next reader knows it was weighed rather than missed.
**Resolution:**

### F-49 [P3] open - The token set's source of truth is not in the repository, and the one it supersedes still is

**File:** ui/src/styles.scss:3
**Found:** 2026-09-14 by /audit (scope: current; lens: quality)
**Why it matters:** The header comment now says the tokens were read off "the
standalone reference export rather than prototypes/theme.css, which was a
simplified re-draw and drifted". `macro-data-explorer-standalone.html` is not in
this repository: `blueprint/references/` holds seven screenshots and nothing
else. So the delta's central claim, that every colour, radius and control height
matches the reference, cannot be checked by anyone, this review included, and
the next person who needs a token has no file to read it from.

The other half compounds it. `prototypes/` is still present with the superseded
`theme.css`, and the Blueprint's own skills treat its presence as the design
reference: `.claude/skills/brief/SKILL.md:57` and `feature/SKILL.md:139` both
point a UI feature at `prototypes/` when the folder exists. The spec's Notes
section records that it is no longer the reference, but that note lives in
`current-feature.md`, which `/complete` archives. Nothing in `prototypes/` or
`styles.scss` says it.

No code is wrong. This is about whether the fidelity this fix bought survives
the spec being archived.
**Suggested fix:** commit the standalone export under `blueprint/references/`
and name it in the `styles.scss` header, then delete `prototypes/` or leave a
`SUPERSEDED.md` in it naming the replacement.
**Resolution:** Still open, and it cost something concrete. The 2026-09-21
fidelity pass verified the console against a copy of the export outside the
repository, supplied for that session, and found fourteen differences from the
design (F-51 to F-64) that had stood since the port. F-56 is the sharpest
illustration of this finding: the drift table in `current-feature.md` records
the radius as 5px because it was read from the export's `--border-radius`
declaration rather than from what the export renders, which is square. Nobody
could have caught that from this repository. P3 by severity, but it is the
reason the other fourteen existed. Committing the export under
`blueprint/references/` remains the fix.

### F-50 [P3] open - The one test named for tooltip anchoring asserts the implementation's formula against itself

**File:** ui/src/app/core/series-chart.spec.ts:179
**Found:** 2026-09-14 by /audit (scope: current; lens: tests)
**Why it matters:** `it('anchors the tooltip as a percentage of the viewBox')`
asserts that `first.leftPercent` is close to `(first.cx / CHART_WIDTH) * 100`,
which is character for character what `series-chart.ts:239` computes. It
restates the source rather than pinning a fact about it, so it passes for any
value of `cx` and would have stayed green throughout F-42.

It stands out because the rest of this file is the opposite. `'bridges the
forecast path back to the last actual point'` pins exact path strings, and
`'carries every plotted point'` compares two independently derived counts. Those
fail when the code is wrong. This one cannot.

The thing the name promises, that the tip lands on its point, is CSS, and no
unit test can reach it. That is fine; a test that cannot observe its subject
should say what it can observe instead.
**Suggested fix:** either assert the concrete number for a known point
(`leftPercent` is 7.37 for `cx` 56) so a change to the scale is visible, or drop
the test and note in `series-chart.scss` that the anchoring is browser-verified
only.
**Resolution:**

### F-65 [P2] open - The Series tab now fetches the whole country catalogue twice on every visit

**File:** ui/src/app/series/series.ts:80
**Found:** 2026-09-21 by /audit (scope: current; lens: performance)
**Why it matters:** F-63 gave `SeriesPage` its own `macro.countries()` call to
resolve ISO3 codes to names. `WorkingQueryCard`, which the same page renders,
already calls `macro.countries()` at `working-query-card.ts:65` to populate its
Add country select. Both subscribe on construction, so opening `/series` issues
two identical `GET /api/macro/countries` requests for all 214 rows, where it
previously issued one.

`HttpMacroDataProvider` holds no client-side cache by design - its own comment
records that the API's ETag revalidation is meant to do that work - so nothing
between the two callers collapses them. Conditional revalidation makes the
second response cheap on the wire but it is still a round trip on every visit,
and the relay still spends an upstream call if its cache has expired.

The catalogue is the one payload three tabs all need and none of them own, so
the duplicate is a symptom rather than the defect: `countries-indicators.ts:92`
and `overview.ts:42` each fetch it too, independently.
**Suggested fix:** a small catalogue service in `core/` holding
`countries()` behind `shareReplay({ bufferSize: 1, refCount: false })`, injected
by the four callers. That also gives feature 19's auth screens and item 16 a
place to read it from.
**Resolution:** Confirmed independently, 2026-09-21. `series.ts:80` and `working-query-card.ts:65` both subscribe on construction, and `http-macro-data.provider.ts:53` adds no cache or `shareReplay`, so two identical `GET /countries` go out per visit. Stays open.

### F-66 [P2] open - Neither fallback in the new country-name resolution is tested

**File:** ui/src/app/series/series.spec.ts:106
**Found:** 2026-09-21 by /audit (scope: current; lens: tests)
**Why it matters:** F-63 added two fallbacks and a test for neither:
`buildCharts` falls back to the ISO3 when the map has no entry for a country
(`series-chart.ts:268`), and `SeriesPage` swallows a catalogue failure into an
empty map (`series.ts:82`). Both exist so a silent catalogue is a cosmetic loss
rather than a broken tab, which is the claim worth pinning.

The tests that were updated assert only the happy path: the legend reads
`['Namibia', 'South Africa']` and the metadata cell reads `NAM — Namibia`. They
pass whether or not the fallback works, so a later change that lets `undefined`
reach the label - or that lets the catchError turn into a thrown error - is
green. The standards' scope rule puts `buildCharts` squarely in the tested set:
it is pure logic with an obvious edge case.

`core/series-chart.spec.ts` is the natural home for the first and takes one
case: build a chart with an empty map and assert the legend reads the code.
**Suggested fix:** two cases. In `series-chart.spec.ts`, a chart built with an
empty map labels its legend with the ISO3. In `series.spec.ts`, a provider whose
`countries()` errors still renders the charts and the metadata table, with codes
for labels.
**Resolution:** Confirmed independently, 2026-09-21. `core/series-chart.spec.ts` has 27 cases and none builds a chart with an empty or partial name map; `series.spec.ts` asserts only the resolved labels. Both fallbacks are untested. Stays open.

### F-67 [P2] open - Angular Material is themed in 187 custom properties and imported by no component

**File:** ui/src/styles.scss:186
**Found:** 2026-09-21 by /audit (scope: current; lens: quality)
**Why it matters:** `styles.scss` runs `@include mat.theme(...)` and then
overrides roughly 25 `--mat-sys-*` variables so Material "inherits the Cyte look
instead of a stock palette", per its own comment. Nothing imports a Material
component: `@angular/material` appears in no non-spec file under `src/app`. The
console is hand-built cards, tables and buttons on the `--cl-*` tokens.

It is not free. The emitted `styles.css` carries 187 `--mat-sys-*` declarations,
8.2 kB of its 21.7 kB, so 38% of the global stylesheet is theming for a library
the app does not use. `@angular/material` and `@angular/cdk` are also runtime
dependencies rather than dev ones, which is two packages of supply-chain surface
and upgrade cost for the same nothing.

This predates the fidelity work but sits inside it: the block was rewritten in
`f68784d`, which is what makes it this delta's to answer for.
**Suggested fix:** confirm no component is planned to use Material - feature 19's
auth forms are the next candidate and the reference draws plain inputs - then
delete the `mat.theme()` block and the `--mat-sys-*` overrides and drop both
dependencies. If Material is wanted later, the block is one commit to restore
and the tokens it reads still exist.
**Resolution:** Confirmed independently, 2026-09-21. `@use '@angular/material'` and `mat.theme()` are in `styles.scss`, and no file under `ui/src/app` references Material. Noting for the record that the import predates this delta (it is present at the base commit `8d57c0d`), so this is inherited weight the delta restated rather than introduced. Stays open.

### F-68 [P3] open - .clickable means two different things, and the row it now really controls has no pointer cursor

**File:** ui/src/styles.scss:622
**Found:** 2026-09-21 by /audit (scope: current; lens: quality)
**Why it matters:** The rule carries the comment "Hover affordance only. The
row's real control is a button inside it", and that is exactly true of the
catalogue at `countries-indicators.html:131`, where the `<tr>` has no handler
and the foot tells the reader to click the code. F-64 then put a real
`(click)` on `vintages.html:37` and reused the same class, so the class now
means "hover hint, not a target" on one tab and "this is the target" on the
other, and its comment is wrong for the second.

The user-visible half is that `.clickable` sets only a background, so the
vintages row that is now a genuine click target keeps the default cursor. The
row highlights on hover and does something when clicked, but never says it is
clickable, which is the affordance the design's "click a row for its revisions"
promises.
**Suggested fix:** split the two: keep `.clickable` as the hover hint, add
`.row-target` (or similar) that sets `cursor: pointer` on top of it, and put the
new class on the vintage row. Correct the comment on `.clickable` to say it does
not imply a handler.
**Resolution:** Confirmed independently, 2026-09-21. `styles.scss:622` sets background only; `vintages.html:37` carries a real `(click)` with no `cursor: pointer`, while `countries-indicators.html:131` carries the same class with no handler. Stays open.

### F-69 [P3] open - Two tokens are left declared and unused by this delta

**File:** ui/src/styles.scss:174
**Found:** 2026-09-21 by /audit (scope: current; lens: quality)
**Why it matters:** `--radius-button` had exactly two consumers, the
`.btn.primary` and `.btn.navy` branch that F-56 deleted once the whole system
went square. `--cell-y` had exactly one, the `tbody td` padding that F-59 moved
to the new `--table-y`. Both are still declared in `:root` with zero `var()`
references anywhere in `ui/src`, and `--cell-y` sits under a comment that
introduces it as half of a pair.

The standards call out unused variables directly. The cost here is not bytes: a
token that looks live is one the next person reaches for, and `--radius-button`
in particular reads as though filled buttons still have their own radius rule
when they no longer do.
**Suggested fix:** delete both declarations and reword the `--cell-y` comment to
describe `--cell-x` alone.
**Resolution:** Confirmed independently, 2026-09-21. `--radius-button` and `--cell-y` have zero `var()` references in `ui/src`. The same sweep found more unused alias tokens than the entry names; the chart palette half of that is recorded separately as F-73. Stays open.

### F-70 [P3] open - The writing standard forbids em dashes and the product copy is built on them

**File:** blueprint/context/coding-standards.md:196
**Found:** 2026-09-21 by /audit (scope: current; lens: quality)
**Why it matters:** The standard says "No em dashes (U+2014) in generated
content: docs, comments, commit messages, READMEs, specs" and "Avoid en dashes
and the ellipsis character too". The codebase does the opposite everywhere it
shows a value: the em dash is the missing-value glyph in `vintages.ts:267`,
`:301` and `:307`, in the paging footer's empty vintage label, and in the
Observations and Series empty states; the en dash is the year-span separator in
`revision-view.ts:150` and `working-query-card.ts:154`; the ellipsis character
is in eight templates' loading text. Roughly 30 sites, almost all of them
product copy that matches the design reference.

So the rule as written is contradicted by the code it governs, and the
contradiction is spreading: F-63 added `${iso3} — ${name}` and a doc comment
quoting it at `series.ts:91`, both because the reference renders exactly that.
A standard nobody follows stops being a standard, and the next reviewer either
raises 30 findings or learns to skip the section.

The rule is right about its actual target. Prose that reads as AI-generated is a
real problem, and none of these sites are prose.
**Suggested fix:** scope the rule to what it means - prose in docs, comments,
commit messages and specs - and say explicitly that product copy and value
glyphs follow the design reference. Then fix the one comment at `series.ts:91`
that the narrowed rule still catches.
**Resolution:** Confirmed independently, 2026-09-21. The conflict between the standard and the product copy is real and is a standards question rather than a code defect. Stays open for the user to decide; a reviewer cannot accept it on their behalf.

### F-72 [P3] open - The chart's screen-reader description states a forecast even on a chart that has none

**File:** ui/src/app/core/series-chart.ts:390
**Found:** 2026-09-21 by /audit independent (scope: current; lens: quality)
**Why it matters:** `describe()` always ends `actual through ${lastActualYear}
and forecast after it`, with no reference to `hasForecast`. The drawing is
careful about exactly this: `boundaryInWindow` exists so the dashed rule is not
drawn when the boundary falls outside the window, and the band is suppressed
when `hasForecast` is false. The description was not given the same guard.

It is reachable without unusual data. Set Forecast to `actual`, or a Year to
that lands before `lastActualYear`, and every point on the chart is history: the
sighted reader sees an unbanded line with no boundary, and the screen-reader
user is told there is a forecast after a year that is not even on the axis,
because `lastActualYear` is the group minimum and is not clamped to the window.

This is the one rendering a non-sighted user has, so it carries the whole claim
by itself. Nothing else on the card contradicts it for them.
**Suggested fix:** pass `hasForecast` into `describe()` and end the sentence at
the range when it is false, or say `all actual` instead. Clamp the stated
`lastActualYear` to the window, or name the window it refers to.
**Resolution:**

### F-73 [P3] open - The chart palette is declared twice, as six CSS tokens nothing reads and six hex literals in TypeScript

**File:** ui/src/app/core/series-chart.ts:34
**Found:** 2026-09-21 by /audit independent (scope: current; lens: quality)
**Why it matters:** `SERIES_COLORS` hardcodes the six line colours and comments
"Matches --series-1..6". `styles.scss:139` declares `--series-1` through
`--series-6` with the same six values, and no rule in `ui/src` reads any of
them: the colours reach the SVG as `[attr.stroke]` and `[attr.fill]` bindings,
which are presentation attributes and cannot resolve `var()`. So one half of the
pair is authoritative and the other is decoration, and the file header two
hundred lines above says "Never hardcode a colour, font or radius anywhere else:
reference a variable."

Two copies that must agree and no mechanism to make them is the drift this token
layer exists to prevent. A tenant theme that re-skins `--cl-*` also silently
misses the chart.
**Suggested fix:** pick one owner. Either delete the six `--series-*`
declarations and note in `series-chart.ts` that the palette lives in TypeScript
because SVG presentation attributes cannot read a variable, or move the strokes
onto CSS classes (`class="series-1"`) so the tokens are the single source. The
first is one line of work; the second is the one that keeps the theming promise.
**Resolution:**

### F-74 [P3] open - yearOptions sizes its array from an unvalidated saved year, so one bad entry can build an array of a billion

**File:** ui/src/app/core/year-range.ts:32
**Found:** 2026-09-21 by /audit independent (scope: current; lens: performance)
**Why it matters:** `yearOptions` widens rather than clamps, on purpose, so a
saved range outside the console's window is still selectable. The length it then
builds is `last - first + 1`, taken straight from whatever numbers it was
handed, and the only caller passes `query().yearFrom` and `query().yearTo`.

Those values are not always console-produced. The Year selects are bounded, but
`saved-query.store.ts:205` restores entries from `localStorage` behind
`isNullableNumber`, which accepts any `number`. A corrupt, hand-edited or
future-schema entry carrying `yearFrom: 1e9` makes the card build a
billion-element array and render a billion `<option>` elements the moment it is
loaded, which hangs the tab; `Infinity` throws a `RangeError` out of
`Array.from` and takes the card's render with it.

This is a robustness gap rather than a live bug - the path needs storage that
the app did not write - but the guard is one line and the failure is total.
**Suggested fix:** clamp the window in `yearOptions`, for example to
`MIN_YEAR - 50` and `now.getFullYear() + 50`, and return the bounded list. A
year outside that is not selectable anyway. Tightening `isNullableNumber` to
`Number.isInteger` plus a plausible range would fix the class rather than the
symptom.
**Resolution:**

### F-75 [P3] open - The API ships Express's default fingerprint and parses a JSON body on a read-only surface

**File:** api/src/app.ts:14
**Found:** 2026-09-21 by /audit (scope: full; lens: security)
**Why it matters:** `createApp()` mounts `cors`, `express.json()`, the auth seam
and the router, and nothing else. Three small gaps follow from that:

`x-powered-by` is left on, so every response advertises Express. It is not a
vulnerability by itself, it is free reconnaissance, and `app.disable('x-powered-by')`
is the one-line answer.

No response security headers are set. There is no `X-Content-Type-Options`,
`Referrer-Policy` or `X-Frame-Options`. The relay answers JSON, so the practical
risk is small, but `notFound` at `error-handler.ts:4` reflects `req.originalUrl`
into a response body, and nosniff is exactly the header that keeps a reflected
value from ever being treated as markup.

`express.json()` parses a body on every request when every route the service has
is a `GET`. It is reachable surface with no consumer: a POST of 100 kB of JSON to
any path is parsed before the 404 is written.

None of this is exploitable as the service stands. It matters because feature 13
puts this on Render and features 14 and 15 put real sessions behind it, and
hardening a relay is much cheaper before either.
**Suggested fix:** `app.disable('x-powered-by')`, and drop `express.json()` until
a route needs a body. Add `helmet` when feature 13 configures the deployment, or
set the three headers by hand if the dependency is not wanted.
**Resolution:**

### F-76 [P3] open - A non-numeric PORT silently binds a random port instead of failing

**File:** api/src/config.ts:47
**Found:** 2026-09-21 by /audit (scope: full; lens: quality)
**Why it matters:** `port: Number(process.env.PORT ?? 3000)` has no guard.
`PORT=""` gives `0` and `PORT=http` gives `NaN`, and Node treats both as "pick
an ephemeral port", so `index.ts` binds something arbitrary and logs the wrong
number: `API listening on http://localhost:NaN`. The platform health check then
fails against a port nothing is listening on, and the log actively misdirects
whoever reads it.

Every other setting in this file is either validated or has a meaningful empty
default, and `isMacroConfigured` exists precisely because the module's own
comment says a partially configured service is worse than an unconfigured one.
Port is the one setting that escaped that reasoning, and it is the setting a
deployment platform always supplies.
**Suggested fix:** parse once and fall back deliberately, for example
`const parsed = Number(process.env.PORT); const port = Number.isInteger(parsed) && parsed > 0 && parsed < 65536 ? parsed : 3000;`
Throwing instead of falling back is also defensible, since a platform that sets
`PORT` wrong wants to know.
**Resolution:**

### F-79 [P3] open - Feature 18's plan line asks for two parents and an auth layout; one parent landed and the plan does not record the remainder

**File:** blueprint/build-plan.md:45
**Found:** 2026-09-21 by /audit (scope: current; lens: quality)
**Why it matters:** Build-plan item 18 reads "add an auth layout beside it ...
and convert the seven flat routes into two parents with children". The delta
adds one parent and no auth layout. The deferral itself is sound and is the
call I would make: a second layout with no child routes cannot be navigated to,
cannot be rendered through the router in a test, and its done-when really would
be "the file exists"; feature 18's stated risk is that it can break all seven
tabs at once, and an unreachable sibling neither adds to nor subtracts from
that risk. The structural goal - a route chooses its chrome - is met, because
adding a sibling parent in 19 is now a four-line route change.

The gap is traceability, not engineering. `current-feature.md` records the
deferral under Out of scope, but `/complete` archives that file and ticks line
18, while line 19 says nothing about an auth layout. After the archive the only
record that item 18 shipped partially lives in a history folder. Feature 19 is
also the feature that most easily forgets it, because the guard and the screens
are the visible work.
**Suggested fix:** before `/complete`, amend build-plan line 19 to name the auth
layout as part of its scope, or annotate line 18 with "auth layout deferred to
19". One clause either way.
**Resolution:**

### F-92 [P3] open - The production build ships blank Supabase settings and the setup note points at the development file

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
**Resolution:** Re-confirmed open 2026-10-05 by the independent review of `51625fb`: `environment.production.ts` still blank, `.env.example:23` still names `environment.ts`.

### F-93 [P3] open - Set password reports a rejected password as an outage

**File:** ui/src/app/core/supabase/supabase-auth.provider.ts:102
**Found:** 2026-10-05 by /audit independent (scope: current; lens: quality)
**Why it matters:** `setPassword` maps only missing-session errors to `'denied'` and
rethrows everything else, which the screen renders as "We could not set your
password just now. Try again in a moment." Supabase answers `422` with
`same_password` when the visitor reuses their old password, and `weak_password`
when the project's policy (for example leaked-password protection) is stricter than
the screen's three rules. Both are the visitor's to fix, and the screen tells them to
wait and clears the field. This is the inverse of the `isRefusal` rule `signIn`
follows. No spec covers either code.
**Suggested fix:** map `same_password` and `weak_password` to a field-level message
on the form, and add one provider spec per code.
**Resolution:** Re-confirmed open 2026-10-05 by the independent review of `51625fb`: unchanged at `supabase-auth.provider.ts:100`. See also F-96.

### F-94 [P3] unverified - Local-only sign-out leaves the refresh token valid, and the comment says it expires on its own

**File:** ui/src/app/core/session.store.ts:102
**Found:** 2026-10-05 by /audit independent (scope: current; lens: security)
**Why it matters:** `signOut({ scope: 'local' })` clears this browser only. The
comment says "The refresh token is revoked by its own expiry", but Supabase refresh
tokens do not expire by default (they are single-use, and only a configured
inactivity or session time-box ends them), so a refresh token copied before sign-out
keeps minting access tokens. Choosing local scope so a network failure cannot
leave the visitor looking signed in is reasonable; the comment overstates what it
buys. Unverified because the project's session settings were not inspected.
**Suggested fix:** call the default (`global` or `others`) scope and fall back to
local on failure, or correct the comment to say the refresh token stays valid
server-side until the project's session limits end it.
**Resolution:**

### F-95 [P2] open - sessionGuard has no spec, so the hydration wait step 4 exists for is unproved

**File:** ui/src/app/auth/session.guard.ts:19
**Found:** 2026-10-05 by /audit independent (scope: current; lens: tests)
**Why it matters:** Step 4 rewrote the guard to await `SessionStore.ready` so a signed-in visitor who reloads is not bounced to sign-in, and its Done when requires "a guard that waits rather than redirecting mid hydration". No `session.guard.spec.ts` exists and no spec calls `sessionGuard`; the only guard evidence is route specs whose stub `getSession()` resolves immediately and the e2e signed-out deep link. Reverting the guard to a synchronous `signedIn()` read (the reload bounce) would keep every suite green. The spec's Testing section also lists "sessionGuard: waits for hydration, allows a hydrated session, redirects with returnUrl otherwise".
**Suggested fix:** add `session.guard.spec.ts` with a stub client whose `getSession()` is held on a deferred promise: assert the guard emits nothing before it settles, `true` after it settles with a session, and a `/sign-in?returnUrl=` tree after it settles with none.
**Resolution:**

### F-96 [P3] open - SupabaseAuthProvider.setPassword, the one real call the set-password screen makes, has no provider spec

**File:** ui/src/app/core/supabase/supabase-auth.provider.ts:89
**Found:** 2026-10-05 by /audit independent (scope: current; lens: tests)
**Why it matters:** `supabase-auth.provider.spec.ts` covers `signIn`, `requestPasswordReset` and the two fixture delegations, and never calls `setPassword` or stubs `updateUser`. `isSessionMissing` (`:168`) decides between the screen's expired-link dead end and its outage message, and the null-user and unconfigured branches are likewise unexercised. `set-password.spec.ts` drives the screen against a fake `AUTH`, so it cannot catch a wrong mapping here.
**Suggested fix:** add a `setPassword` describe with a stubbed `updateUser`: success maps the user, `status: 401` and `session_not_found` answer `'denied'`, an unrecognised code raises, and a null client raises.
**Resolution:**

### F-97 [P3] open - Step 6 is checked for a $MACRO_TOKEN Request-builder header the delta never adds

**File:** blueprint/context/current-feature.md:174
**Found:** 2026-10-05 by /audit independent (scope: current; lens: quality)
**Why it matters:** The spec's In scope item and step 6 say the Request builder renders `Authorization: Bearer $MACRO_TOKEN` and adds `401` to its status reference, and Files/areas lists `request-builder.ts`, `.html` and spec. None of those files change in `f3411e0..51625fb`: `request-text.ts:81` already emitted `Bearer $TOKEN` and `request-builder.ts:29` already listed `401`. The property that matters, a placeholder and never the live token, holds, so nothing is broken; the spec records work and a placeholder name that do not match the code, and a later reader trusting it will look for `$MACRO_TOKEN`.
**Suggested fix:** correct the spec's step 6 and In scope text to say the builder already carried a `$TOKEN` placeholder and `401`, or rename the placeholder if `$MACRO_TOKEN` was the decision.
**Resolution:**
