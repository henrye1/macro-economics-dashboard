# Current Fix - Design fidelity against the standalone reference

> **Generated file.** Holds the one feature, fix, or rollback being built right now.

**Type:** Fix
**Status:** verified

## The problem

The console was built against `prototypes/`, a simplified re-draw. The real
design is the standalone HTML export of the Cyte Risk Suite design system
(`macro-data-explorer-standalone.html`), which the screenshots in
`blueprint/references/*.png` were captured from. `prototypes/theme.css` is not a
faithful port of it, and several features were dropped along the way.

Verified drift, 2026-09-14:

**Theme**

| | Reference | Built |
| --- | --- | --- |
| Body font | Source Sans Pro, weight 500 | Lato, weight 400 |
| Icons | Material Symbols Outlined | HTML entities (`&#9906;`, `&times;`) |
| Navy | `#0b188f` | `#1a2a8f` |
| Green | `#3faa24` | `#2fa83c` |
| Border | `#dbe3f1` | `#e2e6ee` |
| Card hairline | `#0b188f26` (indigo tint) | `#e2e6ee` (grey) |
| Text / muted / faint | `#020205` / `#707070` / `#a3a3a3` | `#1f2733` / `#6b7280` / `#9ca3af` |
| Radius [^r] | `5px` | `3px` |
| Control height | `48px` | ad hoc |
| Content max | `1280px` | `1640px` |

[^r]: Wrong, and corrected by F-56 in the second pass below. The `5px` was read
    from the reference's `--border-radius` declaration; the reference applies it
    nowhere and renders every corner square.

The reference also carries a full `--cl-*` semantic layer (status pills, alert
surfaces, shadows, motion) with no counterpart in the build.

**Missing behaviour**

1. Series has no chart. `series.ts` says so outright. The reference draws one
   SVG line chart per indicator: y gridlines, a shaded forecast band, a dashed
   boundary rule at `lastActualYear`, solid actual and dashed forecast paths per
   country, hoverable points with a tooltip, and a legend.
2. Year from and Year to are number inputs; the reference uses selects over a
   fixed year range.
3. No Save query button in the Working query card (reference pairs it with
   Reset).
4. No Export button in the Observations card header.
5. Country rows in the catalogue are not clickable; the reference adds the
   country to the working query on click.
6. Curated only is a hard-disabled button rather than a working toggle.
7. Revisions shows two summary panels; the reference shows three, the third
   being "Last actual year moved".

XLSX is also absent, but that was a recorded decision on 2026-09-11
(`core/export/export-format.ts`) and stays out.

## Scope

Two stages, in order. The theme lands first so the chart is written against
final tokens rather than restyled after.

**Stage 1 - theme.** Load Source Sans Pro and Material Symbols. Restate
`styles.scss` on the reference's `--cl-*` tokens as the source of truth, keeping
the existing short names (`--navy`, `--accent`, ...) as aliases so component
SCSS does not have to be rewritten. Swap entity glyphs for real icons.

**Stage 2 - behaviour.** Items 1 to 7 above.

## Done when

- Source Sans Pro and Material Symbols render; no entity glyph stands in for an
  icon.
- Every colour, radius and control height in `styles.scss` matches the reference
  token set.
- Series renders an SVG chart per indicator with actual and forecast paths, a
  boundary rule, hover tooltip and legend, and keeps the screen reader
  description it has today.
- Year from and Year to are selects.
- Save query sits beside Reset in the Working query card and saves without
  leaving the tab.
- Observations header carries an Export button.
- Clicking a country row adds it to the working query.
- Curated only toggles and refetches.
- Revisions shows the last-actual-year-moved panel.

## Deviations from Done when

Two done-whens were not met literally. Both were deliberate and both are
recorded here rather than quietly restated, because the archive is the history.

**"Save query ... saves without leaving the tab."** It navigates to
`/saved-queries` instead. The done-when was written from the button's position
in the reference screenshots, not from its behaviour. The reference's own
handler is `onQuickSave: () => this.go("saved")`, so the button there is a
navigation control too. Matching the reference was the point of the fix, so the
navigation behaviour was kept and this line is the one that was wrong.

**"Revisions shows the last-actual-year-moved panel."** The third panel is
titled "Latest year covered" and reports the highest year on the page. The
reference's own value (`"2024 -> 2025"`) is hardcoded mock data, and the real
revisions response carries no forecast flag, so `lastActualYear` cannot be
derived from it at all. Shipping the reference's label over a different number
would have been a lie in the UI. The honest panel ships instead; restoring the
reference's label needs the API to return the flag first.

## Repair steps

Raised by the independent review at `5534304` and approved for repair before
completion. All three are regressions this fix introduced.

- [x] **R1 - F-42, tooltip anchoring.** `leftPercent`/`topPercent` are viewBox
      fractions, but the tip is positioned against `.plot`'s padding box while
      the SVG is `width: 100%; height: 280px` with `preserveAspectRatio`. They
      agree only where the element box happens to equal the viewBox. Give the
      SVG a box that always matches the viewBox aspect and position the tip
      against that box, not the padding box.
      *Done when:* the tip sits on its point at any card width, and the drawing
      still renders at its current size rather than growing with the column.
