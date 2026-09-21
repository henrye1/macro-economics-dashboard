# Feature: App shell split

**From build-plan:** feature 18

> **Generated file.** Holds the one feature, fix, or rollback being built right now.

**Type:** Feature
**Status:** verified
**Branch:** feature/app-shell-split

## Goal

Make the console's chrome something a route opts into rather than something
every route is trapped inside, so feature 19 can add full-bleed auth screens
without them inheriting a topbar, a tab bar and an attribution footer.

Nothing a user can see changes. The seven tabs render identically before and
after, at the same URLs, with the same markup. That is the whole done-when, and
it is why this is its own feature: the change moves `app.ts`, `app.html`,
`app.scss` and `app.spec.ts` wholesale and is the one edit that can break all
seven tabs at once.

## Design reference

None. This is a refactor with no visual delta. The reference for "correct" is
the current rendering, and the seven PNGs in `blueprint/references/` remain the
design of record for the pages themselves.

## In scope

- A `ConsoleShell` component holding today's topbar, tab bar, `<main>` and
  attribution footer, plus the `/api/macro/vintages` read that feeds the header
  strip and the footer.
- `App` (`app-root`) reduced to a single `<router-outlet />`.
- `app.routes.ts` converted from seven flat routes to a parent route with
  `component: ConsoleShell` and the seven as its children.
- Splitting `app.spec.ts` so chrome assertions live with the chrome component
  and routing assertions stay at the root.
- One browser case proving the chrome renders on a console route and a deep
  link lands inside it.

## Out of scope

- **The auth layout.** The plan line for 18 asks for it here, and it is
  deliberately deferred to 19. A second layout with no child routes is
  unreachable code: nothing can navigate to it, no test can render it through
  the router, and its done-when would be "the file exists". Feature 19 adds it
  in the same commit as the screens that make it reachable, which is also when
  its markup gets decided by the reference. This feature makes that possible by
  turning the console chrome into one of two siblings instead of the root.
- Any change to the seven pages, their components, styles or data.
- The route guard and session handling. Feature 19.
- F-65, the duplicate country-catalogue fetch on the Series tab. It is in the
  ledger, it is a page concern rather than a shell concern, and folding a repair
  into a no-visible-change refactor would make the diff impossible to review.
- Renaming URLs. Every path stays exactly as it is.

## Build loop

`workflow.stepReview` is `feature`, so the three steps below are built in order
and reviewed as one packet at the end. `workflow.checkpointCommits` is
`disabled`, so no commits happen during the steps; `/complete` makes the single
feature commit.

## Build steps

- [x] **1. Extract the console shell and nest the routes.** Create
      `ui/src/app/shell/console-shell.{ts,html,scss}` and move the template,
      styles and component logic across from `app.{html,scss,ts}` unchanged:
      the tab list, the `shell` signal reading `macro.vintages()`, the
      `loading` / `unavailable` / `unavailableMessage` / `vintageLabels` /
      `attribution` computeds, and `STRIP_UNAVAILABLE`. `App` keeps only
      `<router-outlet />` and drops `RouterLink` and `RouterLinkActive` from its
      imports. In `app.routes.ts`, wrap the seven routes as children of a
      pathless parent carrying `component: ConsoleShell`, keeping the `''`
      redirect to `overview` and the `**` redirect. Update `app.spec.ts` only
      as far as needed to keep it compiling and green.
      *Done when:* all seven URLs render the same DOM as before inside
      `.app-main`, the tab bar marks the active tab, `/` and an unknown path
      still land on Overview, `npm test` is green in `ui/`, and
      `npx ng build --configuration development` succeeds.

- [x] **2. Split the spec along the new seam.** Move the chrome assertions out
      of `app.spec.ts` into `ui/src/app/shell/console-shell.spec.ts`: the
      vintage strip's loading, populated, failing and explained-failure states
      including the `role="status"` that F-10 added, the attribution footer
      including its escaped-text case and its empty fallback, the seven tabs in
      display order, and the live-envelope regression that reads `isLatest` from
      `data` rather than the empty `meta.vintages`. Leave `app.spec.ts` holding
      what is genuinely root-level: that each of the seven paths resolves to its
      page component, that no `.page-title` placeholder survives, and the two
      redirects. Both files render through the router so the nesting itself is
      exercised.
      *Done when:* every assertion that existed before still exists in one of
      the two files, the spec count does not drop, and `npm test` is green.
      *Built:* 715 specs, up from 713. The parent-lifetime claim is asserted as
      shell node identity across four navigations rather than as a call count:
      the first attempt counted `vintages()` and read 6, because the working
      query card reads the same route, so the number moved with which tabs the
      test visited.

