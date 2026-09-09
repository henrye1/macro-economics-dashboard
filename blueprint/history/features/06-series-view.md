# Feature: Series view

**From build-plan:** feature 6

**Branch:** `feature/series-view`

**Status:** verified

## Goal

Show the same working query grouped the way a model consumes it: one object per
indicator and country, history and forecast in one row of points, with the
`lastActualYear` boundary drawn where it actually falls.

This is the tab that teaches recipe 5.1 from the consumer guide — "split each
series at `lastActualYear` to get history for fitting and the forecast path for
scenarios". Observations proves the data exists; Series proves it is usable.

## Design reference

**`prototypes/series.html`** — the only tab whose reference is a prototype rather
than a PNG. `blueprint/references/3-series.png` is misnamed: it shows the
Observations empty state, which feature 5 already consumed. The prototype was
written to fill that gap and says so in a banner.

The prototype is a proposal, not a locked design. Its banner reads *"This screen
has no design reference… Push back on it freely."* Treat its structure as the
starting point and its self-declared uncertainty as real.

Structure to reproduce:

| Element | Prototype |
| --- | --- |
| Working query card | the shared card, summary ending `· 3 series` |
| Header card | `Series` + `3 series · pagination counts series, not rows` + a legend |
| Legend | Actual swatch, Forecast swatch, dashed `lastActualYear` marker |
| One card per series | head: mono code + plain-text name, right `series 2 of 3` |
| Sub-strip | Country, Unit, Source, Vintage, lastActualYear as key/value pairs |
| Points row | horizontal scroll; each point is year over value, tinted by `isForecast` |
| Boundary | dashed navy vertical rule with a rotated `LASTACTUALYEAR` label |
| Card foot | the split-at-the-boundary explanation, on the last card |

**Do not ship the `.undesigned` banner.** It is a note to us, not to a client.

Every colour the prototype uses is already a token in `ui/src/styles.scss`
(`--badge-actual-bg`, `--badge-forecast-bg`, `--navy`, the spacing and type
scales). No new tokens are needed.

## In scope

- `/series` in the fixture provider: grouping, ordering, `lastActualYear`, and
  series-level paging, driven by the same filters as `/observations`.
- Series derived from the **existing observation fixtures**, so the two tabs can
  never disagree about a number.
- The Series page: header card with legend, one card per series, the points row,
  and the boundary marker.
- Every state that applies: populated, loading, empty (valid query, no data),
  invalid query (no request issued), and provider failure.
- A shared paging footer component, used by both Observations and Series.
- Replacing the card's `observationCount` input with a general `resultSummary`,
  so Series can say `3 series` without the card learning a second noun.
- Narrowing the placeholder loop in `app.spec.ts` now that `/series` is real.

## Out of scope

- **Any charting library.** The overview is explicit: "no charting library until
  the Series tab genuinely needs one". Points are tinted boxes, not a plot.
- `SAVE QUERY` (feature 10) and `EXPORT` (feature 11), both of which the
  prototype draws.
- Real HTTP, ETags, `304`, RFC 7807 (features 7 and 8).
- Revisions, appeared and disappeared series (feature 9).
- Any change to Observations beyond retargeting it at the two shared pieces.

## Build loop

`workflow.stepReview: "feature"` and `workflow.checkpointCommits: "disabled"`.
Build all four steps, then present one review packet. `/complete` makes the
single feature commit.

Verification per step: `npm run build` and `npm test` in `ui/`. No `Verify`
command is declared. `api/` is untouched.

## Build steps

- [x] **1. `/series` in the provider.** Add an exported `groupIntoSeries()` next
  to `filterObservations()` in `fixture-macro-data.provider.ts`, wire it into
  `series()` with series-level paging, and delete the now-unused empty
  `FIXTURE_SERIES` from `macro-fixtures.ts`. Leave `revisions()` alone.
  **Done when** the provider spec proves: the same query returns 56 observations
  and 4 series; each series carries `name` and `unit` from `FIXTURE_INDICATORS`
  and `vintage` as the **label**, not the id; `points` are year-ascending and
  hold exactly the filtered rows for that series; `lastActualYear` is the
  vintage's boundary and does **not** move when the year range or `forecast`
  filter narrows the visible points; series are ordered indicator, then country;
  `meta.totalCount` counts **series, not rows**; `pageSize: 2` with `page: 2`
  returns the third and fourth series; and a coverage-gap query returns empty
  `data` with no vintages.

