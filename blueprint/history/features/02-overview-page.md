# Feature: Overview page

**From build-plan:** feature 2

**Branch:** `feature/overview-page`

**Status:** verified

## Goal

Turn the Overview placeholder into the console's landing page: what the service
is, how the two sources behave, live counts of countries, curated indicators and
published vintages, and three routes into the rest of the console.

This is the first page a prospective integration client sees, so its job is to
make the service legible in about a minute, not to show data.

## Design reference

- `blueprint/references/1-overview.png` - the authoritative layout
- `prototypes/overview.html` - the same page in HTML, and **the source of the exact copy**
- `ui/src/styles.scss` - the token set feature 1 ported. Reference variables, never literals

Follow the prototype's wording rather than the PNG's where they differ: the PNG
renders "ingested on a schedule &mdash; reads never touch the upstream sources"
with an em dash, which `blueprint/context/coding-standards.md` forbids in
generated content. The prototype already carries the rephrased, em-dash-free
copy.

Layout, from the design:

- Top row, two columns at roughly 2fr / 1fr
  - Left: one card with an eyebrow, the hero sentence, a paragraph, and a three-cell property strip on a subtle background
  - Right: a stat-tile card of three counts, then a vintage cadence card
- Bottom row: three equal use-case cards, each an icon plus navy heading, a paragraph, and a green uppercase link with a trailing arrow

## In scope

- Replace the `OverviewPage` placeholder with the real page
- Three **live** counts read from `MACRO_DATA`: countries with data, curated indicators, published vintages
- The static editorial content: eyebrow, hero sentence, intro paragraph, three-property strip, vintage cadence card, three use-case cards
- In-app navigation from the three use-case links to Series, Countries & indicators, and Vintages
- Loading, unavailable and zero states for the counts
- Promote the reusable card chrome into `ui/src/styles.scss` as shared primitives, since features 4, 5, 6, 9, 10, 11 and 12 all need it
- Focused specs for the count logic and the link targets

## Out of scope

- Any other tab's content. The six remaining placeholders stay as they are
- Real HTTP calls. The fixture provider stays in place until feature 8
- Charting or sparklines. The plan defers a charting library until Series needs one
- The header vintage strip and attribution footer. Feature 1 owns both, and this page must not duplicate them
- Adding the Material icon font, or any new dependency
- Responsive or mobile layout. Desktop-first, matching feature 1
- Declaring a `Test` command in `AGENTS.md`. That remains `/tests`

## Build loop

`workflow.stepReview` is `feature`, so implement all build steps and then present
one review packet. `workflow.checkpointCommits` is `disabled`, so no per-step
commits. `/complete` creates the single feature commit and merges after approval.

## Build steps

- [x] **1. Promote the shared card primitives.** Move the reusable card chrome from `prototypes/prototype.css` into `ui/src/styles.scss`: `.card`, `.card-head` (including its title and right-aligned meta), `.card-body`, `.card-foot`, and `.eyebrow`. Values must come from the existing tokens. Do not bring across table, badge, chip, button or field styles; the features that need them will promote their own.
  **Done when:** `npm run build` in `ui/` succeeds, the existing suite is still green, and the six remaining placeholder tabs still render unchanged.

- [x] **2. Read the three counts from the provider.** In `OverviewPage`, request `countries()`, `indicators({ curated: true })` and `vintages()`, and expose each count from `meta.totalCount`. Model one combined state for the stat card: loading, ready, or unavailable. A failure of any of the three puts the card in the unavailable state rather than showing three separate errors.
  **Done when:** a spec injecting a stub provider whose envelopes report totals of 7, 9 and 4 renders 7, 9 and 4, proving the numbers are not hardcoded.

- [x] **3. Build the hero card.** Eyebrow, the hero sentence as the page's single `h1`, the intro paragraph, and the three-cell property strip, with copy taken from `prototypes/overview.html`.
  **Done when:** the card matches the design's left column, the page has exactly one `h1`, and the build succeeds.

- [x] **4. Build the stat tiles and cadence card.** Three tiles reading the live counts with their labels programmatically associated, then the vintage cadence card with the `IMF_WEO` and `WB_WDI` blocks, each with the green left border, source code, source name, contribution line and update cadence line.
  **Done when:** the tiles show 12, 13 and 5 against the current fixtures; loading shows a neutral placeholder rather than a blank or a zero; the unavailable state renders without breaking the page; and each number is announced with its label.

- [x] **5. Build the three use-case cards.** Icon, navy heading, paragraph and green uppercase action link for IFRS 9 forward-looking information, Benchmarking and dashboards, and Reproducible reporting. Icons are decorative Unicode glyphs as in the prototype, hidden from assistive technology. Links use `routerLink`, never `href`.
  **Done when:** clicking each of the three links routes in-app to `/series`, `/countries-indicators` and `/vintages` with no full page reload, and the browser console is clean.

- [x] **6. Cover the page with focused specs.** Add `ui/src/app/overview/overview.spec.ts`: counts render from the provider, the curated filter is actually passed to `indicators()`, loading and unavailable states render, a zero count renders as `0`, and the three links point at the right routes.
  **Done when:** `npm test -- --watch=false --browsers=ChromeHeadless` in `ui/` passes with no pending or skipped specs, and `npm run build` succeeds.

## Verification evidence

Run on branch `feature/overview-page`. No `Verify` command exists in
`AGENTS.md`, so the gate was the documented build plus the `ui/` suite.

