# Feature: Catalogue browsing

**From build-plan:** feature 4

**Branch:** `feature/catalogue-browsing`

**Status:** verified

## Goal

Make the service's shape browsable: which countries have data and from which
sources, and the full curated indicator catalogue with its units, categories and
source coverage. Clicking an indicator row adds it to the working query, which is
how a visitor discovers that the query is the thing driving every other tab.

## Design reference

- `blueprint/references/2-countries-and-indicators.png` - the authoritative layout
- `prototypes/countries-indicators.html` - the same page in HTML, and the source of the exact copy, which is already free of the em dash the PNG uses
- `ui/src/styles.scss` - tokens plus the card, field, chip and button primitives earlier features promoted

Layout: two columns, a fixed-width Countries card beside a flexible Indicator
catalogue card.

**Decoded from the designs:** in `2-countries-and-indicators.png` exactly three
indicator codes render in accent green rather than navy: `GDP_GROWTH_REAL`,
`CPI_INFLATION_AVG` and `GOVT_DEBT_GDP`. Those are precisely the three chips in
the working query in `3-series.png`. Green therefore means *already in the
working query*. Implement that, and do not leave it as colour alone.

## In scope

- The Countries card: head count, client-side search, and a scrollable list showing each country's name, ISO3 and covering sources
- The Indicator catalogue card: head count, server-side search and filters, and the table with Code, Name, Unit, Category, Sources and Curated columns
- Clicking an indicator row adds that indicator to the `WorkingQueryStore`
- In-query indicators render as selected, conveyed by more than colour
- Category filter options derived from the returned data
- Loading, empty-result and provider-failure states for both cards
- Teach `FixtureMacroDataProvider.indicators()` to honour `q`, `category`, `source` and `curated`, so the filters are real now and unchanged at feature 8
- Promote the table, badge and search primitives from `prototypes/prototype.css`
- Focused tests, which are a gate

## Out of scope

- The working query card itself. Feature 3 owns it and the design does not place it on this tab
- Country rows adding to the query. See Data / contracts
- Browsing non-curated `WEO_` factors. See Open questions
- The observations table, series, vintages, saved queries, export, request builder
- Real HTTP. The fixture provider stays until feature 8
- Pagination controls. See Data / contracts
- A single-indicator detail view. `GET /indicators/{code}` exists but no design or plan item calls for it
- Responsive layout

## Build loop

`workflow.stepReview` is `feature`, so implement all build steps and then present
one review packet. `workflow.checkpointCommits` is `disabled`, so no per-step
commits. `/complete` creates the single feature commit and merges after approval.

## Build steps

- [x] **1. Promote the table, badge and search primitives.** Move `table`, `thead th`, `tbody td`, `tbody tr.clickable`, `.num`, `.strong`, `.code-link`, `.badge` with its `curated` variant and dot, and `.search` from `prototypes/prototype.css` into `ui/src/styles.scss`, using existing tokens only. Leave the remaining badge variants for features 5 and 9.
  **Done when:** `npm run build` in `ui/` succeeds, `npm test` in `ui/` is still green at 83, and every tab renders unchanged.

- [x] **2. Make the fixture provider filter indicators.** Implement `q`, `category`, `source` and `curated` in `FixtureMacroDataProvider.indicators()` per the rules below, and replace the class comment that currently says query arguments are ignored.
  **Done when:** `npm test` in `ui/` covers each filter alone, two filters combined, a case-insensitive `q` match on both code and name, and `meta.totalCount` reflecting the filtered total.

- [x] **3. Build the countries card.** Head count, search input, and the scrollable list. Search is client-side over name and ISO3.
  **Done when:** typing `nam` narrows to Namibia, typing `zaf` narrows to South Africa, an unmatched term shows the empty message, and the head count reflects the rows listed.

- [x] **4. Build the catalogue table.** The filter row, the six columns, and the footer note. Filters go to the provider; category options come from the unfiltered catalogue so choosing one does not empty the list of options.
  **Done when:** all 13 curated indicators list with their units, choosing a category narrows the table, a `q` term narrows it, clearing the filters restores 13, and the head count tracks the filtered total.

- [x] **5. Wire row clicks into the working query.** Each row is a real control that adds its indicator to `WorkingQueryStore`. Rows already in the query render selected, with `aria-pressed` and visually-hidden text alongside the green code.
  **Done when:** clicking a row adds one chip visible on `/observations`, clicking the same row again leaves exactly one chip, the row reads as pressed to assistive technology, and the build succeeds.