- [x] **R2 - F-43, accessible point values.** The chart is `aria-hidden` and
      `describe()` states only the range endpoints, so the per-year values the
      deleted `.points` strip used to expose are gone. Restore them as a
      visually hidden table beside the description, one row per country and one
      column per year, marking forecast cells.
      *Done when:* every plotted value is in the accessible tree, and the spec's
      "keeps the screen reader description it has today" holds in substance.
- [x] **R3 - F-44, contradictory legend.** The `.series-head` legend maps colour
      to actual/forecast; the charts map colour to country and use dashing for
      forecast. Restate the head legend in line styles so the two agree.
      *Done when:* nothing on the Series tab claims colour means actual or
      forecast.

- [x] **R4 - F-47, the paging footer lost its row.** Stage 1 took `display: flex`
      off `.card-foot` and put it behind an opt-in `.row`, because flex was
      fragmenting the prose footers. `paging-footer.html` was never given the
      class, so `margin-left: auto` on `.paging-controls` stopped doing anything
      and Prev/Next dropped onto their own line on Observations, Series, Vintages
      and the revisions pager. P1, and the sole merge blocker.
      *Done when:* the paging state and its controls share one row with the
      controls at the right-hand end, proven by the browser test that currently
      fails.

## Second fidelity pass, 2026-09-21

The repairs above were each verified against their own finding, and the browser
harness R4 needed made a second kind of check cheap: render the console and the
standalone export side by side at 1440px and diff computed styles rather than
reading screenshots. That pass raised fourteen findings, F-51 to F-64, all now
repaired. They are in the ledger individually; the shape of them is worth
recording here because it says something about how the first pass went wrong.

Five were style hooks the markup asks for and `styles.scss` never defined:
`.visually-hidden`, a `.pill` base, `.card-head.dark`, a card-level `.state`,
and a `--brand` that is not a token. CSS fails silently, so each one had been
rendering wrong since the port with nothing to signal it - a caption printing
its text, a badge as a highlighter stroke, a navy header that was not navy.

Five were measured drift the drift table had not caught: the radius, the
content column, the tab bar, table type and rules, and monospace on domain
codes.

- [x] **R5 - F-51 to F-64, the second pass.** Fix all fourteen, and record the
      two that are deliberate departures below.
      *Done when:* the console's computed styles match the export's for radius,
      content column, tab metrics, table type and rules, and code typeface; the
      five undefined hooks are defined; and the unit and browser suites are
      green.

The radius is the one to read twice. The export declares `--border-radius: 5px`
and applies it nowhere - every card, control and button in it computes
`border-radius: 0px`. The drift table above records 5px because it was written
from that declaration rather than from the render. The rendered design is the
contract, so the system is now square, and the table's Radius row is wrong as
written. This is what F-49 is about: the export is not in this repository, so
that table was the only record of it, and it was checked against the wrong half
of the file.

## Deviations from the second pass

Two differences from the export are deliberate and stay.

**The Series tab keeps its band header.** The export has no equivalent, but
that header carries the actual/forecast key, which the export states nowhere
and which R3 exists to keep honest.

**The paged tabs keep their footers.** The export is static with nothing to
page; this console pages Observations, Series and revisions for real, and the
revisions pager runs to 114 pages on the current data.

## Testing

Pure logic gets unit tests, per the standards' scope rule: the chart geometry
(`series-chart.ts` - scales, paths, boundary position, tooltip anchoring) and
the year range builder. The Angular components themselves ride on the build and
browser evidence.

## Notes

`prototypes/` is superseded by the standalone HTML. It is left in place as
history rather than deleted, but it is no longer the reference.

## Findings
Resolved with this fix and archived from the live ledger. IDs carry the
archive prefix so they stay unique across the project history.

### design-fidelity/F-42 [P2] closed - The chart tooltip is anchored to a percentage of the card, not to where the point actually rendered

**File:** ui/src/app/core/series-chart.ts:213
**Found:** 2026-09-14 by /audit (scope: current; lens: quality)
**Why it matters:** `leftPercent` is `cx / CHART_WIDTH * 100` and `topPercent` is
`cy / CHART_HEIGHT * 100`, and `series-chart.html` feeds them straight into
`[style.left.%]` and `[style.top.%]` on a `.tip` positioned inside `.plot`. Those
percentages resolve against `.plot`'s padding box, not against the SVG, and the
SVG is `width: 100%; height: 280px` with `preserveAspectRatio="xMidYMid meet"`.
The two only agree when the plot is exactly 760px wide with no padding.

At `--content-max: 1280px` the card is far wider than 760. `meet` then caps the
scale at 1 and centres the drawing, so a point at `cx` renders at
`(W - 760) / 2 + cx` while the tip is placed at `cx / 760 * W`. At W = 1250 the
leftmost point draws near 301px and its tip lands near 92px: the label appears
beside a different year. Below 760px the horizontal case comes right and the
vertical one breaks instead, because `meet` letterboxes and `.plot`'s 15px and
5px padding make the container 300px tall against a 280 viewBox.

