# Feature: Working query

**From build-plan:** feature 3

**Branch:** `feature/working-query`

**Status:** verified

## Goal

One working query, shared by every tab that reads data. Features 4, 5, 6, 10, 11
and 12 all read and write this single piece of state, so its shape, defaults and
serialization are settled here rather than reinterpreted six times.

Delivered as a root-provided state service plus the reusable query card the
design puts at the top of Observations, Series and Request builder. This feature
mounts the card on Observations only.

## Design reference

- `blueprint/references/4-observations.png` - the card with two indicators, two countries and a populated year range
- `blueprint/references/3-series.png` - the same card with three indicators and **zero countries**, the empty-result state
- `prototypes/observations.html` - both states in HTML, and the source of the exact labels
- `ui/src/styles.scss` - existing tokens and card primitives. Reference variables, never literals

## In scope

- `WorkingQueryStore`, a root-provided service holding the one query
- The `WorkingQuery` type, its defaults, and a pure mapping onto the API query shape
- The reusable working-query card: indicator and country chips, add-selects, year from and year to, source, forecast, vintage, and Reset
- Mounting the card on the Observations tab, replacing that placeholder's body
- Select options loaded from `MACRO_DATA`: countries, curated indicators, published vintages
- Client-side validation for the two cases the guide documents as `400`
- Promote `.field`, `.chip` and `.btn` from `prototypes/prototype.css` into `ui/src/styles.scss`
- Focused tests for the store and the query mapping, which are now a gate

## Out of scope

- The observations table, paging controls and result counts. Feature 5
- The catalogue tables and click-a-row-to-add. Feature 4 wires into this store
- Series grouping and the Series tab's copy of the card. Feature 6
- Saving, naming, loading or reproducing a query, and the **Save query** button. Feature 10
- Export. Feature 11
- The URL preview, curl and Send. Feature 12
- Real HTTP. The fixture provider stays until feature 8
- Persisting the query across a page reload or into the URL. Neither is in the plans
- Responsive layout

## Build loop

`workflow.stepReview` is `feature`, so implement all build steps and then present
one review packet. `workflow.checkpointCommits` is `disabled`, so no per-step
commits. `/complete` creates the single feature commit and merges after approval.

## Build steps

- [x] **1. Promote the form primitives.** Move `.field` (including the select variant, its label, value and caret), `.chip` (indicator and country variants, and the remove control) and `.btn` (primary, navy, outline-green, outline-navy, outline-muted, disabled, and the `lg` size) from `prototypes/prototype.css` into `ui/src/styles.scss`, using existing tokens only. Leave table, badge and search styles for the features that need them.
  **Done when:** `npm run build` in `ui/` succeeds, `npm test` in `ui/` is still green at 33, and every tab renders unchanged.

- [x] **2. Define the query type, defaults and mapping.** Add `WorkingQuery`, `DEFAULT_WORKING_QUERY` and a pure `toObservationsQuery()` in `ui/src/app/core/working-query.ts`, following the serialization rules under Data / contracts exactly.
  **Done when:** `npm test` in `ui/` covers the mapping: defaults are omitted, an empty `countries` is omitted, null year bounds are omitted, `source` is omitted when a vintage is pinned, and a populated query maps to every expected key.

- [x] **3. Build the store.** Add `WorkingQueryStore` in `ui/src/app/core/working-query.store.ts`, `providedIn: 'root'`, exposing the query as a readonly signal with `addIndicator`, `removeIndicator`, `addCountry`, `removeCountry`, `setYearRange`, `setSource`, `setForecast`, `setVintage`, `setPage` and `reset`. Adds are idempotent, every filter change resets `page` to 1, and validation is exposed as a computed signal.
  **Done when:** `npm test` in `ui/` covers idempotent adds, removal, page reset on each filter change, `reset` restoring the defaults, and both validation cases.

- [x] **4. Build the card component.** Add `ui/src/app/query/working-query-card.{ts,html,scss}` reading the store and `MACRO_DATA`. Render the chips with accessible remove buttons, the add-selects, the four filter fields, the vintage row with its reproducibility hint, the summary line, and Reset. Handle loading and unavailable states for the option lists.
  **Done when:** the card matches the design's query card in `4-observations.png`, the build succeeds, and the browser console is clean.

- [x] **5. Mount the card on Observations.** Replace the `ObservationsPage` placeholder body with the card. Leave the rest of the page empty for feature 5.
  **Done when:** navigating to `/observations` shows the card, adding an indicator there and navigating to another tab and back preserves it, and `npm test` in `ui/` is green.