- [x] **6. Cover both cards.** Add `ui/src/app/countries-indicators/countries-indicators.spec.ts` for the states, the filters, the derived category options, the debounce, the click-to-add behaviour and the selected state.
  **Done when:** `npm test` in `ui/` passes with no pending or skipped specs, and `npm run build` succeeds.

## Verification evidence

Run on branch `feature/catalogue-browsing`. No `Verify` command exists, so the
gate was the documented build plus the `ui/` suite. The test gate is on.

| Check | Command | Result |
| --- | --- | --- |
| Build | `npm run build` in `ui/` | Pass, no budget warnings |
| Unit suite | `npm test` in `ui/` | Pass, 122 of 122, up from 83 |
| Component style budget | `wc -c countries-indicators.scss` | 1,409 bytes, well under the 4 kB warning |
| Token discipline | grep for colour literals under the feature folder | None |

Thirty-nine new specs cover the fixture provider's four filters, client-side
country search over name and ISO3, head counts tracking the filters, derived
category options staying complete after a selection, the debounce driven with
`fakeAsync` including that a keystroke burst issues one query, selects applying
immediately, click-to-add with its idempotent second click, the keyboard-operable
button, the pressed and visually-hidden selected state, and independent loading,
empty and unavailable states for both cards.

**Visual comparison: confirmed by the user.** Step 4 asks the page to match
`blueprint/references/2-countries-and-indicators.png`. No browser automation is
installed, so this was not machine-verified; the user compared the running page
against the design and confirmed it. All step done-whens are now satisfied.

## Files / areas

| Path | Change |
| --- | --- |
| `ui/src/app/countries-indicators/countries-indicators.ts` | Replace the placeholder with the real page |
| `ui/src/app/countries-indicators/countries-indicators.html` | New |
| `ui/src/app/countries-indicators/countries-indicators.scss` | New. This page's layout only |
| `ui/src/app/countries-indicators/countries-indicators.spec.ts` | New |
| `ui/src/app/core/fixtures/fixture-macro-data.provider.ts` | Implement the four indicator filters |
| `ui/src/app/core/fixtures/fixture-macro-data.provider.spec.ts` | Extend for the filters |
| `ui/src/styles.scss` | Promote table, badge and search primitives |
| `ui/src/app/app.spec.ts` | Drop `/countries-indicators` from the placeholder loop and assert the real page |

Nothing under `api/` changes. `macro-contracts.ts` is unchanged: `IndicatorsQuery`
already carries every filter this feature needs.

## Data / contracts

### Indicator filtering is server-side; country search is client-side

This asymmetry is forced by the API, not a preference:

- `GET /api/macro/indicators` documents `q`, `category`, `source` and `curated`. Pass them through and let the service filter. Filtering a fetched page in the browser would only ever filter one page and would be wrong the moment the catalogue exceeds it
- `GET /api/macro/countries` documents **no** query parameters. Country search must therefore be client-side over the returned list

Record this in the component so a later reader does not "fix" the inconsistency.

### Fixture filter semantics

The fixture provider is a stand-in for a documented API, so implementing these
faithfully is not inventing behaviour. Match the guide:

- `curated`: defaults to `true`. Every fixture indicator is curated, so `false` currently returns the same 13. Do not fabricate `WEO_` entries
- `category`: exact match on `Indicator.category`
- `source`: keep an indicator when any entry in its `sources` has that `source`
- `q`: case-insensitive substring against `code` **or** `name`
- Filters combine with AND
- `meta.totalCount` is the count **after** filtering, and `data` is that same set. A filtered response must not report the unfiltered total

### Counts in the card heads

Each head count describes the rows currently listed, so it tracks the filters. It
reads from `meta.totalCount` for indicators, and from the filtered length for
countries since that filtering is local. Unfiltered, they read 12 and 13 and match
the design.

### Category options

Derived from the catalogue, never hardcoded. Take the distinct `category` values
from an **unfiltered** `indicators({ curated: true })` response, sorted
alphabetically, so selecting a category does not shrink the option list to one
entry. The current fixtures yield credit, external, fiscal, growth, labour,
monetary and prices.

### Search debounce

`q` typing is debounced by a single named constant,
`CATALOGUE_SEARCH_DEBOUNCE_MS = 250`. Tests drive it with `fakeAsync` and `tick`,
so the timing is asserted rather than slept on. Do not scatter literal delays.

### Selected state

An indicator already in `WorkingQueryStore` renders selected. Because the design
distinguishes it by colour alone, and colour alone is not an accessible state:

- The row control carries `aria-pressed="true"`
- The code carries visually-hidden text reading "in working query"
- The code renders in `--accent-link`, matching the design