The tip text names its own country, year and state, so the reader is not told a
wrong value - but the hover tooltip is a done-when of this fix and it does not
point at what was hovered at the default width.
**Suggested fix:** let the SVG carry the tooltip's frame rather than the card:
either drop `preserveAspectRatio` to `none` and remove `.plot`'s padding from the
positioning context, or place the tip inside the SVG as a `<foreignObject>` or
`<g>` in viewBox units, where `cx`/`cy` are already correct.
**Resolution:**
**Repair:** The SVG now sits in a `.canvas` capped at the viewBox width with
`height: auto`, so the element box always matches the viewBox aspect, and the tip
is positioned against that box instead of `.plot`'s padding box.

Closed on 2026-09-14 by the independent review at 6bec3ed, with runtime evidence
rather than a reading of the CSS. The repair's premise is that `.canvas` and the
SVG are the same box at every width, which only holds if a viewBox-only SVG with
`width: 100%; height: auto` really does take its intrinsic ratio. Measured in
Chromium at container widths 1250, 900, 760, 600 and 320: the `.canvas` and
`<svg>` boxes matched exactly at all five (760x280, 760x280, 730x268.9, 570x210,
290x106.8), and the tooltip anchor computed as
`canvas.x + canvas.width * leftPercent / 100` landed on the rendered centre of
the first point to within 0.1px at every one of them. The defect this finding
described, a 200px horizontal error at the default width, is gone.

The drawing also still renders at its old size: `meet` was already capping the
scale at 1 above 760 and scaling to fit below it, so the only thing the fixed
280px height contributed was letterboxing, and removing it changed no rendered
dimension.

Not covered: the geometry is CSS, so nothing in the Karma suite guards it. A
later change to `.plot`'s padding or the `.canvas` cap would reintroduce this
silently. See F-50 for the one unit test that carries the tooltip's name.

### design-fidelity/F-43 [P2] closed - Rewriting Series as a chart removed the only accessible rendering of the point values

**File:** ui/src/app/series/series.html:29
**Found:** 2026-09-14 by /audit (scope: current; lens: quality)
**Why it matters:** Before this delta each series drew a `.points` strip of
`year` and formatted `value` as ordinary text, so every observation on the tab
was readable by a screen reader and reachable without a pointer. The rewrite
replaced that strip with an SVG that carries `aria-hidden="true"` and a metadata
table that lists unit, source, vintage, `lastActualYear` and a year span but no
values. The only place a value now exists is `chart().points[].value`, rendered
in a tip driven by `mouseenter`/`mouseleave` on a `<circle>` that is not
focusable, so keyboard-only use cannot reach it either.

The spec's done-when asks the tab to keep "the screen reader description it has
today", and `chart().description` does keep a description: the name, unit,
countries, year span, low and high, and the actual/forecast boundary. That is why
this is recorded as P2 rather than a broken done-when. What it no longer keeps is
the data. A user who cannot use a mouse can read every number on Observations and
none on Series.
**Suggested fix:** give the metadata table the values back - one column of
`year: value` pairs per series, or a disclosure holding the same table the strip
used to be. The chart stays decorative and the facts stay available.
**Resolution:**
**Repair:** `SeriesChart` gained a `table` of every plotted value by country and
year, rendered as a visually hidden table beside the description, with forecast
cells marked. Five geometry specs and three component specs cover it.

Closed on 2026-09-14 by the independent review at 6bec3ed. Completeness holds by
construction and not only by assertion: `buildTable` (`core/series-chart.ts:283`)
walks the chart's own `years` union and the same `group` the points came from, so
every year a point exists for has a column and every series has a row. The spec
at `series-chart.spec.ts:299` pins that with
`cells.length === chart.points.length`, which is the right shape of assertion for
this claim. Values are formatted through the same `ONE_DECIMAL_FORMAT` and unit
as the tooltip, so the two cannot drift apart.

Association is correct: a `<caption>`, `<th scope="col">` per year, `<th
scope="row">` per country, an explicit `not reported` for a null cell rather than
an empty one, and `.sr-only` is a genuine clip-based hide
(`styles.scss:702-712`), not `display: none`, so the table is in the accessible
tree.

One residual, recorded here rather than as a new finding because the repair
matched this finding's own suggested fix: a sighted keyboard-only user still
cannot reach the values. The circles are still not focusable and the table is
visually hidden, so the values are available to assistive tech and to nobody
else. A `<details>` disclosure instead of `.sr-only` would close that too.

### design-fidelity/F-44 [P2] closed - The Series head legend still says colour means actual or forecast, which is now what the chart uses for country

**File:** ui/src/app/series/series.html:21
**Found:** 2026-09-14 by /audit (scope: current; lens: quality)
**Why it matters:** The `.series-head` legend was written for the deleted
`.points` strip, where a green swatch (`--badge-actual-bg`) meant actual and an
amber one (`--badge-forecast-bg`) meant forecast. It survived the rewrite
unchanged. The charts below it encode actual versus forecast as solid versus
dashed stroke and filled versus hollow point, and use colour for country, walking
`--series-1..6` - the second of which is `#3faa24`, a green.

So one screen carries two legends that disagree: the page legend says green is
"Actual", and each chart's own legend says green is the second country on that
chart. The "lastActualYear" swatch is the only one the charts still honour.
**Suggested fix:** either delete the head legend, now that every chart carries
its own, or restate it in the chart's vocabulary: solid for actual, dashed for
forecast, shaded band past `lastActualYear`.
**Resolution:**
**Repair:** The head legend now samples line style rather than colour, and says
outright that colour identifies the country.

