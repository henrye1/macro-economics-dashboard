# Feature: App shell

**From build-plan:** feature 1

**Branch:** `feature/app-shell`

**Status:** verified

## Goal

Stand up the console's outer frame so every later feature has a tab to live in and
a typed data source to read from. After this feature the app renders the Cyte
navy header with the live vintage strip, a seven-tab bar that navigates, and the
attribution footer, with all data coming from a fixture-backed provider behind an
interface that feature 8 can swap for the real HTTP service without touching any
consumer.

This replaces the scaffold's placeholder header and `/api/health` status line.

## Design reference

- `blueprint/references/1-overview.png` - the authoritative header, tab bar and footer
- `prototypes/theme.css` - the token set to port; the single source of colour, type and scale
- `prototypes/prototype.css` - shows how the tokens compose into header, tabs, cards and footer. Reference only, not ported
- `prototypes/overview.html` - the shell in context

Port the shared tokens before building any feature UI. Note the tab bar in the
designs shows seven tabs in display order: Overview, Countries & indicators,
Series, Observations, Vintages & revisions, Saved queries & export, Request
builder.

## In scope

- Install and configure Angular Material for Angular 20
- Port `prototypes/theme.css` into `ui/src/styles.scss` as the app's single token source, and point Material's theme at those tokens
- Hand-written macro contract types in one file
- A `MacroDataProvider` interface, an injection token, and a fixture implementation returning async values
- The navy header: wordmark, `V1` pill, latest-vintage strip, and the server-side M2M client pill
- The seven-tab bar with active-tab styling and working routes
- Seven placeholder page components, empty apart from a title
- The attribution footer rendering `meta.attribution` verbatim on every tab
- Retiring the scaffold shell: the placeholder header, the `/api/health` call, and `ui/src/app/core/api.ts`
- Updating `ui/src/app/app.spec.ts`, which currently asserts the scaffold shell and will otherwise fail

## Out of scope

- Any tab's real content. Placeholders only. Overview is feature 2, the catalogue is feature 4, the table is feature 5, series is feature 6
- The working query and its shared state - feature 3
- Any HTTP call to the Core API, the Express passthrough, or Auth0 - features 7 and 8
- Real vintage, country or indicator data. Fixtures only
- Saved queries, export, request builder behaviour - features 10 to 12
- Charting. The plan defers a charting library until Series needs one
- Declaring a `Test` command in `AGENTS.md` or adding an API test runner - that is `/tests`
- Responsive or mobile layout. The designs and prototypes are desktop-first

## Build loop

`workflow.stepReview` is `feature`, so implement all build steps and then present
one review packet. `workflow.checkpointCommits` is `disabled`, so do not create
per-step commits. `/complete` creates the single feature commit and merges after
approval. A read-only code walkthrough is available at the end on request.

## Build steps

- [x] **1. Install Angular Material.** Add `@angular/material` and `@angular/cdk` at versions matching Angular 20. Review every file `ng add` touches, especially `angular.json`, `ui/package.json`, `ui/src/index.html` and `ui/src/styles.scss`, and keep its changes minimal. Do not accept a prebuilt Material theme that would compete with `theme.css`.
  **Done when:** `npm run build` in `ui/` succeeds, the app still renders the existing scaffold shell, and `npm test -- --watch=false --browsers=ChromeHeadless` in `ui/` is still green.

- [x] **2. Port the theme tokens.** Copy the `:root` block from `prototypes/theme.css` into `ui/src/styles.scss` verbatim, then configure Material's theme so its primary reads `--navy` and its accent reads `--accent`. Every later style must reference these variables, never a literal.
  **Done when:** the tokens resolve on `:root` in the browser, a Material button renders navy rather than the default palette, and `npm run build` succeeds.

- [x] **3. Add the macro contract types.** Create `ui/src/app/core/macro-contracts.ts` with the locked shapes from the project overview: `Envelope<T>`, `EnvelopeMeta`, `VintageRef`, `Country`, `Indicator`, `IndicatorSource`, `Observation`, `Series`, `SeriesPoint`, `Vintage`, `Revision`, `SourceCode`, `SourceFilter`, `ForecastFilter`, `ProblemDetails`. No `any`.
  **Done when:** `npm run build` in `ui/` succeeds and every field matches the Data model section of `blueprint/context/project-overview.md`.

