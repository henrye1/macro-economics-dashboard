# Feature: Observations table

**From build-plan:** feature 5

**Branch:** `feature/observations-table`

**Status:** verified

## Goal

Turn `/observations` from a query builder with nothing under it into the tab that
answers the query. Paginated flat rows, an Actual/Forecast badge per row, the
vintage ids the values came from, and empty states that read as answers rather
than failures.

This is the first tab that actually runs the working query through
`MACRO_DATA`, so it is also where the fixture provider stops being a stub for
`/observations`: it gains real filtering, ordering, paging and `meta.vintages`,
all implemented exactly as `CONSUMER-GUIDE.md` §4.3 documents them.

## Design reference

- `blueprint/references/4-observations.png` - **populated**. Working query card
  on top (already built), Observations card below it.
- `blueprint/references/3-series.png` - **the Observations empty state**, not
  Series. The file is misnamed; Series has no design. Read it for the empty-state
  wording, the retained header row, and the both-buttons-disabled footer.

Read off the populated design and treated as binding:

| Element | Design |
| --- | --- |
| Card head | `Observations` left; `Rows 1–25 of 56` right |
| Columns | Indicator, Country, Year, Value, isForecast, Source, vintageId |
| Alignment | Year, Value, vintageId right-aligned; the rest left |
| Indicator cell | navy, bold, mono - the catalogue's code look, not a control |
| Badges | `Actual` green pill, `Forecast` amber pill |
| Footer left | `Page 1 of 3 · pageSize 25 · vintages WEO 10.0.0 2026-04-14` |
| Footer right | `PREV` (disabled on page 1), `NEXT` |
| Row order | indicator asc, then country asc, then year asc |
| Query summary | `2 indicators × 2 countries · 2018–2031 · 56 observations` |

The row order is not a guess: page 1 of the design shows `CPI_INFLATION_AVG`
NAM 2018-2031 then `CPI_INFLATION_AVG` ZAF 2018-2028, which is exactly 25 rows
of a 56-row result for 2 indicators × 2 countries × 14 years.

From the empty design:

| Element | Design |
| --- | --- |
| Card head right | `No rows — the query was valid, the source just does not report this combination` |
| Table | header row still rendered, no body |
| Footer | `Page 1 of 1 · pageSize 25 · vintages —`, both buttons disabled |
| Query summary | `3 indicators × 0 countries · 2018–2031 · 0 observations` |

## In scope

- Deterministic observation fixtures covering the existing 12 countries, 13
  indicators and 5 vintages, including combinations with **no data at all** so
  the empty state is reachable from a valid query.
- `/observations` filtering in the fixture provider as documented: `indicators`
  (required), `countries`, `yearFrom`/`yearTo` (inclusive), `source`
  (`preferred` means WEO wins wherever it exists), `vintage` (pinning implies
  its source), `forecast`, `page`/`pageSize`.
- Deterministic ordering and honest `meta.page`, `meta.pageSize`,
  `meta.totalCount` and `meta.vintages` from the fixture provider.
- The Observations card: head with row range, the seven-column table, Actual and
  Forecast badges, and the footer paging strip.
- Every state that applies: populated, loading, empty (valid query, no data),
  invalid query (no request issued), and provider failure.
- The `· N observations` suffix on the working-query summary that feature 3
  deliberately left off.
- `.badge.actual`, `.badge.forecast` and a non-interactive code primitive in
  `ui/src/styles.scss`, using the tokens already ported at feature 1.

## Out of scope

- **The `EXPORT` button** the design shows in the Observations card head.
  Feature 11 owns export. Do not render a dead control.
- **`SAVE QUERY`** in the working query card head. Feature 10 owns it; feature 3
  already decided not to ship it early.
- Series grouping and the `lastActualYear` boundary view (feature 6).
- Real HTTP, ETags, `304`, RFC 7807 rendering (features 7 and 8).
- The revisions view (feature 9). This feature generates per-vintage values
  because the working query already lets a user pin a vintage; it does not build
  any revision UI or type the appeared/disappeared summary.
- Any change to the catalogue, overview or shell.
- A `Unit` column. The design does not have one and the catalogue is where unit
  is taught.