Closed on 2026-09-14 by the independent review at 6bec3ed. `series.html:26-31`
now draws three neutral `--text` rules, solid, dashed, and a dashed vertical in
`--navy` at the chart's own 0.5 opacity, plus a fourth entry stating that colour
identifies the country. `series.scss:133-152` carries no `--badge-*` colour on
any of them. Nothing on the tab now claims colour means actual or forecast, and
the three samples match what `series-chart.html:104-114` and `:88-94` actually
draw.

### design-fidelity/F-47 [P1] closed - The paging footer's Prev and Next dropped onto their own line when .card-foot stopped being a flex row

**File:** ui/src/styles.scss:353
**Found:** 2026-09-14 by /audit (scope: current; lens: quality)
**Why it matters:** This delta took `display: flex; align-items: center; gap`
off `.card-foot` and moved it behind an opt-in `.row` modifier, with a comment
explaining why: the feet that carry prose with inline `<strong>` were being
broken into flex items. That reasoning is right, and it was applied to two of
the three `.card-foot` in the project. The third,
`ui/src/app/query/paging-footer.html:6`, is the one that lays out controls, and
it never got `.row`.

`paging-footer.scss:5-9` positions the controls with
`.paging-controls { margin-left: auto }`, which only does anything inside a flex
or grid parent. With the parent back to `display: block`, that span becomes a
full-width block-level flex container, the auto margin resolves to zero, and
Prev and Next fall to a second line at the left edge instead of sitting right of
the page-and-vintage text.

Measured in Chromium against the running dev server on `/observations`:
`.card-foot` computes to `display: block`; `.paging-state` renders at
`y = 551, width 181`; `.paging-controls` renders at `y = 568, x = 366,
width 1188`. Two rows, left-aligned, in a 76px-tall footer that used to be one.

Every paged tab renders this component - Observations, Series, Vintages and the
revisions pager - so the regression is on four screens. Nothing is unreadable
and both buttons still work, which is why it is not a P0, but it is a layout
break introduced by a fix whose entire purpose was design fidelity, and it
contradicts the footer in every reference screenshot.
**Suggested fix:** `class="card-foot row"` in `paging-footer.html:6`. Then
confirm the other two feet are meant to be blocks, which they are: both carry
prose.
**Resolution:**
**Repair:** `paging-footer.html:6` now carries `class="card-foot row"`, the opt-in
that makes the footer a flex row again. Proven by `ui/e2e/paging-footer.spec.ts`,
which measured the regression and now passes, plus a unit spec holding the class
itself.
**Re-review, 2026-09-21 (independent):** confirmed against the repaired code, not
the repair note. `paging-footer.html:6` reads `class="card-foot row"`;
`styles.scss:385` scopes `display: flex; align-items: center; gap` to `&.row`;
`paging-footer.scss:5` still uses `margin-left: auto`, which now has a flex
parent to resolve against. The two remaining `.card-foot` (`series.html:76`,
`countries-indicators.html:160`) carry prose and are correctly left as blocks, so
the opt-in was not over-applied. `npm run test:browser` passes all 6 specs
including the footer geometry check, and `npm test` passes 713 specs. No new
defect found in the repaired area. Closed.

### design-fidelity/F-51 [P1] closed - .visually-hidden is referenced by four table captions and defined nowhere, so each renders as visible centred text

**File:** ui/src/styles.scss:700
**Found:** 2026-09-21 by design-fidelity verification (scope: current; lens: quality)
**Why it matters:** The screen-reader utility in this system is `.sr-only`.
Four captions ask for `.visually-hidden` instead - `vintages.html:18` and
`:108`, `saved-queries.html:19`, `request-builder.html:126` - plus a reason
span at `saved-queries.html:56`. No rule of that name exists, so a `<caption>`
falls back to its default `display: table-caption; text-align: center` and the
instruction meant for assistive technology prints as a centred grey line
between the card head and the table.

Measured in Chromium on `/vintages`: "Published vintages, newest first. Select
one to see what it changed." renders at `y = 206, height 26`, centred over the
table. Two defects in one: prose appears where the design has none, and the
a11y affordance the caption exists for is not actually hidden, so it is also
read twice.
**Suggested fix:** alias it. `.sr-only, .visually-hidden` share one rule, so
either name works and neither can silently do nothing again.
**Resolution:**
**Repair:** `styles.scss` now declares `.sr-only, .visually-hidden` together.
All four captions and the reason span are hidden.
**Re-review, 2026-09-21 (independent):** confirmed at `styles.scss:758`, a single
rule shared by both names using the standard clip-path pattern. Every reference
to either class in `ui/src` now resolves: `.visually-hidden` at
`vintages.html:18` and `:112`, `saved-queries.html:19` and `:56`,
`request-builder.html:126`; `.sr-only` at `countries-indicators.html` (four),
`observations.html:33`, `series.html:47` and `series-chart.html:17`. The new
chart card depends on the same rule for its whole accessible value table, which
the browser spec exercises. No new defect found. Closed.

### design-fidelity/F-52 [P2] closed - .pill has colour modifiers but no base rule, so every vintage and revision badge renders as highlighted text