- [x] **3. Guard the seam in the browser.** Add one case to `ui/e2e/` that
      navigates directly to `/vintages`, asserts the topbar wordmark, the seven
      tab links and the attribution footer are present, and that the page
      content rendered inside `.app-main`. Deep-linking is the path that a
      parent-route mistake breaks first, and it is the claim a unit test makes
      least convincingly.
      *Done when:* `npm run test:browser` passes in `ui/` with the new case, and
      it fails if the parent route is removed.

- [x] **4. Repair F-77, the request count the spec asked for.** The independent
      review at `9fa21db` found that step 2 substituted shell node identity for
      the request-count assertion this spec's Data / contracts section requires,
      and that the stated reason for the substitution was wrong. Identity
      constrains the component's lifetime, not the number of requests: moving
      the read into an effect later would keep identity and refetch per tab.
      The count is directly assertable by walking only the tabs that reach no
      other caller of `vintages()`.
      *Done when:* `console-shell.spec.ts` asserts the shell issues exactly one
      `vintages()` call across a mount and three navigations, the node-identity
      case stays, and `npm test` is green.
      *Built:* mounted at `/saved-queries` and walked `/countries-indicators`
      twice more. Those two are the only tabs that call nothing themselves: the
      overview and vintages pages read `vintages()` directly, and the working
      query card reads it on observations, series and the request builder. The
      review named the request builder as a third non-caller, which is wrong for
      that reason; two are enough. 716 specs.

## Files / areas

| Path | Change |
| --- | --- |
| `ui/src/app/shell/console-shell.ts` | new, holds today's `App` logic |
| `ui/src/app/shell/console-shell.html` | new, today's `app.html` |
| `ui/src/app/shell/console-shell.scss` | new, today's `app.scss` |
| `ui/src/app/shell/console-shell.spec.ts` | new, chrome assertions from `app.spec.ts` |
| `ui/src/app/app.ts` | reduced to `<router-outlet />`, imports trimmed |
| `ui/src/app/app.html` | reduced to `<router-outlet />` |
| `ui/src/app/app.scss` | emptied or deleted, whichever leaves no dead file |
| `ui/src/app/app.spec.ts` | keeps routing assertions only |
| `ui/src/app/app.routes.ts` | seven flat routes become a parent with children |
| `ui/e2e/` | one new browser case |

`ui/src/index.html` keeps `<app-root>`; the bootstrap does not change.
`ui/src/styles.scss` does not change: the shell's styles are component-scoped
and move with it.

## Data / contracts

No API, payload or storage contract changes. The shell keeps reading
`MACRO_DATA.vintages()` through the injection token, and keeps deriving the
strip from `envelope.data` filtered on `isLatest` rather than from
`meta.vintages`, which the live service answers as `[]` on that route.

One behaviour to hold deliberately: a parent route component is constructed once
and survives navigation between its children, so moving the read into
`ConsoleShell` must not turn one request at bootstrap into one request per tab
change. Step 1's done-when covers the rendering; `console-shell.spec.ts` asserts
both halves, the component's lifetime as node identity and the request count
directly, the latter added by step 4 after the review found step 2 had dropped
it.

## Testing

`npm test` in `ui/` is the gate and it is already 713 specs. This feature adds
no logic, so it adds no new unit test beyond the request-count assertion named
above; step 2's job is that the existing assertions survive the move rather than
that new ones appear.

`npm run test:browser` gains the single case in step 3. That is proportionate:
the done-when is "renders identically", which is a rendered-DOM claim, and the
harness already exists.

`api/` is untouched, so its suite is unaffected.

## Notes for the AI

- Move code, do not rewrite it. Every comment in `app.ts` earns its place -
  the `meta.vintages` lesson, the M2M token pill's scope, the display-order
  note - and they travel with the code they explain.
- `App` stops needing `RouterLink` and `RouterLinkActive`. Leaving them in the
  imports array is dead weight the standards call out.
- Keep the `app-root` selector. Changing it means touching `index.html` and
  `main.ts` for nothing.
- The parent route is pathless so no URL gains a segment. Every existing path,
  including the two redirects, resolves exactly as it does today.
- There is no `Verify` command in this project, so the gate is the build plus
  both `ui/` suites, per the standards' fallback.
- `blueprint/context/findings.md` carries 31 open findings, none blocking. Do
  not repair them here.

## Open questions

None. The one judgement call, deferring the auth layout to feature 19, is
recorded under Out of scope with its reasoning rather than left open, because
implementation can begin safely either way and the deferral is reversible.

## Findings
Resolved with this feature and archived from the live ledger. IDs carry the
archive prefix so they stay unique across the project history.