| Check | Command | Result |
| --- | --- | --- |
| Build | `npm run build` in `ui/` | Pass, no budget warnings |
| Unit suite | `npm test -- --watch=false --browsers=ChromeHeadless` in `ui/` | Pass, 33 of 33, up from 19 |
| Component style budget | `wc -c src/app/overview/overview.scss` | 3,376 bytes, under the 4 kB warning |
| Token discipline | grep for colour literals under `src/app/overview/` | None |

The counts, the curated filter argument, loading, unavailable, zero, the single
`h1`, the three route targets, the decorative-icon hiding and the absence of em
dashes are all covered by DOM assertions running in real headless Chrome.

**Visual comparison: confirmed by the user.** Steps 3 and 4 ask for the cards to
match `blueprint/references/1-overview.png`. No browser automation is installed,
so this was not machine-verified; the user compared the running page against the
design and confirmed it. All step done-whens are now satisfied.

## Files / areas

| Path | Change |
| --- | --- |
| `ui/src/app/overview/overview.ts` | Replace the placeholder with the real component |
| `ui/src/app/overview/overview.html` | New |
| `ui/src/app/overview/overview.scss` | New. Overview-specific layout only |
| `ui/src/app/overview/overview.spec.ts` | New |
| `ui/src/styles.scss` | Add the shared card primitives. Leave the token block and `.page-title` / `.page-note` alone, since six placeholders still use them |

Nothing under `api/` changes. `app.ts`, `app.html`, `app.routes.ts` and the
provider seam are untouched: this feature only fills the outlet.

## Data / contracts

**Counts come from `meta.totalCount`, not `data.length`.** `data` is one page,
default 500. Curated indicators fit in one page today, but the non-curated WEO
set does not, and `data.length` would silently under-report at feature 8. The
fixture provider sets `totalCount` from the fixture length, so both agree now and
only `totalCount` stays correct later.

**Pass `curated: true` to `indicators()`.** The tile is labelled "Curated
indicators". The fixture provider accepts and ignores query arguments, so this
changes nothing visible today, but omitting it would count the whole catalogue
once feature 8 wires the real service.

**"Published vintages" counts every published vintage**, latest and superseded
alike, which is 5 against the current fixtures, not the 2 that are `isLatest`.
Do not filter.

**Stat card states.** Exactly three: loading, ready, unavailable.

- Loading shows a neutral placeholder per tile. Never a spinner that can hang, never a bare `0`
- Ready shows the integer, including a legitimate `0`
- Unavailable shows one message for the card. The rest of the page, the shell and navigation stay fully usable

**Static copy is static.** The eyebrow, hero sentence, intro paragraph, property
strip, cadence lines and use-case text are editorial content describing the
service, not API data. Take them verbatim from `prototypes/overview.html`. Do not
derive them from fixtures and do not reword them.

**Navigation is in-app.** The three action links use `routerLink`. An `href`
would reload the whole application and drop router state, which matters once
feature 3 puts the working query in memory.

**No user-controlled text on this page.** Every string is either a project
constant or an integer count rendered through interpolation. No `innerHTML`
anywhere.

**No authorization.** The page is anonymous like the rest of v1. Add no guard and
no login affordance.

## Testing

The test gate is off, since `AGENTS.md` declares no `Test` command, but `ui/` has
a working Karma and Jasmine runner and feature 1 left an 18-spec suite green.
Keep it green and add the count logic, which is the only real logic here.

- Run with `npm test -- --watch=false --browsers=ChromeHeadless` from `ui/`. Bare `npm test` is watch mode and will not terminate
- Assert the counts against a stub provider with values that differ from both the fixtures and the design, so a hardcoded 12, 13 or 5 fails
- Assert `indicators()` receives `{ curated: true }`
- Assert loading, unavailable and zero-count rendering
- Assert the three `routerLink` targets
- Do not unit test the hero copy word for word, card borders, or spacing. Those are visual, and the design plus a browser check are the right evidence
- No `Browser tests` command exists, so add no browser automation

## Notes for the AI

- **No `Verify` command exists.** The gate is `npm run build` plus the `ui/` suite, both from `ui/`. Do not claim a Verify or CI result.
- **Component style budget.** `angular.json` sets `anyComponentStyle` to a 4 kB warning and 8 kB error. Shared chrome belongs in `styles.scss`; keep `overview.scss` to this page's layout.
- **Angular 20 conventions** per `blueprint/context/coding-standards.md`: standalone component, `inject()` over constructor injection, signals for state, `protected readonly` when only the template reads it, separate `.html` and `.scss`, kebab-case filenames.
- Inject `MACRO_DATA`, never `FixtureMacroDataProvider`. The point of the seam is that this page cannot tell the difference at feature 8.
- Three requests fire on load. Combine them once rather than nesting subscriptions, and let the template read signals.
- The Angular CLI rewrites an analytics id into `ui/angular.json` on its first run. That is machine-specific telemetry and must not be committed. Leave the file out of the diff.
- Do not touch the six other placeholder components. They are each another feature's starting point.
- `prototypes/` is committed as of feature 1 and is still the reference for features 4, 5, 6 and 9 to 12. Do not delete it here.

## Open questions

None blocking. One reversible decision recorded:

- Use-case icons are decorative Unicode glyphs, as in the prototype, rather than the Material icon font. It avoids a new font dependency and a network request for three ornaments. Purely presentational, and swapping to real icons later touches only this template.