- [x] **6. Cover the card.** Add `ui/src/app/query/working-query-card.spec.ts`: chips render from the store, a remove button removes the right entry and has an accessible name, Reset clears to defaults, the validation message appears and is associated with its control, and the option lists degrade to an unavailable state when the provider fails.
  **Done when:** `npm test` in `ui/` passes with no pending or skipped specs, and `npm run build` succeeds.

## Verification evidence

Run on branch `feature/working-query`. No `Verify` command exists, so the gate
was the documented build plus the `ui/` suite. The test gate is on, and this
feature's logic ships with it.

| Check | Command | Result |
| --- | --- | --- |
| Build | `npm run build` in `ui/` | Pass, no budget warnings |
| Unit suite | `npm test` in `ui/` | Pass, 83 of 83, up from 33 |
| Component style budget | `wc -c working-query-card.scss` | 1,211 bytes, well under the 4 kB warning |
| Token discipline | grep for colour literals in the new files | None |

Fifty new specs cover the mapping (every omission rule including the
pinned-vintage case), the store (idempotent adds, page reset across all eight
filter mutations, reset, both validation cases, shared-instance behaviour) and
the card (chips, accessible remove buttons, option filtering, validation
association and announcement, loading and unavailable states, the summary
wording, and the absence of a save control).

**Visual comparison: confirmed by the user.** Step 4 asks the card to match the
query card in `4-observations.png`. No browser automation is installed, so this
was not machine-verified; the user compared the running card against the design
and confirmed it. All step done-whens are now satisfied.

## Files / areas

| Path | Change |
| --- | --- |
| `ui/src/app/core/working-query.ts` | New. Type, defaults, pure mapping |
| `ui/src/app/core/working-query.store.ts` | New. Root-provided store |
| `ui/src/app/core/working-query.spec.ts` | New. Mapping tests |
| `ui/src/app/core/working-query.store.spec.ts` | New. Store tests |
| `ui/src/app/query/working-query-card.ts`, `.html`, `.scss` | New. The reusable card |
| `ui/src/app/query/working-query-card.spec.ts` | New |
| `ui/src/app/observations/observations.ts` | Mount the card; keep the page otherwise empty |
| `ui/src/styles.scss` | Promote `.field`, `.chip`, `.btn` |

Nothing under `api/` changes. `macro-contracts.ts` gains nothing: `WorkingQuery`
is client state, not part of the API contract, and `ObservationsQuery` already
exists as the mapping target.

## Data / contracts

### WorkingQuery

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `indicators` | `string[]` | `[]` | Canonical codes. Required and non-empty before any request |
| `countries` | `string[]` | `[]` | ISO3 codes. Empty means all countries |
| `yearFrom` | `number \| null` | `null` | Inclusive, unbounded when null |
| `yearTo` | `number \| null` | `null` | Inclusive, unbounded when null |
| `source` | `SourceFilter` | `'preferred'` | WEO wins where it exists |
| `forecast` | `ForecastFilter` | `'all'` | |
| `vintage` | `VintageSelector` | `'latest'` | A pinned id or label reproduces a past state exactly |
| `page` | `number` | `1` | 1-based |
| `pageSize` | `number` | `25` | See the note below |

**`pageSize` defaults to 25, not 500.** The project overview records 500 because
that is the *API's* default, but the design is explicit: `4-observations.png`
shows "Page 1 of 3 &middot; pageSize 25" and `7-request-builder.png` renders
`&pageSize=25` in the URL the user is invited to copy. The console therefore sets
25 deliberately. This differs from the overview's note; the design wins for the
console's own default, and 25 is well inside the API's max of 5000.

### Serialization: `toObservationsQuery(query)`

A pure function, no service dependency. **Omit anything at its default**, so the
URL feature 12 shows a consumer stays minimal and teaches the real defaults
rather than noise:

- `indicators` always sent
- `countries` omitted when empty
- `yearFrom` / `yearTo` omitted when null
- `source` omitted when `'preferred'`
- `forecast` omitted when `'all'`
- `vintage` omitted when `'latest'`
- **`source` is also omitted whenever a vintage is pinned**, because the guide states that pinning a vintage implies its source. Sending both invites a contradiction
- `page` omitted when 1
- `pageSize` always sent, since 25 is the console's choice and not the API's default

This mapping is the contract features 5, 6, 8, 11 and 12 build on. Changing it
later changes the URLs consumers copy, so it is settled here and tested.

### Store behaviour

- `providedIn: 'root'`, so the query is shared by every tab and survives navigation
- The query is exposed as a **readonly** signal. Mutation only through the named methods, so no consumer can write a partial or invalid query
- `addIndicator` and `addCountry` are **idempotent**: adding an existing code is a no-op, not a duplicate. Feature 4 lets a user click the same catalogue row repeatedly
- Adds append, preserving the order the user chose
- **Every filter change resets `page` to 1.** Changing indicators while on page 3 must not leave the user on a page that no longer exists
- `setPage` is the only method that does not reset the page
- `reset` restores `DEFAULT_WORKING_QUERY` exactly