- [x] **2. Shared paging footer.** Extract the footer strip built in feature 5
  into `ui/src/app/query/paging-footer.{ts,html,scss}`: a presentational
  component taking page, page count, page size and vintage labels, with `prev`
  and `next` outputs. Retarget `ObservationsPage` at it and delete the
  duplicated markup and styles.
  **Done when** `npm test` still passes every feature 5 paging assertion
  unchanged — the strip text, both disabled ends, and the empty, invalid and
  unavailable cases — and a new `paging-footer.spec.ts` proves it emits `prev`
  and `next` only while the matching direction is enabled.

- [x] **3. The Series page.** Replace the `SeriesPage` placeholder with
  `series.{ts,html,scss}`: the shared query card, the header card with its
  legend, one card per series with sub-strip and points row, the boundary marker
  placed between the last actual and first forecast point **in view**, the
  shared paging footer, and all four non-populated states. Promote nothing to
  `styles.scss` that only this page uses; port the prototype's series CSS into
  `series.scss`. Narrow the `app.spec.ts` placeholder loop to the three
  remaining placeholders and assert `/series` renders a real page.
  **Done when** `series.spec.ts` proves: four series cards render for the design
  query, each with its sub-strip facts; a point after `lastActualYear` carries
  the forecast class and one before it the actual class; the boundary marker
  sits between 2025 and 2026; the marker is **absent** when `lastActualYear`
  falls outside the visible year range, while the sub-strip still states it; the
  empty, invalid and unavailable states each show their message with
  `role="status"`; and no request is issued for an invalid query.
  `app.spec.ts` passes with `/series` asserted as a real page.

- [x] **4. `resultSummary` on the shared card.** Replace
  `WorkingQueryCard.observationCount` with `resultSummary: string | null`
  (default `null`). The host formats the phrase; the card only appends
  `· {{ resultSummary() }}`. `ObservationsPage` passes `56 observations`,
  `SeriesPage` passes `4 series`.
  **Done when** `working-query-card.spec.ts` proves the summary omits the suffix
  by default, renders a host-supplied phrase verbatim, and still renders a
  zero-count phrase; `observations.spec.ts` still shows `· 56 observations` and
  the singular `· 1 observation`; and `series.spec.ts` shows `· 4 series` and
  `· 1 series` — the same word both times, which is why the noun cannot live in
  the card.

## Files / areas

| Path | Change |
| --- | --- |
| `ui/src/app/core/fixtures/fixture-macro-data.provider.ts` | `groupIntoSeries()`, real `series()` |
| `ui/src/app/core/fixtures/fixture-macro-data.provider.spec.ts` | extend |
| `ui/src/app/core/fixtures/macro-fixtures.ts` | drop the empty `FIXTURE_SERIES` |
| `ui/src/app/query/paging-footer.{ts,html,scss}` | new — shared footer |
| `ui/src/app/query/paging-footer.spec.ts` | new |
| `ui/src/app/query/working-query-card.{ts,html}` | `observationCount` becomes `resultSummary` |
| `ui/src/app/query/working-query-card.spec.ts` | update |
| `ui/src/app/series/series.ts` | placeholder becomes the real page |
| `ui/src/app/series/series.{html,scss}` | new |
| `ui/src/app/series/series.spec.ts` | new |
| `ui/src/app/observations/observations.{ts,html,scss}` | use the shared footer and `resultSummary` |
| `ui/src/app/observations/observations.spec.ts` | update the summary assertions only |
| `ui/src/app/app.spec.ts` | narrow the placeholder loop |

Untouched: `macro-contracts.ts`, `macro-data.provider.ts`, `working-query.ts`,
`working-query.store.ts`, `app.routes.ts`, `observation-fixtures.ts`,
`styles.scss`, all of `api/`. `/series` is already routed to `SeriesPage`, so no
routing change.

## Data / contracts

**No API contract changes.** `Series`, `SeriesPoint` and `SeriesQuery` are
already typed. `SeriesQuery = ObservationsQuery`, so requests come from the same
`WorkingQueryStore.apiQuery` — do not build a query object in the page.

**Series are derived, not authored.** `groupIntoSeries()` runs
`filterObservations()` and groups the result by `(indicator, country, source)`.
A static `FIXTURE_SERIES` could drift from `FIXTURE_OBSERVATIONS` and quietly
teach that the two endpoints disagree, which is the opposite of what a single
contract is for.