## Build loop

`workflow.stepReview: "feature"` and `workflow.checkpointCommits: "disabled"`.
Build all five steps, then present one review packet. No checkpoint commits;
`/complete` makes the single feature commit.

Verification per step: `npm run build` and `npm test` in `ui/`. There is no
declared `Verify` command. `api/` is untouched, so its suite is not a gate here.

## Build steps

- [x] **1. Observation fixtures.** Add
  `ui/src/app/core/fixtures/observation-fixtures.ts` with a deterministic
  generator and a coverage map, exporting `FIXTURE_OBSERVATIONS`. Replace the
  empty `FIXTURE_OBSERVATIONS` in `macro-fixtures.ts` with a re-export so
  existing imports keep working. No UI change.
  **Done when** `npm test` passes a new `observation-fixtures.spec.ts` proving:
  values are identical across two calls (no randomness); WEO rows exist for
  2010-2031 with `isForecast` false through 2025 and true from 2026; WDI rows
  end at 2024 and are never `isForecast`; at least one valid
  (indicator, country) pair yields zero rows; and every row's `vintageId`
  matches a `FIXTURE_VINTAGES` id.
  *Built as a plain move, not a re-export: `observation-fixtures.ts` reads the
  countries, indicators and vintages from `macro-fixtures.ts`, so re-exporting
  back would close an import cycle. The provider was the only importer, so it
  now imports from the new module directly.*

- [x] **2. Provider filtering, ordering and paging.** In
  `fixture-macro-data.provider.ts` add an exported `filterObservations()`
  alongside the existing `filterIndicators()`, wire it into `observations()`,
  and give `envelope()` an optional page and vintage-refs argument so
  `meta.page`, `meta.pageSize`, `meta.totalCount` and `meta.vintages` are real.
  Leave `series()` and `revisions()` untouched.
  **Done when** `fixture-macro-data.provider.spec.ts` proves: an unknown but
  well-formed indicator code returns `200` with empty `data`; `countries`,
  `yearFrom`/`yearTo`, `forecast` and `source` each narrow the result;
  `source: 'preferred'` returns the WEO row where both sources have one;
  pinning `vintage: 12` returns only `vintageId` 12 rows and different values
  than `latest`; rows come back sorted indicator, country, year ascending;
  `page: 2` with `pageSize: 25` returns rows 26-50 with `meta.totalCount`
  unchanged; and `meta.vintages` reflects only the sources actually present.

- [x] **3. The table.** Promote `.badge.actual`, `.badge.forecast` and a
  non-interactive `.code-text` (navy, bold, mono) into `ui/src/styles.scss`,
  refactoring `.code-link` to build on it. Split `ObservationsPage` into
  `observations.ts` / `.html` / `.scss` and render the Observations card: head
  with `Rows A–B of N`, the seven columns with the design's alignment, badges,
  and the four non-populated states. Render `data` in the order received; never
  re-sort in the component.
  **Done when** `observations.spec.ts` proves: 25 rows render for a default
  `pageSize` query with the head reading `Rows 1–25 of 56`; a forecast row shows
  the `Forecast` badge and an actual row shows `Actual`; a valid query with no
  data shows the design's empty message with the header row still present and no
  `tbody` rows; a query with no indicators issues no provider call and shows the
  invalid message; and a throwing provider shows `Observations are unavailable.`
  Each non-populated message carries `role="status"`.

- [x] **4. Paging.** Add the footer strip: `Page X of Y · pageSize N · vintages
  <labels>` (`—` when there are none) plus real `PREV`/`NEXT` buttons wired to
  `WorkingQueryStore.setPage`, disabled at each end and both disabled whenever
  there is nothing to page.
  **Done when** the spec proves: clicking `NEXT` moves to page 2 and re-renders
  rows 26-50; `PREV` is `disabled` on page 1 and `NEXT` is `disabled` on the last
  page; both are `disabled` for an empty, invalid or unavailable result; each is
  a real `<button type="button">` with an accessible label; and changing a filter
  after paging returns to page 1 (already guaranteed by the store, asserted here
  against the rendered footer).

