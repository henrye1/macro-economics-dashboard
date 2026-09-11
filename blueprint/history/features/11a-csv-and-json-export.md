# Feature: CSV and JSON export

**From build-plan:** feature 11a

**Status:** verified
**Branch:** feature/csv-and-json-export

## Goal

Download the working query's **whole result** as CSV or JSON from the Export card
on `/saved-queries`, with the vintage ids written into the file so the pull can
be reproduced exactly.

## Design reference

`blueprint/references/6-saved-queries-and-export.png`, the right-hand column:

- **Export** card: a `Format` segmented control (`CSV` `JSON` `XLSX`), a
  **Pin vintage ids in the export** checkbox with the explanatory sub-line, a
  `56 rows · 2 indicators · 2 countries` summary, and a full-width green
  `DOWNLOAD CSV` button whose label follows the selected format.
- **Integration habit** card beneath it, static prose, verbatim from the design.

The left-hand Saved queries card already exists and is not touched.

## In scope

- The Export card and the Integration habit card, in a right-hand column on
  `/saved-queries`.
- **CSV** of flat observation rows, RFC 4180 quoted.
- **JSON** of the response envelope verbatim, `data` and `meta` together.
- **The whole result, re-fetched.** Export issues its own `observations` request
  at `pageSize: 5000` rather than writing the 25 rows on screen. This is the
  decision recorded on 2026-09-11: the design's row count exceeds one page, and
  an IFRS 9 pull needs the whole thing.
- **A refusal instead of a truncated file.** One request, no paging loop. If
  `meta.totalCount` exceeds the rows that came back, the card says so and names
  both numbers, and no file is written. A silently partial export is the worst
  outcome available here.
- Loading, unavailable, invalid-query and too-large states on the download
  button, all announced.
- Optional vintage-id header lines, controlled by the checkbox.
- Widening the existing last-result service so the card can show a real row
  count without issuing a request of its own.
- `XLSX` rendered as a **disabled** third format button with a reason, so the
  design's control is present and honest about 11b.

## Out of scope

- **XLSX itself.** Feature 11b, split out on 2026-09-11 so the spreadsheet
  dependency is its own decision. Do not add `xlsx`, `exceljs`, or any other
  runtime dependency in this branch.
- Paging the export across multiple requests. The refusal above is the MVP
  answer; revisit if a real query exceeds the cap.
- Exporting the Series shape, the revisions table, or the catalogue. "The
  current result" is the working query's observations.
- Server-side export, streaming, or a download endpoint on `api/`. The console
  builds the file in the browser from a response it already knows how to ask
  for.
- Changing the Saved queries card, the working query card, or any result tab's
  rendering.

## Build loop

`workflow.stepReview` is `feature` and `checkpointCommits` is `disabled`: build
all four steps, then present one review packet. No commits during the build;
`/complete` makes the single feature commit.

`qualityGates.regular` selects no automatic gate for this work. Independent
review is `when-sensitive` and this feature has no authentication,
authorization, secrets, personal data, migration, or external side effect - it
reads a route the console already reads and writes a file the user asked for.

## Build steps

- [x] **1. Widen the last-result service from vintages to the whole meta.**
      `core/last-result-vintages.ts` already holds `{ query, vintages }` behind
      a `sameWorkingQuery` guard, recorded from `result-state.ts` when a result
      settles. The Export card needs `totalCount` for the same query, which is
      the same job. Hold the whole `EnvelopeMeta` instead, rename the file and
      class to `core/last-result-meta.ts` / `LastResultMeta`, and keep the guard
      exactly as it is. Keep `idsFor(query)` as the saved-queries caller's API,
      now derived from the held meta, and add `metaFor(query): EnvelopeMeta | null`.

      Rename with a targeted search, not a blanket replace: F-23 recorded a
      blanket rename in this codebase that silently renamed a neighbouring
      symbol because it contained the search string.

      **Done when:** `ui` `npm test` passes with the existing
      `last-result-vintages.spec.ts` cases carried over under the new name,
      `rg "LastResultVintages"` returns nothing, and the saved-queries
      confirmation still names the recorded ids.

