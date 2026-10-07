# Fix: Export row count and indicator scale

**Type:** Fix

**Status:** verified

**Branch:** `fix/export-row-count-and-indicator-scale`

**Fixes:** F-115, F-116

## The problem

- **F-115: the Export card can show a series count as rows.**
  `createResultState` (`ui/src/app/core/result-state.ts:121`) records every
  settled envelope in `LastResultMeta`, from both Observations and Series. On
  `/series`, `totalCount` counts series, not rows (guide 4.4), and
  `export-card.ts:93` renders `metaFor(query).totalCount` as "N rows". So after
  the Series tab runs, the card reads "2 rows" for a download that writes
  dozens.
- **F-116: `scale` is fetched but never shown.** `Indicator` and `Series` both
  carry `scale` (`macro-contracts.ts`), and the guide says to read unit "and
  sometimes scale - never assume". No template shows it:
  - not the catalogue's Unit column (`countries-indicators.html:147`);
  - not the series metadata table (`series/series.html:66`);
  - not the chart (`core/series-chart.ts`: the tooltip and table text at `:275`
    and `:336`, the meta line at `:295`, and the description at `:410`).

  A value in billions reads as plain units.

## The fix

- **F-115:** `LastResultMeta` records which endpoint answered.
  - `record(query, meta, source)` takes `'observations' | 'series'`, and
    `createResultState` gains a matching `source` field in its config that each
    tab passes.
  - Add `rowCountFor(query)`. It returns `totalCount` only when the observed
    answer came from `observations` for exactly this query, otherwise `null`.
    The Export card uses it, and `null` is already rendered as "unknown".
  - `metaFor` and `idsFor` are unchanged. Vintage ids are provenance for the
    query whichever tab answered, so saving after the Series tab keeps
    recording them.
- **F-116:** add one pure helper, `unitLabel(unit, scale)`, in
  `core/value-format.ts`.
  - It returns `unit` when `scale` is null or blank, otherwise
    `<unit> (<scale>)`, for example `National currency (Billions)`.
  - Use it in the catalogue Unit column, the series table Unit column, and the
    chart's tooltip and table text, meta line and accessible description.
  - Rendering stays interpolation only.

**Must not break:**
- saved queries recording vintage ids after either tab;
- the Export card's existing unknown state;
- the chart's existing output when `scale` is null, which covers every current
  fixture.

## Build steps

- [x] **1. F-115: endpoint-aware row count.**
  - Change `last-result-meta.ts`, `result-state.ts`, and the two callers
    (`observations.ts`, `series.ts` pass their `source`).
  - Change `export-card.ts` to use `rowCountFor`.
  - Specs:
    - `last-result-meta.spec.ts`: `rowCountFor` gives the count after an
      observations record, `null` after a series record for the same query, and
      `null` for a different query; `idsFor` still answers after a series
      record;
    - one Export card spec: after the Series tab's answer, the card shows the
      unknown row count, not the series total.

  **Done when:** `npm test` passes in `ui/`.

- [x] **2. F-116: show the scale.**
  - Add `unitLabel` and its spec (null, blank and present scale).
  - Use it in the three templates and code paths above.
  - Give one indicator in `core/fixtures/macro-fixtures.ts` a non-null scale.
    Then specs assert it in the catalogue row, the series table row and the
    chart tooltip text.
  - Check during build that no existing spec asserts the old unit text for that
    indicator. If one does, update it.

  **Done when:** `npm test` and `npm run build` pass in `ui/`.

## Verify

- `npm test` and `npm run build` in `ui/`. The API is unchanged.
- In the console:
  1. Add an indicator with two countries, then open Series, then Saved queries.
     The Export card says the row count is unknown, not "2 rows".
  2. Open Observations, then Saved queries. It shows the real row count.
- With Curated off in the catalogue, an indicator that has a scale shows it next
  to its unit. This needs live data with a non-null scale.
