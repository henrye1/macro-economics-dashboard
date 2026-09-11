# Fix: Rename the shared result state API

**Type:** Fix

**Status:** verified

**Branch:** `fix/rename-the-shared-result-state-api`

**Fixes:** F-23

## The problem

`ui/src/app/core/result-state.ts:36` exports `ResultState$<T>`. In Angular and
RxJS code a `$` suffix means an Observable, and every member of that interface is
a `Signal` or a plain function. Nothing in this codebase uses a `$` suffix
anywhere else, so the convention is being introduced by this one name and
introduced incorrectly.

It got there because the private union at line 18 is already called
`ResultState`, and the `$` was the path of least resistance for the export rather
than a deliberate choice.

Both pages infer the return type, so neither writes the name. Its own spec does:
`result-state.spec.ts` imports it and annotates `let state`.

> **Correction, made during implementation.** This spec and finding F-23
> originally claimed a sweep for the identifier outside its own file returned
> nothing. That sweep was wrong: the pattern `ResultState$` was passed to `grep`
> unescaped, where `$` anchors to end of line, so it matched nothing anywhere.
> The name has two readers in `result-state.spec.ts`. This makes the rename
> slightly larger and the finding slightly more worth fixing, since the bad name
> is already being written down.

## The fix

A rename. No behaviour changes, no signature changes, no test changes.

| Now | After | Why |
| --- | --- | --- |
| `ResultState$<T>` (exported) | `ResultSignals<T>` | Says what it is: the signals a result page reads |
| `ResultState<T>` (private union) | `ResultStatus<T>` | Frees the better name and describes a status, not a bag of signals |
| `ResultStateConfig<T>` | `ResultSignalsConfig<T>` | Follows its interface |

`createResultState` keeps its name. It still creates the result state; only the
types were misnamed. The file stays `result-state.ts` for the same reason —
renaming it would churn two import lines for no gain.

### Must not break

- **Nothing.** This is a rename with no behaviour. The full `ui` suite must pass
  unchanged. `result-state.spec.ts` changes, but only where it names the type:
  any other edit to it would mean the rename was not a rename.
- The private union must stay private. It is not exported today and this fix
  must not export it.

### Out of scope

- **F-21** (the held count after a filter change) and **F-22** (no-op mutation
  re-issues the request). Both touch behaviour and both want their own verified
  change. Bundling a behaviour fix into a rename is how a rename stops being
  reviewable.
- Renaming the file.

## Build steps

- [x] **1. Rename the three types.** Apply the table above in
  `ui/src/app/core/result-state.ts`, updating the doc comments that name the old
  identifiers so they do not go stale.
  **Done when** `npx tsc -p tsconfig.app.json --noEmit` and
  `npx tsc -p tsconfig.spec.json --noEmit` are clean, a correctly escaped
  repository-wide sweep for the old identifiers returns nothing, the full `ui`
  suite passes, and `git diff --name-only` lists exactly `result-state.ts` and
  `result-state.spec.ts` with the spec's diff containing only the type name.

## Verify

- `npx tsc -p tsconfig.app.json --noEmit` and `tsconfig.spec.json` — clean.
- `npm test` in `ui/` — 317 passing, with the `result-state.spec.ts` diff
  limited to the two lines that name the type.
- `npm run build` in `ui/` — clean.
- `api/` untouched: provable from `git diff --name-only`, so no command needed.
- Nothing to click. A rename with no behaviour has no manual path, and inventing
  one would be noise.

## Findings

Resolved findings, archived with this work item.

> These four were raised against feature 8 and repaired by the preceding fix,
> `extract-the-shared-result-state-machine`. They were still `fixed` when that
> fix completed, so they correctly stayed in the live ledger; the `/audit full`
> pass that closed them ran afterwards. They archive here because this is the
> next completion, not because this rename resolved them. Each entry's **Found**
> line preserves where it came from.

### rename-the-shared-result-state-api/F-13 [P2] closed - The paging footer claims "Page 1 of 1" for the whole round trip after every paging click

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


**Re-review 2026-09-11 (/audit full):** Closed. `core/result-state.ts:159` is now
the single definition of `page`, falling back to `store.query().page`. Neither
page file contains a pager computed any more. Verified by reinstating the
literal `1` in the shared module: six specs fail across both tabs and
`result-state.spec.ts`, where the pre-extraction defect failed two.

### rename-the-shared-result-state-api/F-16 [P2] closed - A second re-query issued before the first settles loses the held meta, and the footer collapses to "Page N of 1"

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


**Re-review 2026-09-11 (/audit full):** Closed. `heldMeta` at
`core/result-state.ts:99` is set in a `tap` when an answer settles and read when
each inner pipe is built, so it survives any number of consecutive in-flight
re-queries rather than one. `result-state.spec.ts` covers a second re-query, a
five-deep run, and a query edit rather than a paging click, and all three fail
when the hold is cleared after a single read. The staleness this hold implies
for a *filter* change is a distinct question, recorded separately as F-21 rather
than held against this repair.

### rename-the-shared-result-state-api/F-17 [P2] closed - The series tab's half of the F-13 guard cannot fail, so that page's pager repair is unproven

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


**Re-review 2026-09-11 (/audit full):** Closed. The degenerate
`toContain('of ' + settledCount)` is gone from `series.spec.ts`, replaced by a
comment naming where the count is covered instead. The page-number assertion
that remains is a genuine guard: reinstating the F-13 defect still fails it.

### rename-the-shared-result-state-api/F-18 [P2] closed - Observations and Series carry a verbatim copy of the same result state machine, and every repair has had to be made twice

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


**Re-review 2026-09-11 (/audit full):** Closed. `observations.ts` is 112 lines
and `series.ts` 151, down from 223 and 228. Neither contains `ResultState`,
`toSignal`, `switchMap`, `pagerMeta` or `ready()`; a targeted sweep for each
returned nothing. Both delegate to `createResultState` and keep only their own
derived members. The duplication is genuinely gone rather than moved.