**Persistence.** In memory only. The query survives tab navigation, which is what
"persists across tabs" means here, and is lost on reload. Durable storage is
feature 10's `SavedQuery` in localStorage, whose shape the overview already locks.
Do not add localStorage, URL sync or a route parameter here; neither the plans nor
the designs call for them.

### Validation

Two cases, both documented by the guide as `400` causes, caught client-side
before a request is ever built:

1. **No indicators.** `indicators` is empty. The guide lists missing `indicators` as a `400`
2. **Inverted year range.** `yearFrom` and `yearTo` are both set and `yearFrom > yearTo`

Requirements:

- Exposed as a computed signal so features 5, 6 and 12 can refuse to fire a request rather than each re-deriving the rule
- The message is rendered next to the offending control and associated with it via `aria-describedby`, not left as loose text
- The invalid control carries `aria-invalid`
- The message is in a container with `role="status"` so it is announced when it appears
- The message clears as soon as the query becomes valid
- Validation never blocks editing. A user must be able to fix an inverted range by editing either end

### Accessibility

- Each chip's remove control is a real `<button>` with an accessible name naming what it removes, for example "Remove indicator GDP_GROWTH_REAL". The prototype uses a bare `<span>` with a multiplication sign, which is not reachable by keyboard and announces nothing. Follow this spec, not the prototype
- Every field has a visible label associated with its control
- Decorative glyphs are `aria-hidden`

### Deviations from the design, both deliberate

- **No "Save query" button.** The design shows one, but saving is feature 10 and a button that does nothing is worse than no button. Feature 10 adds it beside Reset
- **The summary line omits the observation count.** The design reads "2 indicators &times; 2 countries &middot; 2018&ndash;2031 &middot; 56 observations". Feature 3 has no results, so it renders everything up to the year range. Feature 5 appends the count once it owns results. Do not invent a number

### Rendering and authorization

- Indicator codes, country codes and vintage labels come from the API. Render through interpolation only, never `innerHTML`
- No authorization. Anonymous like the rest of v1. No guard, no login affordance

## Testing

**The test gate is now on.** `AGENTS.md` declares `npm test` for both packages,
so this feature's logic must ship passing tests in the same reviewable diff.
Everything here lives in `ui/`, so the runner is Karma and Jasmine.

- Run with `npm test` in `ui/`. It is now a one-shot headless command
- The mapping and the store are pure logic and are the primary test targets: defaults, omissions, the pinned-vintage rule, idempotent adds, page reset, reset, and both validation cases
- The card gets focused DOM tests: chips, accessible remove names, Reset, the validation message and its association, and the provider-failure state
- Do not test the card's spacing, borders or exact copy. Those are visual, and the design plus a browser check are the right evidence
- No `Browser tests` command exists, so add no browser automation

## Notes for the AI

- **No `Verify` command exists.** The gate is `npm test` plus `npm run build`, both from `ui/`. Do not claim a Verify or CI result.
- **The working tree already carries uncommitted `/tests` setup** on `master`: Vitest for `api/`, the normalized `ui/` test script, `api/tsconfig.spec.json`, the example test, and the `AGENTS.md` and coding-standards updates. Those changes are unrelated to this feature and will otherwise land in its commit. Decide with the user before committing whether to keep them separate.
- **Component style budget.** `angular.json` caps `anyComponentStyle` at a 4 kB warning and 8 kB error. Shared primitives go in `styles.scss`; keep `working-query-card.scss` to the card's own layout.
- **Angular 20 conventions** per `blueprint/context/coding-standards.md`: standalone components, `inject()`, signals, `protected readonly` for template-only state, separate `.html` and `.scss`, kebab-case filenames.
- The card injects `MACRO_DATA` for its option lists, never `FixtureMacroDataProvider`.
- The card is built to be mounted three times. Keep it self-contained with no inputs it does not need, so features 6 and 12 can drop it in unchanged.
- The Angular CLI rewrites an analytics id into `ui/angular.json`. It is machine-specific and must stay out of the diff.
- Do not touch the five other placeholder components.
- `prototypes/` stays. Features 4, 5, 6 and 9 to 12 still reference it.

## Open questions

None blocking. Three decisions recorded rather than deferred:

- `pageSize` defaults to 25 from the design, overriding the overview's note of the API default 500. Reversible in one constant, but it changes the URL feature 12 displays
- The card ships without the Save query button until feature 10
- The query lives in memory only, so a reload clears it. Feature 10 is where a query becomes durable