Field sources, all from data already in the repo:

| Field | From |
| --- | --- |
| `indicator`, `country`, `source` | the group key |
| `name`, `unit` | `FIXTURE_INDICATORS` by code |
| `vintage` | `FIXTURE_VINTAGES` **label** for the rows' `vintageId` |
| `points` | the filtered rows, year ascending, as `{ year, value, isForecast }` |
| `lastActualYear` | see below |

**`lastActualYear` is a property of the vintage, not of the query.** Compute it
from **all** fixture rows for that `(indicator, country, source, vintageId)` —
the newest non-forecast year — never from the filtered points. A user who asks
for 2027 onward gets an all-forecast window whose `lastActualYear` is still
2025, which is the truthful answer and what the live API returns. Deriving it
from the visible points would make the boundary follow the filter around.

**One vintage per series.** Without a pin, `filterObservations` already returns
only the latest vintage per source, and `preferred` collapses to one source per
cell, so a group cannot mix vintages. The grouping must still assert this rather
than assume it: if a group ever spans vintage ids, that is a fixture bug and
should fail a test, not silently pick one.

**Paging counts series.** `meta.totalCount` is the series count and
`meta.pageSize` slices series. This is the one place the two result tabs differ,
and the header card says so in words.

**`meta.vintages`** follows feature 5: derived from the rows behind the whole
result, empty when there is no result.

**Point values** reuse the one-decimal grouped format Observations established.
Extract that formatter so both pages read the same rule.

**No request on an invalid query**, same as Observations: `validateWorkingQuery`
catches the two documented `400` cases before anything is sent.

**Authorization and tenancy:** none. Read-only, no login in v1, no writes, no
persistence, no user-controlled text reaching storage. All rendering goes through
Angular interpolation, which escapes by default; no `innerHTML`.

## Testing

`ui/` uses Karma and Jasmine (`npm test`); tests gate every logic-bearing step
here.

- `fixture-macro-data.provider.spec.ts` — grouping, field sourcing, point order,
  `lastActualYear` independence from filters, single-vintage-per-series,
  series-level paging, `meta` honesty, empty results.
- `paging-footer.spec.ts` — rendered strip, disabled ends, outputs only when
  enabled.
- `series.spec.ts` — the five states, sub-strip facts, point classes, boundary
  placement including its absence, and the summary suffix.
- `observations.spec.ts` — unchanged except the `resultSummary` assertions.
- `app.spec.ts` — three remaining placeholders plus `/series` as a real page.

Accessibility, consistent with features 3 to 5: state messages carry
`role="status"`; paging controls stay real `<button type="button">` elements with
accessible labels and a genuine `disabled`; each series card is a `<section>`
with an accessible name from its heading; the points row is not a table, so it
needs an `.sr-only` summary naming the indicator, country and year span; and the
boundary marker is decorative, so its rotated label is `aria-hidden` with the
same fact available as text in the sub-strip.

No browser-test command exists, so no browser coverage is added. No live,
visual, or integration evidence may be claimed.

## Notes for the AI

- **The boundary is the feature.** If a reviewer cannot see at a glance where
  history stops and forecast starts, the tab has failed regardless of test
  results.
- **`vintage` is the label, `meta.vintages[].id` is the id.** The contract type
  comments say so; getting this backwards is the easiest mistake here.
- **Series count, not row count**, everywhere a number appears on this tab.
- **The prototype invites pushback.** Two of its choices are worth a second look
  while building: 25 full-height series cards on one page is a lot at the
  store's `pageSize`, and a horizontally scrolling points row hides data on a
  narrow window. Neither blocks the build; raise them in the review packet with
  what you saw rather than silently redesigning.
- **Feature 5 code is being touched twice** — the footer extraction and the
  `resultSummary` rename. Both are because Series is the second consumer of a
  thing feature 5 built for one. Keep both changes mechanical: no behaviour
  change to Observations, and its existing specs should pass with only the
  summary assertions edited.
- Synchronous fixtures mean the loading state is implemented but never visible.
  Standing decision from feature 1; feature 8 exercises it.
- Confirm at feature 8: whether the live `/series` returns `lastActualYear`
  independent of the year filter, as assumed here, and its series ordering.