- [x] **2. The export file builders, as pure functions.**
      New `core/export/`:

      - `export-format.ts` - `ExportFormat = 'csv' | 'json' | 'xlsx'`, and
        `EXPORT_FORMATS` with each one's label, extension, MIME type and
        `available` flag. `xlsx` is `available: false` with the reason string.
      - `EXPORT_COLUMNS`, the seven columns in the `Observation` contract's own
        order: `indicator`, `country`, `year`, `value`, `isForecast`, `source`,
        `vintageId`. Values are written raw, never through `formatValue`: a CSV
        is for a machine and `65,324.1` would break the column it sits in.
        Built as of 2026-09-11 inside `export-csv.ts` rather than a separate
        `export-rows.ts`: indexing the observation by column name needs no
        intermediate row shape, and the only consumer is the CSV writer.
      - `export-csv.ts` - `toCsv(observations, meta, options)`. RFC 4180: wrap a
        field in double quotes and double any embedded quote whenever it
        contains a comma, a quote or a newline. CRLF line endings, as the format
        specifies. Header lines when `pinVintages` is on, each prefixed with a
        hash and a space, carrying the vintage ids with their labels, followed
        by the column header row.
      - `export-json.ts` - `toJson(envelope)`, `JSON.stringify(envelope, null, 2)`.
        The envelope verbatim, because `meta.vintages` is exactly what the
        Integration habit card tells the reader to record.
      - `export-filename.ts` - `exportFilename(format, nowIso)` giving
        `cyte-macro-observations-YYYY-MM-DD.<ext>` from the date part of the
        stamp, sliced not parsed, as `savedDate` does.

      **Done when:** `ui` `npm test` passes with focused specs for each: a value
      containing a comma and a value containing a quote both round-trip through a
      quote-aware parse; `pinVintages: false` emits no vintage comment line and
      the first data line is the column header; `pinVintages: true` names every
      id in `meta.vintages`; an empty `data` array still emits the column header
      and no rows; `toJson` output parses back to a deep-equal envelope.

- [x] **3. The export request and the download seam.**
      New `core/export/export.service.ts`, `providedIn: 'root'`:

      - `EXPORT_PAGE_SIZE = 5000`, the size CONSUMER-GUIDE section 6 steers bulk
        consumers to.
      - `fetchAll()` issues `{ ...store.apiQuery(), page: 1, pageSize: EXPORT_PAGE_SIZE }`
        through `MACRO_DATA.observations`, exactly the query the result tabs
        build, so an export cannot describe a different question from the table.
      - A `download(format, pinVintages)` resolving to one of
        `'saved' | 'invalid' | 'too-large' | 'unavailable'`, and a `busy` signal
        for the in-flight window.
      - `too-large` when `envelope.meta.totalCount > envelope.data.length`,
        carrying both numbers for the message. No file is written.
      - `invalid` without issuing a request when `store.validation()` is not
        valid, matching how the result tabs decline to ask.
      - `unavailable` on an error, through `macroErrorMessage(error, ...)` so a
        live `400` names the offending code the way every other tab does.

      Writing the file goes through an injection token, matching
      `SAVED_QUERY_STORAGE`: `EXPORT_DOWNLOADER` with a default factory that
      builds a `Blob`, creates an object URL, clicks a detached anchor and
      revokes the URL. `EXPORT_CLOCK` supplies the filename date, matching
      `SAVED_QUERY_CLOCK`. Neither is constructed in a spec.

      **Done when:** `ui` `npm test` passes with a fake downloader capturing
      filename, MIME type and contents; specs cover each of the four outcomes,
      that `invalid` issues no request, and that a `too-large` result writes
      nothing.

