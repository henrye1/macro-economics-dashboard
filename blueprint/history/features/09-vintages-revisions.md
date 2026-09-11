# Feature: Vintages & revisions

**From build-plan:** feature 9

**Branch:** `feature/vintages-revisions`

**Status:** verified

## Goal

The `/vintages` tab: every published vintage newest first, and for a selected
vintage, what it changed against its predecessor. This is the tab that makes
"published data is immutable, new releases create a new vintage" concrete.

## Design reference

`blueprint/references/5-vintages-and-revisions.png`.

Three regions: a **Published vintages** table, a **Revisions** panel for the
selected vintage, and a summary strip beneath it.

**The design shows things the service does not send.** Feature 8's live probe
settled the `Revision` shape at exactly
`indicator, country, year, previousValue, newValue` — no `significant`, no
predecessor identity, and no appeared/disappeared payload. Four decisions are
binding on this feature:

| Design element | Decision |
| --- | --- |
| `Flagged · Significant` pill and `Significant only` toggle | **Derive in the UI**, labelled as derived, using the threshold the design itself prints |
| `vs WDI 2025-09-19` predecessor label | **Derive** as the next-lower vintage id of the same source |
| Series that appeared / disappeared | **Derive** from the null pattern in `previousValue` / `newValue` |
| **Last actual year moved** | **Deferred.** Not derivable from `Revision` at all; it needs `lastActualYear` for two vintages, which is a second query design |

## In scope

- **Published vintages table** — `id`, `Label`, `Source`, `sourceVersion`,
  `retrievedAtUtc`, and an `isLatest` pill reading `Latest` or `Superseded`.
  Newest first. A row is selectable and selecting it loads that vintage's
  revisions.
- **Revisions panel** — header `Revisions · <label>` with `vs <predecessor
  label>`, the derived-threshold note, a `Significant only` toggle, and a table
  of `Indicator, Country, Year, Previous, New, Change, Flagged`.
- **Paging over revisions.** `/vintages/12/revisions` returned
  `totalCount: 2830`. The design shows no pager, but 2,830 rows is not a page,
  so the existing presentational `PagingFooter` is reused with this tab's own
  page state.
- **Derived significance**, with the rule rendered in the UI so it never reads
  as service data.
- **Summary strip** — `Series that appeared` and `Series that disappeared`,
  grouped by indicator and country with a year range.
- **Every state feature 8 established**: loading, empty, unavailable with the
  service's own `detail`, each in a `role="status"` slot.

## Out of scope

- **Last actual year moved.** Deferred by decision, above. Do not add
  `/series` calls to compute it.
- **The working query.** This tab does not use `WorkingQueryStore`, does not
  show `WorkingQueryCard`, and must not touch either. Its only input is a
  vintage id.
- **`createResultState`.** It injects `WorkingQueryStore` and is driven by the
  working query. This tab's request is a vintage id, so it needs its own small
  pipeline. Do not bend the shared machine to fit.
- Saved queries (10), export (11), request builder (12).
- Any change to `api/`, the provider interface, or transport. `revisions()`
  already exists on `MacroDataProvider` and needs no change.

## Build loop

`workflow.stepReview: "feature"` and `workflow.checkpointCommits: "disabled"`.
Build all five steps, then present one review packet. `/complete` makes the
single feature commit.

Verification per step: `npm test` and `npm run build` in `ui/`. No `Verify`
command is declared. `api/` is untouched, so run its suite once at the end only
to prove that claim.

## Build steps

- [x] **1. Derivations.** Add `ui/src/app/core/revision-view.ts`: pure functions
  for the change value, the significance rule, and the appeared/disappeared
  grouping. No Angular, no component.
  **Done when** `revision-view.spec.ts` proves each rule against the contract in
  Data / contracts below: change is `newValue - previousValue` and `null` when
  either side is null; significant is `|change| > 0.5` **or**
  `|change / previousValue| > 0.10`; a `previousValue` of exactly `0` uses the
  absolute test only and never divides; a row with a null side is never
  significant; appeared groups rows with a null `previousValue` by indicator and
  country into a year range; disappeared does the same for a null `newValue`; a
  single-year group renders one year, not `2023–2023`.

- [x] **2. Revision fixtures.** `FIXTURE_REVISIONS` is currently `[]`, so the
  tab cannot be exercised. Populate it against the corrected `Revision` shape.
  **Done when** the fixtures cover, at minimum: a significant negative change, a
  significant positive change, a change below both thresholds, a row whose
  `previousValue` is `0`, an appeared row (`previousValue: null`) and a
  disappeared row (`newValue: null`); and the existing fixture-provider specs
  still pass.