**File:** ui/src/app/vintages/vintages.scss:36
**Found:** 2026-09-21 by design-fidelity verification (scope: current; lens: quality)
**Why it matters:** `vintages.scss` defines `.pill.latest`, `.pill.superseded`
and `.pill.significant`, each setting only `background` and `color`. Nothing
defines `.pill`. The tokens are right - `.latest` computes the reference's
`#cce5ff` - but with no padding, no radius, no font size and no `inline-flex`,
the span is an inline run of 16px body text wearing a background. It reads as a
highlighter stroke, not a badge.

Measured on `/vintages`: `.pill.latest` computes `padding: 0px`,
`border-radius: 0px`, `font-size: 16px`. The reference draws a padded lozenge
at 12px. Affects the isLatest column on every vintage row and the Flagged
column on every revision row.
**Suggested fix:** promote a `.pill` base to `styles.scss` beside `.badge`,
which is the same lozenge wearing a dot and a semantic name.
**Resolution:** Closed by the 2026-09-21 audit at 3b1d669. `.pill` base confirmed at `styles.scss:709` (inline-flex, 4px 10px, --radius-pill, 12px/600); the vintages rules keep only colour and `.latest` reads `--badge-latest-ink`.
**Repair:** `styles.scss` now carries a `.pill` base - `inline-flex`, `4px 10px`,
`--radius-pill`, 12px/600. The local rules keep only their colours, and
`.latest` now uses `--badge-latest-ink` rather than overriding to `--navy`.

### design-fidelity/F-53 [P2] closed - .card-head.dark is asked for by the revisions header and has no variant, so the card reads as an ordinary one

**File:** ui/src/app/vintages/vintages.html:67
**Found:** 2026-09-21 by design-fidelity verification (scope: current; lens: quality)
**Why it matters:** The reference fills the head of the Revisions card in navy
with white text, which is what pairs it visually with the vintage table above
it: the card is the subject of the row you just clicked. `vintages.html:67`
writes `class="card-head dark"`, but `styles.scss` defines no `.dark`, so the
head computes `#f4f5fa` with dark text, identical to every other card head on
the page.
**Suggested fix:** add the modifier to the shared `.card-head` rule, where the
h2 and the meta both need re-inking, not to `vintages.scss`.
**Resolution:** Closed by the 2026-09-21 audit at 3b1d669. `.card-head.dark` confirmed at `styles.scss:343`, re-inking the h2 and meta.
**Repair:** `.card-head.dark` in `styles.scss` sets the navy background and
border, `--navy-ink` on the h2 and 70% white on the meta.

### design-fidelity/F-54 [P2] closed - .state has no rule where it stands in for a card body, so five messages sit flush against the card edge

**File:** ui/src/styles.scss:395
**Found:** 2026-09-21 by design-fidelity verification (scope: current; lens: quality)
**Why it matters:** `.state` names two different things. In `export-card` and
`request-builder` it is an inline note under a control, already inside a padded
body, and it must not add padding. In `countries-indicators`, `saved-queries`
and `vintages` it is a direct child of `section.card` standing in for the
body - loading, unavailable, empty - and it needs the body's inset.

Only `countries-indicators.scss` styled the second case, locally. So
`saved-queries.html:13` ("No saved queries yet...") and the four state lines in
`vintages.html` had nothing but a `<p>` margin: measured on `/saved-queries`,
the text starts at `x = 81` against a card edge at `x = 80`.
**Suggested fix:** promote the card-level case scoped to `.card > .state`,
which cannot reach the notes nested inside a body, and drop the local
duplicate.
**Resolution:** Closed by the 2026-09-21 audit at 3b1d669. `.card > .state` confirmed at `styles.scss:398` at the card-body inset; the `countries-indicators.scss` duplicate is gone and the nested notes in export-card and request-builder are out of its reach, both verified as non-direct children.
**Repair:** `styles.scss` carries `.card > .state` at the `.card-body` inset of
`20px 22px`, so the message lines up with copy in the cards beside it. The
`countries-indicators.scss` copy is deleted, leaving one source of truth.

### design-fidelity/F-55 [P2] closed - .linklike colours itself with an undefined --brand, so the vintage id links inherit body text

**File:** ui/src/app/vintages/vintages.scss:30
**Found:** 2026-09-21 by design-fidelity verification (scope: current; lens: quality)
**Why it matters:** `.linklike { color: var(--brand) }`. No `--brand` exists in
the token set; the names are `--navy` and `--cl-primary-color`. With no
fallback the declaration is invalid at computed-value time and the property
inherits, so the only control that opens a vintage's revisions is coloured like
the text beside it and does not read as a link.
**Suggested fix:** `var(--navy)`. Grepping every `var(--...)` in component SCSS
against the `:root` block would have caught this and would catch the next one.
**Resolution:** Closed by the 2026-09-21 audit at 3b1d669. No `var(--brand)` remains in `vintages.scss`.
**Repair:** `vintages.scss:30` now reads `var(--navy)`.

### design-fidelity/F-56 [P2] closed - Every card, control and button carries a 5px radius that the reference renders square