### 18-app-shell-split/F-38 [P2] closed - The Response card keeps describing a request the URL block no longer shows

**File:** ui/src/app/request-builder/request-builder.ts:76
**Found:** 2026-09-11 by /audit (scope: full; lens: quality)
**Why it matters:** `selectEndpoint` clears `result` and `copied`, with the
comment "the previous answer described a different request". That reasoning is
right and is applied to only half the ways a request changes: the working-query
card sits directly above on the same page, so editing an indicator, a country or
a year changes the URL, the curl and the request key while the Response card goes
on showing the previous status, its three headers and its body.

The result is two regions of one screen answering different questions with no
cue: the URL reads one query, the response beneath it answered another. On the
export card the same staleness is unreachable because the query is edited on a
different tab and the component is destroyed in between; here both live on one
screen. `copied` has the same gap — "curl copied." can outlive the curl it
described.

This is the family F-13, F-16, F-21 and F-29 belong to: an answer outliving the
question. It is the first instance where the question is editable in the same
viewport.
**Suggested fix:** clear `result` and `copied` when the request key changes, not
only when the endpoint does. An `effect` on `proxyUrl()` covers both causes in
one place, and `selectEndpoint`'s two manual resets can then go.
**Resolution:** Closed by the 2026-09-21 audit at a3ceed7. Re-examined at the
code: `request-builder.ts:103` holds one `effect` that reads `proxyUrl()` and
clears both `result` and `copied`, and `proxyUrl` at `:93` is computed from the
endpoint and the query together, so a code, country or year edit in the card
above now drops the answer exactly as an endpoint change does. `selectEndpoint`
is down to a single `set`.

The repair opened one window worth checking and the suite already closes it: an
answer arriving after the query changed would have re-seated a stale result over
a cleared card, and `request-builder.spec.ts:277` sends, mutates the query
mid-flight, then flushes, and asserts the card stays `Not sent`. Five further
cases cover the code, year and copy-confirmation paths and the claim that
re-selecting the current endpoint notifies nothing. All green in the 713-spec
run at this commit. No new defect in the file.

Fixed on 2026-09-11 as suggested. `clearOnRequestChange` reads
`proxyUrl()` and clears both signals; `selectEndpoint` is reduced to a single
`set`, its early return removed because signals compare with `Object.is` and
re-selecting the current endpoint notifies nothing.

The larger half was the window the effect opens. Without a guard the sequence is:
edit the query mid-flight, the effect clears the card, the await resolves, and the
old query's answer is written straight back into a card whose URL now shows a
different request — the same defect, re-entered through the repair. `send` now
captures `proxyUrl()` before awaiting and assigns only when it still matches, the
shape `result-state.ts` uses for `asked`.

Five specs, using `HttpTestingController` to hold a request open so that window is
real. Probed by removing the comparison, which failed exactly the late-answer case
and left the other four passing. Restored and re-run green at 658.

Not covered: F-37 and F-39, both in this file and both still open. The effect sits
next to `heldEtag`'s phantom `this.result()` dependency without touching it.

### 18-app-shell-split/F-71 [P3] closed - The Angular CLI analytics id is committed, so every clone reports usage telemetry under one shared identity

**File:** ui/angular.json:6
**Found:** 2026-09-21 by /audit independent (scope: current; lens: security)
**Why it matters:** `f9f2042` added `"analytics": "21d5f6fd-..."` to the `cli`
block of the workspace config. That is not a local preference: `cli.analytics`
in `angular.json` is the project-level switch, so it turns Angular CLI usage
reporting to Google on for anyone who runs `ng` in this repository, keyed to the
id one machine generated. The per-user equivalent lives in `~/.angular-config.json`
and is deliberately outside the repo.

Nothing sensitive leaks - the CLI reports command names, flags, builder timings
and versions - but it is an outbound-telemetry decision taken for every future
contributor and for CI, recorded nowhere except a chore commit whose message
says only that the id was pinned. It also makes the id a weak shared correlator
across whoever builds the project.

The likely motive was to stop the CLI's first-run analytics prompt blocking the
new Playwright `webServer`, which starts `ng serve` non-interactively. Setting
it to `false` solves that without opting anyone in.
**Suggested fix:** replace the id with `"analytics": false`, or drop the key and
set `NG_CLI_ANALYTICS=false` in the Playwright `webServer` env. If telemetry is
wanted, record the choice in `AGENTS.md` so it is a decision rather than an
artefact.
**Resolution:** Closed by the 2026-09-21 full audit at a3ceed7. Master had already
made the opposite call in `cda5e62`, which sets `"analytics": false` instead of
checking in the uuid, and the squash merge of the fix branch kept that side of
the conflict. `ui/angular.json:6` now reads `"analytics": false` and no uuid
remains in the file. The telemetry opt-out is the CLI behaviour the finding
asked for.