- [x] **3. Published vintages table.** Replace the `VintagesPage` placeholder
  with the table: six columns, sorted by `id` descending, `Latest`/`Superseded`
  pill, row selection.
  **Done when** its spec proves the rows render newest first regardless of the
  order the provider returned, that the pill reads from `isLatest`, that
  selecting a row marks it selected and is keyboard reachable, that the loading
  and unavailable states render in a `role="status"` slot, and that an empty
  vintage list says so rather than showing an empty table.

- [x] **4. Revisions panel.** The header, predecessor label, threshold note,
  `Significant only` toggle, table and pager.
  **Done when** its spec proves: nothing is requested until a vintage is
  selected, and the panel shows a prompt instead; the predecessor label is the
  next-lower id of the **same source** and reads as having none when the
  selected vintage is that source's earliest; the toggle filters to derived
  significant rows and back; `Change` renders with a sign and the negative and
  positive colour classes; a null change renders an em dash and no pill; paging
  moves through `meta.totalCount` using `PagingFooter`; a vintage with zero
  revisions reports that it changed nothing; and a `MacroRequestError` carrying
  a `detail` renders that sentence in a `role="status"` slot, with the tab's own
  wording when it carries none.

- [x] **5. Summary strip.** The appeared and disappeared panels beneath the
  table.
  **Done when** its spec proves each panel lists `CODE · ISO3 · fromYear–toYear`
  entries, reads `None` when empty, and caps the list at the documented limit
  with a truthful "+N more" when exceeded. The strip summarises the rows it was
  given, so the UI must state whether that is the whole result or the current
  page — pick one and label it.

## Files / areas

| Path | Change |
| --- | --- |
| `ui/src/app/core/revision-view.ts` | new — change, significance, appeared/disappeared |
| `ui/src/app/core/revision-view.spec.ts` | new |
| `ui/src/app/core/fixtures/macro-fixtures.ts` | populate `FIXTURE_REVISIONS` |
| `ui/src/app/vintages/vintages.ts` | replace the placeholder component |
| `ui/src/app/vintages/vintages.html` | new template |
| `ui/src/app/vintages/vintages.scss` | new styles |
| `ui/src/app/vintages/vintages.spec.ts` | new |

Untouched: `macro-data.provider.ts`, `http-macro-data.provider.ts`,
`result-state.ts`, `working-query*.ts`, every other page, and all of `api/`.

## Data / contracts

**`Revision` is exactly five fields.** `indicator`, `country`, `year`,
`previousValue`, `newValue`, the last two nullable. Confirmed live at feature 8
across 500 sampled rows. Do not add a field to the contract for this feature.

**Change.**

```
change = previousValue === null || newValue === null
  ? null
  : newValue - previousValue
```

**Significance, derived.** `|change| > 0.5` OR `|change / previousValue| > 0.10`.
Strictly greater on both, matching the design's "more than". When
`previousValue` is `0` the relative test is undefined and only the absolute test
applies — never divide by zero and never treat the result as infinite. A null
change is never significant.

**This flag is client-derived and must read that way.** The overview describes
significance as server-side; the service does not send it. The threshold note is
rendered in the panel exactly as the design shows, so the number on screen is
never mistaken for service data. When feature 17 generates types from the
OpenAPI document, this derivation is the first thing to reconcile.

**Predecessor.** The revisions response does not say what it was compared
against. The predecessor is the vintage with the greatest `id` **less than** the
selected id **and the same `source`**. The design confirms the rule: WDI 13 is
shown against WDI 11, skipping WEO 12. A vintage that is the earliest of its
source has no predecessor and the label must say so rather than render
`undefined`.

**Appeared and disappeared.** A row with `previousValue: null` is a cell the
vintage added; with `newValue: null`, one it dropped. Group by
`(indicator, country)`, report the min and max `year`.

**`retrievedAtUtc` is rendered verbatim.** The value arrives with no zone
designator (`2026-09-08T01:00:31.5083586`), so `new Date(...)` reads it as local
time. The design prints the raw string; printing it verbatim is both correct and
the only option that cannot be wrong.

**Values use the shared `formatValue`.** One decimal, grouped thousands. The
design's mock shows `7 036` where `formatValue` gives `7,036.0`; consistency
with Observations and Series wins, because the overview requires that the same
number never renders two ways. `Change` prefixes `+` for positives.