**File:** ui/src/styles.scss:167
**Found:** 2026-09-21 by design-fidelity verification (scope: current; lens: quality)
**Why it matters:** `--radius: 5px` was read out of the reference's own
`--border-radius: 5px`. The token is declared there and applied nowhere: every
card, field, chip, search box and button in the rendered export computes
`border-radius: 0px`. The port took the declaration for the design, so the
whole console is rounded where the thing it was ported from is square. This is
the single most visible difference across all seven tabs.

This one is worth stating carefully, because `current-feature.md` records 5px
in its drift table for the same reason: that table was written from the token,
not from the render.
**Suggested fix:** `--radius: 0`, keeping `--radius-pill` for the badges and
pills that really are round, and a comment recording why the token and the
reference's own variable disagree.
**Resolution:** Closed by the 2026-09-21 audit at 3b1d669. `--radius: 0` confirmed at `styles.scss:172` with the token-versus-render comment; the `.btn.primary, .btn.navy` radius branch is gone. Left one dead token behind, raised as F-69.
**Repair:** `--radius` is `0` with that comment. The now-redundant
`--radius-button` branch on `.btn.primary, .btn.navy` is gone.

### design-fidelity/F-57 [P2] closed - The content column is 60px narrow on a 2px-wide gutter, so no card lands where the reference puts it

**File:** ui/src/app/app.scss:104
**Found:** 2026-09-21 by design-fidelity verification (scope: current; lens: quality)
**Why it matters:** `--content-max: 1280px` was applied as the outer width of
`.app-main`, with `padding: 20px 30px 30px` inside it. In the reference the
1280 is the column and the 28px gutter sits outside it, for 1336 overall.

Measured at a 1440 viewport: the first card starts at `x = 110` and is 1220
wide; the reference's starts at `x = 80` and is 1280. Every card, column split
and table on every tab is offset and undersized by the same amount, which is
why individually correct paddings still did not reproduce the design.
**Suggested fix:** keep `--content-max` meaning the column, add `--gutter`, and
give the shell `max-width: calc(var(--content-max) + 2 * var(--gutter))`.
**Resolution:** Closed by the 2026-09-21 audit at 3b1d669. `.app-main` and `.attribution` size from `calc(var(--content-max) + 2 * var(--gutter))`; cards measured at `x = 80` at a 1440 viewport.
**Repair:** `.app-main` and `.attribution` compute the shell from the column
plus two gutters and pad by `26px var(--gutter) 60px`, matching the reference's
own box. The top bar and tab bar take the same gutter. Cards now start at
`x = 80`.

### design-fidelity/F-58 [P2] closed - The tab bar is set in 16px on padding the reference does not use

**File:** ui/src/app/app.scss:88
**Found:** 2026-09-21 by design-fidelity verification (scope: current; lens: quality)
**Why it matters:** The tabs inherit the 16px body size and lay out on
`padding: 15px 0 10px` with a 30px flex gap, so the bar is 48px tall and each
label's hit area is only as wide as its text. The reference sets them at 14px
on `16px 14px 13px` with a 4px gap, giving a 50px bar and padded targets. The
navigation is the first thing on every screen and it is the wrong size on all
of them.
**Suggested fix:** take the reference's three numbers directly.
**Resolution:** Closed by the 2026-09-21 audit at 3b1d669. `.tabs a` measured at 14px on `16px 14px 13px`, first label at `x = 42`, matching the reference.
**Repair:** `.tabs a` is 14px on `16px 14px 13px`; the bar gaps by 4px and
takes the shared gutter, which puts the first label at `x = 42` as the
reference does.

### design-fidelity/F-59 [P2] closed - Table cells are 16px ruled in the indigo card hairline, where the reference is 14px on faint grey

**File:** ui/src/styles.scss:585
**Found:** 2026-09-21 by design-fidelity verification (scope: current; lens: quality)
**Why it matters:** `tbody td` set no font size, so cells inherited the 16px
body size against the reference's 14px, and both cell rules used `--border`,
the indigo-tinted `#dbe3f1` that is the card's own hairline, where the
reference rules rows in `--cl-grey-color-lighter` `#f2f2f2`. Cell padding was
`12px 15px` against the reference's `15px 20px`, and `thead th` carried the
500 body weight against its 400.

Tables are most of this console - the catalogue, observations, series metadata,
vintages and revisions - so a table row is the unit the design is judged by,
and it was heavier, tighter and more strongly ruled than the reference on every
one.
**Suggested fix:** the card chrome and the table want different insets, so give
the table its own pair rather than widening `--cell-x`, which also pads
`.card-head` and `.card-foot` and is already correct at 15px.
**Resolution:** Closed by the 2026-09-21 audit at 3b1d669. `--table-y`/`--table-x` confirmed used by `thead th` and `tbody td` only; cells measured 14px on `15px 20px` ruled `#f2f2f2`, heads at 400. Left `--cell-y` dead, raised as F-69.
**Repair:** `--table-y: 15px` and `--table-x: 20px` are new and used only by
`thead th` and `tbody td`; `--cell-*` keeps the card chrome at 11/15. Cells are
14px, ruled in the new `--border-faint`, and column heads drop to 400.

### design-fidelity/F-60 [P2] closed - Domain codes are set in monospace, which the reference reserves for request payloads