- [x] **5. The observation count in the summary.** Give `WorkingQueryCard` one
  optional input `observationCount` (`number | null`, default `null`) and append
  `· {{ n }} observations` to the summary when it is not `null`. Pass the
  result's `meta.totalCount` from `ObservationsPage`, and `null` while loading,
  invalid or unavailable.
  **Done when** `working-query-card.spec.ts` proves the summary omits the suffix
  by default (so features 6, 10 and 12 mount it unchanged), renders
  `· 0 observations` for `0`, and pluralises `· 1 observation`; and
  `observations.spec.ts` proves the count appears for a populated result and is
  absent for an invalid query.

## Files / areas

| Path | Change |
| --- | --- |
| `ui/src/app/core/fixtures/observation-fixtures.ts` | new - generator, coverage map, `FIXTURE_OBSERVATIONS` |
| `ui/src/app/core/fixtures/observation-fixtures.spec.ts` | new |
| `ui/src/app/core/fixtures/macro-fixtures.ts` | replace the empty `FIXTURE_OBSERVATIONS` with a re-export |
| `ui/src/app/core/fixtures/fixture-macro-data.provider.ts` | `filterObservations()`, paging, `envelope()` args |
| `ui/src/app/core/fixtures/fixture-macro-data.provider.spec.ts` | extend |
| `ui/src/app/observations/observations.ts` | inline template becomes `templateUrl` + page logic |
| `ui/src/app/observations/observations.html` | new |
| `ui/src/app/observations/observations.scss` | new |
| `ui/src/app/observations/observations.spec.ts` | new |
| `ui/src/app/query/working-query-card.ts` | optional `observationCount` input |
| `ui/src/app/query/working-query-card.html` | summary suffix |
| `ui/src/app/query/working-query-card.spec.ts` | extend |
| `ui/src/styles.scss` | `.badge.actual`, `.badge.forecast`, `.code-text` |

Untouched: `macro-contracts.ts`, `macro-data.provider.ts`, `working-query.ts`,
`working-query.store.ts`, `app.routes.ts`, `app.ts`, `app.spec.ts`, all of
`api/`. `/observations` is already a real asserted page in `app.spec.ts`, so the
placeholder loop does not change this time.

## Data / contracts

**No API contract changes.** `Observation`, `ObservationsQuery` and
`Envelope<Observation>` are already typed in `macro-contracts.ts` and stay
byte-identical. The provider interface `MacroDataProvider.observations()` is
unchanged, so feature 8 swaps one provider line and this page keeps working.

**Requests come only from `toObservationsQuery(store.query())`.** Do not build a
query object in the page. That function already omits defaults and drops `source`
when a vintage is pinned; bypassing it would make features 5, 6, 11 and 12
produce different query strings for the same state.

**Fixture generator rules** (fixture data, not contract):

| Rule | Value |
| --- | --- |
| Year span | 2010 through the vintage's forecast horizon |
| WEO 14 (`10.0.0 2026-04-14`) | actuals to 2025, forecasts 2026-2031 |
| WEO 12 (`9.0.0 2025-10-08`) | actuals to 2024, forecasts 2025-2030 |
| WEO 9 (`8.0.0 2025-04-15`) | actuals to 2024, forecasts 2025-2030 |
| WDI 13 (`2026-03-27`) | actuals to 2024, never `isForecast` |
| WDI 11 (`2025-09-19`) | actuals to 2023, never `isForecast` |
| Source coverage | from each `Indicator.sources` entry; WDI-only indicators produce no forecast rows at all |
| Absence | a fixed coverage-gap list of (indicator, country) pairs with no rows in any vintage |
| Revision | a small deterministic per-vintage offset, so pinning an older vintage really changes the numbers |

Values must be plausible for their unit (percent indicators in single digits,
`GDP_PER_CAPITA_USD` in thousands, `REER_INDEX` around 100) and derived purely
from `(indicator, country, year, vintage)`. **No `Math.random`, no `Date.now`.**
The specs assert repeatability, and a nondeterministic fixture would make every
downstream spec flaky.