- [x] **4. Add the provider seam and fixtures.** Create `ui/src/app/core/macro-data.provider.ts` with a `MacroDataProvider` interface and a `MACRO_DATA` injection token, and `ui/src/app/core/fixtures/` holding fixture data that matches the mockups: vintage 14 `WEO 10.0.0 2026-04-14`, vintage 13 `WDI 2026-03-27`, the two attribution strings, and the 12 countries and 13 indicators. Register the fixture implementation in `app.config.ts`. Every method returns an `Observable` of an `Envelope<T>` so feature 8 is a provider swap only.
  **Done when:** a consumer injecting `MACRO_DATA` receives the fixture envelope asynchronously, and `npm run build` succeeds.

- [x] **5. Build the header and footer.** Replace `app.html`, `app.scss` and `app.ts` with the design's navy header (wordmark `Cyte` plus green `Macro Data`, `V1` pill, right-aligned latest-vintage strip, M2M client pill with its green dot) and the attribution footer. Both read from `MACRO_DATA`. Remove the scaffold's `title`/`apiStatus` signals and the `/api/health` call, and delete `ui/src/app/core/api.ts`. Set `ui/src/index.html`'s `<title>` to `Cyte Macro Data Console`.
  **Done when:** the header matches `1-overview.png` side by side, the vintage strip shows both fixture labels, the footer renders both attribution strings on every route, and the browser console is clean.

- [x] **6. Add the seven routes and the tab bar.** Populate `app.routes.ts` with the seven paths from the overview's UI/UX section, a default redirect from `''` to `overview`, and a wildcard redirect to `overview`. Add one placeholder component per tab under `ui/src/app/<feature>/`, each rendering only its tab name. Add the tab bar to the shell with the active-tab navy underline.
  **Done when:** clicking each of the seven tabs changes the URL and the rendered placeholder, the active tab is underlined in navy, deep-linking to each path works on reload, and an unknown path lands on Overview.

- [x] **7. Bring the test suite back to the new shell.** Rewrite `ui/src/app/app.spec.ts`, whose three current specs assert the deleted scaffold (`h1` containing "Micro Economics", `.api-status`, and an expected `/api/health` request). Cover instead: the header renders both fixture vintage labels, the footer renders both attribution strings as text, and the fixture provider resolves through the `MACRO_DATA` token.
  **Done when:** `npm test -- --watch=false --browsers=ChromeHeadless` in `ui/` passes with no pending or skipped specs, and `npm run build` succeeds.

## Verification evidence

Run on branch `feature/app-shell`. No `Verify` command exists in `AGENTS.md`, so
the gate was the documented build plus the `ui/` suite.

| Check | Command | Result |
| --- | --- | --- |
| Build | `npm run build` in `ui/` | Pass. 297 kB initial, 81 kB transfer |
| Unit suite | `npm test -- --watch=false --browsers=ChromeHeadless` in `ui/` | Pass. 18 of 18 |
| Material wiring | grep the emitted `styles-*.css` | `--mat-sys-primary: var(--navy)` present; 157 `--mat-sys-*` tokens emitted |
| Component style budget | `wc -c src/app/app.scss` | 2,621 bytes, under the 4 kB warning |

Navigation, the seven tabs, active-tab marking, both redirects, the vintage
strip, the attribution footer and the provider-failure path are covered by DOM
assertions in the suite, which runs in real headless Chrome.

**Visual comparison: confirmed by the user.** Step 5's done-when asks for the
header to be compared against `blueprint/references/1-overview.png` side by
side. No browser automation is installed, so this was not machine-verified; the
user ran the dev server, compared the two, and confirmed the header matches. All
step done-whens are now satisfied.

## Files / areas

| Path | Change |
| --- | --- |
| `ui/package.json`, `ui/package-lock.json` | Material and CDK dependencies |
| `ui/angular.json` | Whatever `ng add` needs; keep the diff minimal |
| `ui/src/styles.scss` | Token `:root` block plus Material theme configuration |
| `ui/src/index.html` | `<title>`, and any Material font link |
| `ui/src/app/app.ts`, `app.html`, `app.scss` | Replace the scaffold shell |
| `ui/src/app/app.routes.ts` | Seven routes, default and wildcard redirects |
| `ui/src/app/app.config.ts` | Register the fixture provider for `MACRO_DATA` |
| `ui/src/app/app.spec.ts` | Rewrite against the new shell |
| `ui/src/app/core/macro-contracts.ts` | New |
| `ui/src/app/core/macro-data.provider.ts` | New |
| `ui/src/app/core/fixtures/` | New |
| `ui/src/app/core/api.ts` | Delete |
| `ui/src/app/<seven tab dirs>/` | New placeholder components |

Nothing under `api/` changes. The API's `/api/health` route stays as-is; feature
13 uses it as the Render health check.

## Data / contracts