**File:** ui/src/styles.scss:607
**Found:** 2026-09-21 by design-fidelity verification (scope: current; lens: quality)
**Why it matters:** `.code-text`, the catalogue's ISO3 and sources columns, the
country rows' source line, the overview cadence codes and the series chart and
metadata codes all take `--font-mono`. In the reference every code that names a
domain object - `GDP_GROWTH_REAL`, `ZAF`, `IMF_WEO` - is Source Sans Pro, bold,
at the size of the text around it. Monospace appears in exactly one place
there: the request builder's URLs, headers and JSON, which this port also sets
in mono and which is correct.

Measured on `/countries-indicators`: the Code cell computes
`ui-monospace, ...` at 13.33px, the reference `"Source Sans Pro"` at 14px. The
13.33 is its own bug - `.code-link` wears the rule on a `<button>`, which drops
to the browser's control size because the rule never set one.
**Suggested fix:** sans everywhere a code names a thing; leave the request
builder alone.
**Resolution:** Closed by the 2026-09-21 audit at 3b1d669. `.code-text` confirmed sans at `styles.scss:645` with `font-size: inherit`; the request builder keeps monospace for URLs, headers and JSON, which is where the reference uses it.
**Repair:** `.code-text` is `--font-sans` with `font-size: inherit` so the
button matches its cell, and the five component rules follow. The request
builder is untouched. Marked `fixed`, not `closed`; a review has not looked at
it yet.

### design-fidelity/F-61 [P2] closed - The overview stat tiles print the label above the number, and the dl order is inverted to do it

**File:** ui/src/app/overview/overview.html:37
**Found:** 2026-09-21 by design-fidelity verification (scope: current; lens: quality)
**Why it matters:** `.stat` is `flex-direction: column-reverse`, and its own
comment explains the intent: show the value above the term "without breaking
dt-then-dd document order". The markup does the opposite - `<dd>` is written
first and `<dt>` last - so the reverse flips a list that was already inverted
and the label ends up on top, against the reference and against every stat tile
convention.

Two defects reinforcing each other: the rendering is wrong, and the `<dl>` is
malformed, because a definition list's term precedes its description.
**Suggested fix:** move `<dt>` above the `<dd>` block in all three tiles and
keep `column-reverse`, which is what the comment describes.
**Resolution:** Closed by the 2026-09-21 audit at 3b1d669. All three tiles are `<dt>`-then-`<dd>` and the number measured above the label.
**Repair:** all three tiles are `<dt>`-then-`<dd>`, the rule is unchanged, and
the number renders on top. Marked `fixed`, not `closed`; a review has not
looked at it yet.

### design-fidelity/F-62 [P2] closed - Three overview icons are still entity glyphs, which this spec's own Done when rules out

**File:** ui/src/app/overview/overview.ts:115
**Found:** 2026-09-21 by design-fidelity verification (scope: current; lens: quality)
**Why it matters:** The spec's Done when says "no entity glyph stands in for an
icon", and the drift table names the substitution as the defect. Stage 1
converted eight icons to Material Symbols and left the three use-case cards on
their glyphs in `overview.ts`, rendered through a `.icon` span that no
stylesheet defines. The reference uses `trending_up`, `leaderboard` and
`history`.

They are on the overview, which is the first screen, and they were the specific
example the spec gave.
**Suggested fix:** the ligature names, through the existing `.ms-icon`.
**Resolution:** Closed by the 2026-09-21 audit at 3b1d669. The three entries carry Material ligature names, the template uses `.ms-icon`, and `overview.spec.ts` now asserts the names so a glyph cannot return silently. Raised the wider fallback gap on F-46.
**Repair:** the three entries carry ligature names and the template uses
`.ms-icon`, sized to 20px in the use-case h2. The unit spec now asserts the
ligature names rather than only counting spans, so a glyph cannot come back
silently.

### design-fidelity/F-63 [P3] closed - The series chart names countries by code where the design names them

**File:** ui/src/app/core/series-chart.ts:265
**Found:** 2026-09-21 by design-fidelity verification (scope: current; lens: quality)
**Why it matters:** `buildCharts` reads `Series.country`, which is the ISO3, so
the legend under each chart reads "NAM", "ZAF" where the reference reads
"Namibia", "South Africa", and the metadata table's Country column reads "NAM"
where the reference reads "ZAF — South Africa". The payload carries no name, so
this is not a formatting slip: the tab never asked the catalogue for one.

Cosmetic, but the legend is the chart's key, and three-letter codes are the one
thing a reader of an ECL input deck should not have to decode.
**Suggested fix:** pass an ISO3-to-name map into `buildCharts` rather than
reaching for a global, and fall back to the code where the catalogue is silent.
**Resolution:** Closed by the 2026-09-21 audit at 3b1d669. Legend and metadata table read country names, with the ISO3 as fallback. Closed on the rendering; the untested fallbacks are raised separately as F-66 and the duplicate fetch as F-65.
**Repair:** `buildCharts` takes an optional `ReadonlyMap`, defaulting to empty.
`ChartLegendEntry` gains `label` and keeps `country` as the track key, so the
identity the template tracks by is unchanged. `SeriesPage` resolves the map
from `macro.countries()` and catches the failure, so a catalogue outage costs
the labels and not the tab. Marked `fixed`, not `closed`; a review has not
looked at it yet.