### 18-app-shell-split/F-77 [P2] closed - The parent-lifetime claim is proved by node identity, and the single-request assertion the spec asked for is still missing

**File:** ui/src/app/shell/console-shell.spec.ts:137
**Found:** 2026-09-21 by /audit (scope: current; lens: tests)
**Why it matters:** The spec's Data / contracts section names one behaviour to
hold deliberately: moving the `vintages()` read into a routed parent "must not
turn one request at bootstrap into one request per tab change", and it asks for
that to be asserted as a request count. The test that landed asserts that
`querySelector('app-console-shell')` returns the same node after four
navigations. That proves the host element is not rebuilt, which is good
evidence, but it is a proxy: it constrains the component's lifetime, not the
number of requests. A later change that moved the read into an `effect` or a
route-keyed computed would keep node identity and still fetch per tab, and this
test would stay green.

The stated reason for dropping the count - that the number "moved with which
tabs the test visited" - is true only for the tabs this test happens to visit.
`vintages()` has exactly four callers (`console-shell.ts:43`,
`overview.ts:44`, `working-query-card.ts:67`, `vintages.ts:74`), and the four
paths the loop walks (`/series`, `/observations`, `/vintages`, `/overview`) are
all callers. `/saved-queries`, `/request-builder` and `/countries-indicators`
call it from nothing, so a count is directly assertable against them.
**Suggested fix:** keep the identity assertion and add the count beside it:
mount a provider that increments a counter in `vintages()`, read the counter
after the initial render, navigate `/saved-queries` -> `/request-builder` ->
`/saved-queries`, and assert the counter is unchanged. That is the claim the
spec wrote down, and it is three lines.
**Resolution:** Repaired as build step 4. `console-shell.spec.ts` now mounts at
`/saved-queries` with a counting provider, asserts one `vintages()` call, walks
`/countries-indicators` and back twice, and asserts the count is still one. The
node-identity case stays beside it: the two claims are different, as the finding
says. One correction to the finding's detail: `/request-builder` is not a third
non-calling tab, because it hosts the working query card, which calls
`vintages()`. `/saved-queries` and `/countries-indicators` are the only two, and
they are sufficient. 716 specs green. Marked `fixed`; a review has not looked at
it yet.

Re-examined 2026-09-21 by the independent review at `7db51ce`, on its own
evidence. The original defect is gone: `console-shell.spec.ts:158` counts
`vintages()` through a provider subclass, mounts at `/saved-queries`, asserts
one call, then walks `/countries-indicators` -> `/saved-queries` ->
`/countries-indicators` and asserts the count is still one. That is a direct
request count, not a proxy: an `effect` or route-keyed read would increment it
while node identity stayed put, which is exactly the hole the finding named.

The builder's correction is right and the two tabs are the right two.
`vintages()` has four callers - `console-shell.ts:43`, `overview.ts:44`,
`working-query-card.ts:67` and `vintages.ts:74` - and the card is mounted by
`observations.html:1`, `series.html:1` and `request-builder.html:1`, so
`/request-builder` is a caller and only `/saved-queries` and
`/countries-indicators` are not.

The repair introduced nothing new: the node-identity case is untouched beside
it, every `it` that existed at `b8ffb15` still exists across the two spec files
(23 before, 26 after; 44 `expect` calls before, 51 after), and `npm test` is
716 green. Confirmed independently in a real browser against the dev server at
1440x900 with `/api/macro/**` stubbed: exactly one `/api/macro/vintages`
request after load plus three tab clicks, one `app-console-shell` node, seven
tabs, no console errors.

## Independent review

**Status:** passed
**Target commit:** 7db51ceb4291c6955fbdb230b11ef0684bf07c96
**Base commit:** b8ffb151cf1efb0de46a13c564b742a421b5b761
**Base ref:** master
**Spec hash:** 63b8279a14944d6a9febd9b95473a5ca924e03dc70ff2421fe4d3d87cd75a0f8
**Prepared by:** claude
**Builder model:** claude-opus-5[1m]
**Requested reviewer:** claude
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-09-21T11:12:45Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5[1m]
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-09-21T11:18:15Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

### Commands