- [x] **4. The Export card.**
      `saved-queries/` gains the card, and the page's template grows the
      two-column layout the design shows. Reuse `.card`, `.btn`, `.state` and
      the existing SCSS tokens; port nothing new from `prototypes/`, which does
      not exist in this project.

      - Format control: three buttons, `aria-pressed` on the selected one,
        matching the `Significant only` toggle's pattern in `vintages.html`.
        `XLSX` is `disabled` with a `title` and a visually-hidden
        `aria-describedby` reason, the same treatment the disabled `Reproduce`
        button already uses.
      - Checkbox: `Pin vintage ids in the export` plus the design's sub-line.
        When `JSON` is selected it renders checked and disabled, with the reason
        that a JSON export always carries `meta.vintages`.
      - Summary line: `<n> rows · <n> indicators · <n> countries`. Indicator and
        country counts come from `WorkingQueryStore`. The row count comes from
        `LastResultMeta.metaFor(store.query())`; when that is null the line reads
        an em dash for the rows plus `Run this query on Observations to see the
        row count`, because claiming a count for a result nobody has seen is the
        mistake the query guard exists to prevent.
      - Button: label follows the format (`Download CSV`), disabled while busy
        or while the query is invalid, and one `role="status"` line beneath it
        carrying the busy, too-large, unavailable and invalid messages.
      - Integration habit card: static prose, verbatim from the design.

      **Done when:** `ui` `npm test` passes with component specs for format
      selection, the disabled XLSX button and its reason, the JSON checkbox
      behaviour, the row count with and without a recorded meta, a successful
      download reaching the fake downloader with the right filename, and the
      too-large and unavailable messages rendering; `ui` `npm run build` is
      clean.

## Files / areas

| Path | Change |
|---|---|
| `ui/src/app/core/last-result-vintages.ts` | renamed to `last-result-meta.ts`, widened to the whole meta |
| `ui/src/app/core/result-state.ts` | the `tap` records the envelope's meta, not just its vintages |
| `ui/src/app/core/export/` | new: format, csv (with the columns), json, filename, service |
| `ui/src/app/export/` | new: the Export card component, template and styles |
| `ui/src/app/saved-queries/saved-queries.{ts,html,scss}` | the Export and Integration habit cards, two-column layout |
| `blueprint/build-plan.md` | already updated: 11 split into 11a and 11b |

No `api/` change. No new dependency.

## Data / contracts

**CSV**, CRLF throughout, `text/csv;charset=utf-8`. Comment lines are prefixed
with a hash and a space:

    # Cyte Macro Data export · 2026-09-11
    # vintages: 12 WEO 10.0.0 2026-04-14; 7 WDI 2026-03-27
    # Source: IMF World Economic Outlook database
    # Source: World Bank World Development Indicators (CC BY 4.0)
    indicator,country,year,value,isForecast,source,vintageId
    GDP_GROWTH_REAL,ZAF,2024,1.1,false,IMF_WEO,12

The `vintages:` line appears only when the checkbox is on. The attribution lines
are always written: the overview requires attribution wherever numbers are
rendered, and a file of numbers is no exception.

**JSON**, `application/json`, two-space indent: the `Envelope<Observation>`
exactly as the service returned it. No reshaping - the provider contract says
implementations must not reshape, and neither does this.

**Filename:** `cyte-macro-observations-2026-09-11.csv`.

**Nothing is left undecided for 11b.** XLSX's MIME type and extension are
declared in `EXPORT_FORMATS` now, so 11b only has to flip `available` and supply
a writer.

## Testing

`ui` `npm test` (Karma/Jasmine) is the gate; every step above names its own
specs. `api` is untouched and its suite is not re-run.

Known gap, unchanged from the last four work items: every double in this suite
resolves synchronously, so the in-flight window is zero-width. The export's
`busy` state is the fifth thing in this project to live in that window
(F-11, F-13, F-16, F-26 and F-29 were the others). Its spec must use a deferred
provider double, as `vintages.spec.ts` now does, or it proves nothing.

## Notes for the AI

- `toObservationsQuery` via `store.apiQuery()` is the only sanctioned way to
  build the request. Do not assemble a query string here.
- Values are written raw. `formatValue` is for the screen.
- `Observation.value` is `number`, non-null in the contract. Do not add a null
  branch the type does not have.
- The row count must never be `data.length` of a page. `totalCount` is the whole
  result, and this project has already been burned by that confusion.
- Do not treat a `too-large` result as an error state. It is a refusal with a
  number in it, and the wording should say what to narrow.