Clicking a selected row is a no-op, which the store already guarantees through
idempotent adds. Do not add removal here: the chip's remove button in the working
query card owns that, and a row that both adds and removes on the same click
would be ambiguous.

### Row control

Each indicator row is a real interactive control, reachable and operable by
keyboard. A `<tr>` with a click handler is not. Put a `<button>` in the Code cell
carrying the row's action and `aria-pressed`, and keep `tbody tr.clickable` for
the hover affordance only. Whatever shape is chosen, keyboard activation must add
the indicator, and that must be asserted in a test.

### Country rows are informational

The project plan specifies only that "clicking an indicator row on the catalogue
tab adds it to that query". Nothing in the plans or designs makes a country row
actionable, so this feature does not invent it. Countries are chosen through the
working query card's add-country select. If a country row should also add, that is
a plan decision, not an implementation detail.

### States

Both cards handle four states independently, so one failing does not blank the other:

- **Loading**: a neutral placeholder. Never a spinner that can hang
- **Ready with rows**: the normal case
- **Ready with no rows**: an honest message saying the filters matched nothing, never an error and never an endless spinner. The catalogue's message names the filters as the cause
- **Unavailable**: the provider failed. Show a message and keep the rest of the page and navigation usable

### Rendering and authorization

- Every code, name, unit, category and country name comes from the API. Render through interpolation only, never `innerHTML`
- The search inputs are user-controlled text used only as a query argument and never rendered back as markup
- Each search input has a visible label associated with it
- No authorization. Anonymous like the rest of v1

### Pagination

Not built. `indicators({ curated: true, pageSize: 500 })` returns all 13 in one
page, and the design shows no pager on this tab. If the curated catalogue ever
exceeds one page this needs a pager, so the component reads `meta.totalCount`
rather than assuming the page is complete, and the footer note is the natural
place a pager would later sit.

## Testing

**The test gate is on.** This feature's logic must ship passing tests in the same
reviewable diff. Everything lives in `ui/`, so the runner is Karma and Jasmine
via `npm test` in `ui/`.

Primary targets, all real logic:

- The fixture provider's four filters, individually, combined, and their effect on `meta.totalCount`
- Client-side country search over both name and ISO3, including no match
- Derived category options: distinct, sorted, and taken from the unfiltered catalogue
- The debounce, driven with `fakeAsync` and `tick`
- Click-to-add, including keyboard activation and the idempotent second click
- Selected state: `aria-pressed` and the visually-hidden text
- Loading, empty and unavailable rendering for both cards

Do not test column widths, borders or the exact footer wording. Those are visual.
No `Browser tests` command exists, so add no browser automation.

## Notes for the AI

- **No `Verify` command exists.** The gate is `npm test` plus `npm run build`, both from `ui/`. Do not claim a Verify or CI result.
- **Component style budget.** `angular.json` caps `anyComponentStyle` at a 4 kB warning and 8 kB error. Shared primitives go in `styles.scss`; keep `countries-indicators.scss` to this page's layout.
- **Angular 20 conventions** per `blueprint/context/coding-standards.md`: standalone component, `inject()`, signals, `protected readonly` for template-only state, separate `.html` and `.scss`, kebab-case filenames.
- Inject `MACRO_DATA` and `WorkingQueryStore`, never a concrete provider.
- Two requests share this page: the unfiltered catalogue that feeds the category options, and the filtered one that feeds the table. Do not refetch the unfiltered list on every keystroke.
- Take the copy from `prototypes/countries-indicators.html`, which is already free of the PNG's em dash.
- The Angular CLI rewrites an analytics id into `ui/angular.json`. It is machine-specific and must stay out of the diff.
- Do not touch the four remaining placeholder components.
- `prototypes/` stays. Features 5, 6 and 9 to 12 still reference it.

## Open questions

**Non-blocking, but worth your call before the next catalogue change.**

The design shows a `CURATED ONLY` button rendered in its active state. The
project overview puts "merchandised browsing of non-curated `WEO_`-prefixed
factors (reachable by typing a code, but not surfaced)" **out of MVP scope**. A
working toggle would surface exactly what the plan says not to surface.

This feature therefore ships the control in its pressed state,
`aria-pressed="true"` and disabled, with a short hint explaining that non-curated
WEO factors are not listed in v1 and remain reachable by code. That is faithful
to the plan and keeps the design's shape.

If you would rather the toggle work, that is a plan change: it would add
`indicators({ curated: false })` browsing to the MVP, and the fixtures would need
representative `WEO_` entries to make it meaningful.

Two decisions recorded rather than deferred:

- Country rows are informational, since only indicator-row clicking is specified
- No pagination, since 13 curated indicators fit one page and the design shows no pager