### design-fidelity/F-64 [P3] closed - Only the id cell opens a vintage's revisions, though the card head tells you to click the row

**File:** ui/src/app/vintages/vintages.html:33
**Found:** 2026-09-21 by design-fidelity verification (scope: current; lens: quality)
**Why it matters:** The head says "Newest first - click a row for its
revisions" and the reference makes the whole row the target. Here only the id
button calls `select()`, so a click anywhere in the other five columns - which
is most of the row's area, and the part the instruction points at - does
nothing at all. No feedback, no hover affordance, no error; the reader concludes
the feature is broken.
**Suggested fix:** put the handler on the `tr` and keep the button, which is
the keyboard path. `select()` is already idempotent, so the bubbled second call
from a click on the id is a no-op.
**Resolution:** Closed by the 2026-09-21 audit at 3b1d669. The `tr` carries the handler and `select()` is idempotent, so the bubbled call from the id button is a no-op. Closed on the behaviour; the missing pointer affordance is raised as F-68.
**Repair:** the `tr` carries `clickable` and `(click)="select(vintage)"`, with a
comment recording why the double call is safe.

## Independent review

**Status:** passed
**Target commit:** 55f3065b25962638f974f968c0a7a58083f87408
**Base commit:** 8d57c0d04f3faa36a2ae69c01d9d4623728fcf40
**Base ref:** master
**Spec hash:** 1af77a2aa681b35ff9ec44e3893a9213241231d5ffacce20c637d0e7a446992b
**Prepared by:** claude
**Builder model:** claude-opus-5[1m]
**Requested reviewer:** claude
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-09-21T09:48:09Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5[1m]
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-09-21T09:58:00Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

### Commands

- `git rev-parse HEAD`, `git merge-base master HEAD`, `sha256sum blueprint/context/current-feature.md`, `git status --porcelain`: pass, every Phase B precondition matched
- `api/ npm run typecheck`: pass
- `api/ npm test`: pass, 67 tests in 6 files
- `ui/ npm test`: pass, 713 specs in headless Chrome
- `ui/ npm run test:browser`: pass, 6 Playwright specs in Chromium
- `ui/ npx ng build --configuration development`: pass, styles.css 21.69 kB, main.js 1.78 MB
- lint: unavailable, no lint command is configured in either package
- `Verify`: unavailable, no Verify command exists yet
- dependency or vulnerability scan: unavailable, none declared and none run

### Evidence

- F-47 re-examined at the code, not the repair note: `paging-footer.html:6` carries `card-foot row`, `styles.scss:385` scopes the flex to `&.row`, `paging-footer.scss:5` keeps `margin-left: auto`, and the two prose feet are correctly left as blocks
- F-51 re-examined: `styles.scss:758` declares `.sr-only, .visually-hidden` as one rule, and every reference to either name in `ui/src` now resolves, including the new chart card's whole accessible value table
- The four repaired style hooks from the second pass were verified present: `.pill` base at `styles.scss:709`, `.card-head.dark` at `:343`, `.card > .state` at `:398`, and no `--brand` reference survives anywhere in `ui/src`
- Chart geometry read in full at `ui/src/app/core/series-chart.ts`, against its 27 unit cases and the three-viewport Playwright tooltip test
- Performance: `series.ts:80` and `working-query-card.ts:65` both subscribe to `macro.countries()` on construction, and `http-macro-data.provider.ts` holds no client cache, which reproduces F-65 from the code
- Security: the delta touches no API, no route, no auth boundary and no secret. The one outbound-behaviour change is the committed Angular CLI analytics id in `ui/angular.json`, recorded as F-71
- Token sweep across `ui/src` for `var()` consumers, which confirmed F-69 and surfaced the separate chart-palette duplication recorded as F-73

### Findings

- Closed after independent re-examination: F-47, F-51
- Added: F-71 (P3, committed CLI analytics id), F-72 (P3, chart description claims a forecast that is not there), F-73 (P3, chart palette declared twice), F-74 (P3, unbounded year-option array from a restored saved query)
- Confirmed and left open with reviewer notes: F-65, F-66, F-67, F-68, F-69, F-70
- No P0 or P1 finding is open or fixed

### Remaining risk

- No lint command exists in either package, so style and dead-code drift has no automated signal
- No Verify command and no CI workflow exist, so nothing runs these suites outside a developer's machine
- No dependency or vulnerability scan is declared or was run; the security lens here is code reading, not a scan
- Visual fidelity against the standalone export cannot be re-derived from this repository, because the export is not in it (F-49). Every fidelity claim in the spec rests on measurements the reviewer cannot repeat
- The Playwright suite stubs `/api/macro/**`, so no evidence in this delta exercises the Express relay or a real upstream; the tooltip geometry is proven at three viewport widths and the paging footer at one
- F-67 (Angular Material themed and unused) is inherited from before the base commit rather than introduced here, and carries roughly 38% of the emitted global stylesheet plus two runtime dependencies
- 28 open and 1 unverified findings remain in the ledger, all P2 or P3, plus F-38 at P2 `fixed` and so still awaiting a review pass of its own. None blocks completion. F-65, F-66 and F-48 are the ones worth taking before the next feature builds on this surface