**Value rendering:** one decimal place with thousands grouping, via a single
`Intl.NumberFormat` instance. The design only shows percent values, where one
decimal matches it exactly; grouping is added because `GDP_PER_CAPITA_USD`
reaches five figures and an ungrouped `65324.1` is harder to read than
`65,324.1`. Never mutate or round the underlying `value`.

**`meta.vintages`:** driven by the rows actually returned - the pinned vintage
when one is pinned, otherwise the latest ref per source present in the result,
and an empty array when there are no rows. The design's footer reads
`vintages WEO 10.0.0 2026-04-14` for an all-WEO result and `vintages —` when
empty, so a constant list would be visibly wrong.

**No request on an invalid query.** `validateWorkingQuery` already catches the
two cases the guide documents as `400` (missing `indicators`,
`yearFrom > yearTo`). The page must not issue a call it knows would fail.

**Authorization and tenancy:** none. The console is read-only, has no login in
v1, and this feature adds no write path, no persistence and no user-controlled
text that reaches storage. All rendering is through Angular interpolation, which
escapes by default; no `innerHTML` anywhere.

## Testing

`ui/` uses Karma and Jasmine (`npm test`). Tests are a gate for logic-bearing
steps, and every step here bears logic.

- `observation-fixtures.spec.ts` - determinism, year spans, forecast boundary
  per vintage, WDI never forecasting, coverage gaps, valid `vintageId`s.
- `fixture-macro-data.provider.spec.ts` - each documented filter, `preferred`
  resolution, vintage pinning, ordering, paging arithmetic, `meta` honesty,
  and empty `data` with a `200`-shaped envelope for a no-data query.
- `observations.spec.ts` - the five states, the row range label, badge mapping,
  paging behaviour, and the count reaching the summary. Drive it by seeding
  `WorkingQueryStore` and overriding `MACRO_DATA`, the pattern
  `countries-indicators.spec.ts` already uses.
- `working-query-card.spec.ts` - the summary with and without the count,
  including `0` and the singular form.

Accessibility assertions, consistent with features 3 and 4: state messages carry
`role="status"`, paging controls are real `<button type="button">` elements with
accessible labels and a genuine `disabled` attribute, and the table carries an
`.sr-only` `<caption>` naming what it lists.

No browser-test command exists, so no browser coverage is added. No live,
visual, or integration evidence may be claimed - the provider is fixtures.

## Notes for the AI

- **The empty state is the product.** "Absence not nulls" is one of the three
  ideas this console exists to demonstrate. Reaching it must require only a
  valid query, never a broken one. Do not remove the coverage-gap list to make a
  screenshot look fuller.
- **`totalCount`, never `data.length`.** The head range, the footer page count
  and the summary count all read `meta.totalCount`. `data.length` is the size of
  the current page and would under-report the moment paging is real.
- **`pageSize` is 25 by design, not 500.** `DEFAULT_WORKING_QUERY` already says
  so, and both design shots print `pageSize 25`. The API's 500 default is what
  the console overrides, not what it displays.
- **The provider filters because the contract is written down.** §4.3 documents
  every one of these parameters. Implementing them is honouring a contract, not
  inventing behaviour - the same reasoning feature 4 used for the indicator
  filters. Keep the class comment about ignored parameters accurate: after this
  step only `series()` and `revisions()` still ignore theirs.
- **Row order is fixture-side.** The live API does not document an order. The
  fixture sorts to match the design; the component renders what it receives.
  Confirm the live order at feature 8 and, if it differs, fix it there rather
  than adding a client-side sort now.
- **The indicator cell is not a control.** In the catalogue, a code is a button
  that adds to the working query. Here it is already in the query, so it renders
  as text with the same look. Do not ship a button that does nothing.
- **Keep the card reusable.** `observationCount` must default to `null` so
  features 6, 10 and 12 can mount `<app-working-query-card />` with no bindings
  and get exactly today's summary.
- Synchronous fixtures mean the loading state is implemented but never visible.
  That is the standing decision from feature 1: no artificial latency in
  production code. Feature 8 exercises it for the first time.
- Two things to confirm against a real response at feature 8, recorded here so
  they are not forgotten: the live row ordering, and whether the service returns
  `meta.vintages` scoped to the result or the latest per source unconditionally.