**Rendering rule for service text.** Interpolation only, as feature 8
established. No `innerHTML`, no `bypassSecurityTrust*`.

**Authorization:** unchanged. No token, cookie or credential in the client.

## Testing

`ui/` uses Karma and Jasmine (`npm test`). Tests gate every logic-bearing step.

- `revision-view.spec.ts` — every rule and edge case in Data / contracts.
- `vintages.spec.ts` — the table, selection, the panel's states, the toggle,
  paging, and the summary strip.
- Page specs use `FixtureMacroDataProvider`, as the project's other page specs
  do. It now models the observed per-route `meta`, so `/vintages` correctly
  reports `page: null` and `vintages: []`.

No browser-test command exists, so no browser coverage is added.

## Notes for the AI

- **Do not reach for `createResultState`.** It is bound to the working query.
  This tab's request key is a vintage id. A small local `toSignal` pipeline over
  the selected id is the right shape, and it should carry the same lesson: emit
  a loading state per request, not only on first load.
- **The 2,830-row result is the real constraint.** Page it. A tab that renders
  every revision will be the slowest screen in the console.
- **Watch the null-heavy result.** All 500 sampled rows from
  `/vintages/12/revisions` had `previousValue: null`. If that holds generally,
  most rows will show an em dash for Change and no pill, and the appeared panel
  will be large — which is why step 5 requires a cap and a truthful overflow
  count. If live data shows the table is mostly empty dashes, stop and raise it
  rather than shipping a table that looks broken.
- **`FIXTURE_REVISIONS` is empty today.** Nothing renders until step 2, so the
  step order matters.
- The oldest vintage of a source has no predecessor. Decide what the API returns
  for it from observed behaviour, not assumption; until observed, render
  whatever comes back and label the predecessor as absent.

## Open questions

> **None blocking.** The two that were blocking are decided and recorded above:
> significance is client-derived with the documented threshold, and the summary
> strip ships appeared and disappeared only.
>
> One thing this feature is expected to surface rather than settle: whether
> `previousValue: null` dominates real revision results. If it does, the
> design's Change and Flagged columns are near-empty against live data and the
> tab's shape is a product question for a later pass, not a defect in this one.

## Findings

Resolved findings, archived with this work item.

> Both were raised against earlier work and repaired by the two fixes
> that preceded this feature. They were still `fixed` when those fixes
> completed, so they stayed in the live ledger; the `/audit full` pass
> that closed them ran afterwards. They archive here because this is the
> next completion, not because feature 9 resolved them. Each entry's
> **Found** line preserves where it came from.

### 09/F-22 [P3] closed - A no-op query mutation re-issues the request, and feature 10 will make that reachable

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
**Resolution:** Fixed on 2026-09-11 as suggested. `sameWorkingQuery` in
`core/working-query.ts` compares all nine fields, with the two arrays by content
and order, and a private `settle()` in the store returns `current` when the
built candidate matches. Both mutators build the candidate before comparing,
because `patch` also forces `page: 1`: re-selecting the current source while on
page 3 is a real change, and a spec pins that. Verified by removing the
comparison: nine specs fail, eight on reference identity and one on the round
trip itself. Also covered: clamped (`setPage(0)`) and truncated
(`setPage(3.7)`) values that resolve to the current page are no-ops too. `ui`
353 tests, up from 317.


**Re-review 2026-09-11 (/audit full):** Closed. `working-query.store.ts:116`
returns `current` when `sameWorkingQuery` matches the built candidate, and both
`patch` and `setPage` route through it. The build-then-compare ordering is
correct and pinned: re-selecting the current source on page 3 still emits,
because `patch` forces `page: 1`. Removing the comparison fails nine specs,
including the round-trip count in `result-state.spec.ts`, which is the claim
this finding actually made. The comparison's exhaustiveness and the store's
unguarded remaining mutation paths are separate forward-looking concerns,
recorded as F-24 and F-25 rather than held against this repair.

### 09/F-23 [P3] closed - The shared result API is named with an Observable convention but returns only Signals

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


**Re-review 2026-09-11 (/audit full):** Closed. The exported interface is
`ResultSignals<T>`, its config is `ResultSignalsConfig<T>`, and the private union
is `ResultStatus<T>` and still unexported. A correctly escaped `grep -F` for both
old identifiers returns nothing. `createResultState` and the file name are
unchanged, which is right: the function was never misnamed. No `$`-suffixed
symbol remains anywhere in the codebase.