**Types** come from the Data model section of `blueprint/context/project-overview.md`.
Bind them exactly, including `scale` being nullable, `Observation.vintageId` being
a number, `Series.vintage` being a label string while `meta.vintages[].id` is a
number, and `SourceCode` being `'IMF_WEO' | 'WB_WDI'` while the query `source`
filter also permits `'preferred'`. These are locked shapes; features 5, 6, 8, 9,
10, 11 and 12 depend on them.

**Provider seam.** One interface with one method per read route, mirroring the
five Core API routes so feature 7 and 8 map onto it directly:

- `countries(): Observable<Envelope<Country>>`
- `indicators(query?): Observable<Envelope<Indicator>>`
- `observations(query): Observable<Envelope<Observation>>`
- `series(query): Observable<Envelope<Series>>`
- `vintages(query?): Observable<Envelope<Vintage>>`
- `revisions(vintageId, query?): Observable<Envelope<Revision>>`

Async return types are required even though fixtures could return synchronously.
Feature 8 must be a provider swap, not a consumer rewrite.

**Attribution rendering.** `meta.attribution` is external text from an upstream
source. Render it through Angular's default text interpolation. Never
`innerHTML`, never `bypassSecurityTrustHtml`. WDI is CC BY 4.0, so the footer is
a licence obligation, not decoration, and must appear on every tab.

**The M2M pill** reports the state of the server-side client, not the visitor's
session. Label it so it cannot be read as the visitor's own login. In this
feature its value is fixture-supplied; feature 7 gives it a real source.

**Shell states.** The vintage strip and footer must handle: values present, values
still loading, and the provider failing. Loading shows a neutral placeholder
rather than an empty bar. A provider error leaves the shell and tab bar usable
with the strip showing an unavailable state, because a header failure must never
block navigation. No spinner that can hang.

**No authorization** exists in v1 and none is introduced here. Every route is
anonymous, matching the plan. Do not add a guard, a login affordance, or a role
check; feature 14 owns that behind the API-side middleware seam.

## Testing

The test gate is **off**: `AGENTS.md` declares no `Test` command, so tests are not
a required gate for this feature. But `ui/` has a working Karma and Jasmine
runner with three existing specs, and this feature deletes the shell those specs
assert. Leaving a red suite behind is not acceptable, so step 7 is mandatory
rather than optional.

- Run the suite with `npm test -- --watch=false --browsers=ChromeHeadless` from `ui/`. The bare `npm test` script is watch mode against real Chrome and will not terminate.
- Cover the two pieces of logic worth asserting: the provider resolving through the `MACRO_DATA` token, and the footer rendering every attribution string as text.
- Do not unit test the header's visual appearance, the tab underline, or the placeholder pages. Those are visual, and the designs plus a browser check are the right evidence.
- No `Browser tests` command exists, so add no browser automation.

## Notes for the AI

- **No Verify command exists.** `AGENTS.md` declares none, and there is no `.github/`. The end gate for this feature is `npm run build` plus the `ui/` suite, both from `ui/`. Do not claim a Verify or CI result.
- **Dependencies are installed** in both `ui/node_modules` and `ui/node_modules`, and `ui/node_modules/.bin/ng` exists, so build and test commands can run without a fresh install.
- **Component style budget.** `angular.json` sets `anyComponentStyle` to a 4 kB warning and 8 kB error. `prototypes/prototype.css` is 11 kB in total, so do not paste it into one component's SCSS. Global chrome belongs in `styles.scss`; per-component SCSS stays small.
- **Angular 20 conventions**, per `blueprint/context/coding-standards.md`: standalone components only, `inject()` rather than constructor injection, signals for component state, `protected readonly` when only the template reads it, kebab-case filenames, separate `.html` and `.scss` files.
- **Relative API paths only.** Even though nothing calls the API in this feature, the provider seam must be written so feature 8 uses `/api/...` and never a hardcoded host.
- `ui/` imports carry no file extension. The `.js`-extension rule in the coding standards applies to `api/` only.
- The wordmark is `Cyte` plus `Macro Data` per the designs and the project plan's product name, not the repository name `micro-economics`. Same for the `index.html` title.
- The tab bar's display order differs from the build order. Follow the display order in the designs.
- Do not pull the Overview page's hero, stat tiles or cadence panel into this feature. `prototypes/overview.html` shows them because it mocks the finished tab; feature 1 delivers only the chrome around them.

## Open questions

None blocking. Two reversible decisions recorded rather than deferred:

- `ui/src/app/core/api.ts` is deleted rather than left unused. The shell no longer calls `/api/health`, and features 7 and 8 introduce the real client against the macro routes. Purely internal, no persisted data or external contract.
- Contract types live in `ui/` only for now. The project plan already accepts cross-boundary duplication at this stage, and feature 17 replaces both sides with generated types.