- `git rev-parse HEAD` / `git merge-base master <target>` / `sha256sum blueprint/context/current-feature.md` / `git status --porcelain`: pass (target, base, spec hash and clean-tree preconditions all match)
- `npm test` in `ui/` (Karma, headless Chrome): pass, 716 of 716
- `npx ng build --configuration development` in `ui/`: pass
- `npm run test:browser` in `ui/` (Playwright, Chromium): pass, 7 of 7 including the new `console-shell.spec.ts` case
- `npm run typecheck` in `api/`: pass
- `npm test` in `api/` (Vitest): pass, 67 of 67
- lint: unavailable, no lint command is configured in either package
- Verify: unavailable, no Verify command exists in this project

### Evidence

- The move is verbatim, not a rewrite. `app.html` and `app.scss` are pure renames under `ui/src/app/shell/` with zero content delta, and `app.ts`'s removed body differs from `console-shell.ts` only by the selector, the two template paths, the class name and the `./core` -> `../core` import depth. Every comment the spec asked to travel with the code is present.
- `ui/src/app/app.ts` is reduced to an inline `<router-outlet />` with `RouterLink` and `RouterLinkActive` dropped from imports, as the spec required. No `app.html` or `app.scss` remains, so the split left no dead file.
- `ui/src/app/app.routes.ts` nests the seven tabs under one pathless `path: ''` parent carrying `component: ConsoleShell`, keeping the `''` -> `overview` redirect inside the children and the `**` redirect as a sibling. Both redirects and all seven top-level paths are asserted in `app.spec.ts`, and Playwright confirms a deep link to `/vintages` keeps that exact pathname.
- No assertion was lost in the spec split. At `b8ffb15` `app.spec.ts` held 23 `it` blocks and 44 `expect` calls; at HEAD `app.spec.ts` plus `shell/console-shell.spec.ts` hold all 23 of those names plus three new ones, and 51 `expect` calls.
- Performance, confirmed at runtime rather than only in a unit test: against the dev server at 1440x900 with `/api/macro/**` stubbed, a load of `/saved-queries` followed by three tab clicks issued exactly one `/api/macro/vintages` request, kept one `app-console-shell` node and seven tabs, and logged no console errors. The extra `countries` / `indicators` requests seen in that trace are the pre-existing, out-of-scope F-65.
- The "nothing visible changes" claim holds under measurement. The one structural risk in a chrome move is the sticky-footer rule: `:host { min-height: 100% }` now sits on `app-console-shell` rather than on `app-root`. Measured at HEAD, `app-root` is `display: inline`, so it establishes no containing block and the percentage still resolves against the `height: 100%` body: shell height 900px and footer bottom edge 900px in a 900px viewport on `/vintages` and `/countries-indicators`. No regression today; the fragility is already tracked as F-78.
- Security: the delta adds no route guard, input path, trust boundary, secret or dependency. The only new runtime surface is a component move; the only new network stub is test-only (`ui/e2e/stub-api.ts`, already in place).

### Findings

- F-77 [P2] moved from `fixed` to `closed`. Re-examined on independent evidence: the repair at `console-shell.spec.ts:158` is a direct `vintages()` request count, not a proxy, so the original hole (an `effect` or route-keyed read that preserves node identity while refetching per tab) is genuinely closed. The two tabs the test walks are the right two - `vintages()` has four callers and the working query card is mounted on observations, series and the request builder, so `/saved-queries` and `/countries-indicators` are the only non-callers and the builder's correction of the earlier review is correct. The node-identity case survives beside it and no assertion was displaced.
- No new findings. All four lenses covered the complete `b8ffb15..7db51ce` delta.

### Remaining risk

- No lint command is configured in either package, so no static style or correctness linting ran.
- No Verify command exists, so the gate was the build plus both `ui/` suites plus the `api/` suites, per the spec's stated fallback.
- Step 3's done-when says the new browser case "fails if the parent route is removed". That was not independently reproduced, because doing so would require editing product code, which a reviewer may not do. The case does assert the topbar wordmark, so the claim is sound by inspection rather than by execution.
- F-78 (P3, open) remains: the full-height contract survives only because `App` declares no styles. Nothing in either suite asserts the footer's position, so giving `app-root` a `display: block` or a height later would move the footer silently. Not blocking.
- F-79 (P3, open) remains: build-plan line 18 asked for two parents and an auth layout, one parent landed, and the deferral is recorded only in a `current-feature.md` that `/complete` archives. A traceability gap, not an engineering one. Not blocking.
- Beyond F-78 and F-79, 31 further findings carried forward from earlier work remain `open` (9 P2, 22 P3) plus one `unverified`. All are untouched by this delta and none is P0 or P1, so none blocks `/complete`.
- Adapter, model and fresh-context identity in this receipt are declared metadata. The target commit, base and spec hash were verified; reviewer identity cannot be cryptographically proven.
