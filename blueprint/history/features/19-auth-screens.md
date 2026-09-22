# Feature: Auth screens

**From build-plan:** feature 19

> **Generated file.** Holds the one feature, fix, or rollback being built right now.

**Type:** Feature
**Status:** verified
**Branch:** feature/auth-screens

## Goal

The four designed authentication screens, built against a typed auth provider
seam backed by fixtures, plus the guard that sends a visitor with no session to
sign-in. This is the same bet feature 1 made for macro data: build the screens
and the seam now, swap the fixture for the real service in feature 14 without
rewriting a consumer.

Nothing here authenticates anybody. There is no Supabase, no email, no password
hashing and no token verification, and `api/src/middleware/auth.ts` stays the
no-op seam it is today. The guard is a client-side routing convenience, not a
security boundary, and the code says so as well as this spec.

## Design reference

`macro-data-explorer-standalone (2).html`, the Cyte Risk Suite export supplied
on 2026-09-21. It is not in this repository, which is finding F-49 and the
reason the last fidelity pass found fourteen differences nobody could have
caught from here. Step 1 fixes that for this feature by capturing the four
screens as PNGs into `blueprint/references/`, matching the existing convention
of one numbered PNG per screen.

Observed from the export at 1440px, and binding for this feature:

- One split layout for all four screens. Navy panel on the left carrying the
  wordmark, a hero line, a paragraph, and a footer with the invitation-only note
  and the source attribution. White panel on the right carrying the form.
- The same tokens the console already uses: `#0b188f`, `#3faa24`, Source Sans
  Pro at 500/16, 48px controls, square corners.

| Screen | Heading | Fields | Primary action |
| --- | --- | --- | --- |
| Sign in | Sign in | Email address, Password | SIGN IN |
| Reset password | Reset your password | Email address | SEND RESET LINK |
| Accept invitation | Accept your invitation | Full name, Password | ACCEPT INVITATION |
| Expired invitation | This invitation is no longer valid | none | BACK TO SIGN IN |

## In scope

- `AuthLayout`, the split-panel shell, as a second top-level route parent beside
  `ConsoleShell`. Feature 18 made this possible and deliberately left it out.
- Routes `/sign-in`, `/reset-password` and `/accept-invite/:token`.
- An `AUTH` injection token and `FixtureAuthProvider`, mirroring how
  `MACRO_DATA` and `FixtureMacroDataProvider` are shaped and chosen in
  `app.config.ts`.
- A session store persisted to `localStorage`, matching how the working query
  and saved queries already persist.
- A route guard on the console tree that sends a visitor with no session to
  `/sign-in`, preserving the attempted URL and returning to it after sign-in.
- Every state each screen needs: idle, submitting, field-invalid, denied, and
  unexpected error; plus loading, valid, expired, revoked and unknown for the
  invitation token.
- Live password-rule feedback: at least 12 characters, one number and one
  symbol, upper and lower case, each shown met or unmet as the user types.

## Out of scope

- **The set-new-password screen.** The export draws only the request-a-link half
  of reset. The screen that consumes the emailed link is structurally the
  accept-invitation form without the invitation panel, and the plan line for 19
  already records that it needs a design review first. Requesting a link ends at
  the confirmation state.
- **Sign-out.** The export has no design for it, and the console's only candidate
  slot, the topbar token pill, currently reports the server-side M2M client
  rather than a visitor. See Open questions.
- Supabase, email delivery, password hashing, token verification, rate limiting
  and account lockout. None of it is designed here and none of it is real until
  feature 14.
- Any `api/` change. `authSeam` stays a no-op.
- The Administration page. Feature 20, and it has no design yet.
- Per-user saved queries. Feature 16.

## Build loop

`workflow.stepReview` is `feature`, so the six steps below are built in order
and reviewed as one packet at the end. `workflow.checkpointCommits` is
`disabled`, so no commits happen during the steps; `/complete` makes the single
feature commit.

## Build steps

- [x] **1. Commit the design reference.** Capture the four screens from the
      export at 1440px wide and save them as
      `blueprint/references/8-sign-in.png`, `9-reset-password.png`,
      `10-accept-invitation.png` and `11-expired-invitation.png`. The export's
      own prototype-screen switcher is scaffolding and must not appear in the
      captures; hide it before capturing or crop it out.
      *Done when:* the four PNGs exist, each shows one screen at 1440px with no
      switcher, and this spec's Design reference table matches what they show.

- [x] **2. The seam, the session and the rules.** Add
      `ui/src/app/core/auth.provider.ts` with an `AUTH` `InjectionToken` and an
      `AuthProvider` interface of observables: `signIn(email, password)`,
      `requestPasswordReset(email)`, `invitation(token)` and
      `acceptInvitation(token, fullName, password)`. Add
      `ui/src/app/core/fixtures/fixture-auth.provider.ts` implementing it, and
      `ui/src/app/core/session.store.ts` holding the current session in a signal
      persisted to `localStorage`. Add `ui/src/app/core/password-rules.ts` as a
      pure function returning which of the rules a candidate meets. Choose
      `AUTH` in `app.config.ts` the way `MACRO_DATA` is chosen. No UI yet.
      *Done when:* focused unit tests cover each password rule including its
      boundaries, the session store's round trip and its behaviour on corrupt
      stored JSON, and each fixture outcome the screens depend on; and
      `npm test` is green in `ui/`.

- [x] **3. The layout, the guard and sign-in.** Add
      `ui/src/app/auth/auth-layout.{ts,html,scss}` as a second top-level route
      parent, and `ui/src/app/auth/sign-in.{ts,html,scss}` as its first child at
      `/sign-in`. Add the guard on the console parent. The fixture provider
      starts with a signed-in session so the seven console tabs stay reachable
      in development and in every existing spec without each one stubbing one.
      *Done when:* `/sign-in` renders the split layout; a submit with the
      fixture's known-bad credentials shows a denied message announced to
      assistive technology without clearing the email; a submit with good
      credentials lands on `/overview`; visiting `/vintages` with the session
      cleared redirects to `/sign-in` and signing in returns to `/vintages`, not
      to `/overview`; and `npm test` is green.
      *Built, with one deviation.* The spec said the fixture provider would
      start signed in so the existing specs kept passing untouched. It cannot:
      the guard reads `SessionStore`, which reads `localStorage`, and the auth
      provider never enters that path. Seeding the store from the provider would
      also have meant the guard was never exercised by the suite that covers it.
      Instead `core/fixtures/signed-in-session.ts` offers `provideSignedInSession()`
      and `provideNoSession()`, and the two routed spec files and the browser
      specs say which one they want. The intent is visible per spec rather than
      inherited, and the signed-out path is now genuinely under test.

      A second, smaller one: the root `''` redirect moved out of the console
      children and above both layout parents. Two pathless parents cannot both
      answer for the bare path, and with the redirect still inside the console
      tree `/` resolved to the auth layout with no child and stopped there.

- [x] **4. Request a password reset.** Add
      `ui/src/app/auth/reset-password.{ts,html,scss}` at `/reset-password`,
      reached from the sign-in form's "Forgot password?" link.
      *Done when:* submitting an address replaces the form with the confirmation
      state in place, the confirmation states the 60 minute validity the export
      names, an unexpected failure shows the error state rather than a false
      confirmation, and "Back to sign in" returns to `/sign-in`.

- [x] **5. Accept an invitation, and its dead ends.** Add
      `ui/src/app/auth/accept-invitation.{ts,html,scss}` at
      `/accept-invite/:token`, showing the invited address, organisation, role
      and inviter, then full name and password with live rule feedback. The
      token resolves to one of five outcomes: loading, valid, expired, revoked
      or unknown. Expired renders the export's dead-end screen naming the send
      and expiry dates from the invitation record; revoked and unknown reuse
      that screen with their own sentence.
      *Done when:* each of the five outcomes is reachable from a fixture token
      and renders its own state; the submit button is disabled until every
      password rule passes and a name is present; accepting lands on `/overview`
      signed in; and `npm test` is green.

- [x] **6. Browser coverage, including the regression feature 18 left open.**
      Add cases to `ui/e2e/`: the split layout renders at 1440px with the navy
      panel and the form side by side, the guard redirects a signed-out deep
      link to `/sign-in`, and the console's attribution footer still sits at the
      bottom of the viewport on a short page. The last one is finding F-78: the
      console's full-height rule survives only because `app-root` declares no
      styles, and this feature is the first to add a sibling layout that could
      change that.
      *Done when:* `npm run test:browser` passes in `ui/` with the new cases,
      and the footer case fails if the console layout's height chain is broken.
      *Built:* 11 browser specs, up from 7. The three existing console specs
      needed the session seeding too, through `signIn()` in `stub-api.ts`.

- [x] **7. Repair what the review found.** The independent review at `c660a68`
      requested changes over F-80: the expired screen's action was an inline
      text link where `11-expired-invitation.png` draws a full-width outlined
      green button, and the Design reference table above had already called that
      out as the primary action. The same screen put the reason in plain grey
      copy where the reference uses an error surface (F-81). Both came from
      building that screen off the export's text rather than off the captured
      PNG, which is the exact failure step 1 exists to prevent.
      *Done when:* the dead-end screen matches the capture, the four other
      findings the review raised are repaired, and both suites are green.
      *Built:* the reason now renders on `--cl-error-background-color`, a token
      declared at the port and never read until now, and the action is a 391px
      48px `.btn.outline-green`, both measured against the PNG. F-82 gave the
      three subscriptions `takeUntilDestroyed`, which matters when feature 14
      puts HTTP behind `AUTH`. F-83 made `safeReturnUrl` reject a backslash
      authority itself rather than relying on the router's wildcard to absorb
      it. F-85 made the browser suite import `SESSION_KEY` and `FIXTURE_SESSION`
      instead of copying them. F-84 is the Fidelity note corrected above.

## Files / areas

| Path | Change |
| --- | --- |
| `blueprint/references/8..11-*.png` | new, the four captured screens |
| `ui/src/app/core/auth.provider.ts` | new, `AUTH` token and interface |
| `ui/src/app/core/fixtures/fixture-auth.provider.ts` | new |
| `ui/src/app/core/session.store.ts` | new, signal plus `localStorage` |
| `ui/src/app/core/password-rules.ts` | new, pure |
| `ui/src/app/auth/auth-layout.{ts,html,scss}` | new, split panel |
| `ui/src/app/auth/sign-in.{ts,html,scss}` | new |
| `ui/src/app/auth/reset-password.{ts,html,scss}` | new |
| `ui/src/app/auth/accept-invitation.{ts,html,scss}` | new |
| `ui/src/app/auth/session.guard.ts` | new |
| `ui/src/app/app.routes.ts` | second parent, guard on the console parent |
| `ui/src/app/app.config.ts` | provide `AUTH` |
| `ui/e2e/` | layout, guard and footer cases |

`ui/src/styles.scss` gains nothing new unless the export needs a token the
console lacks; the split panel is component-scoped. `api/` is untouched.

## Data / contracts

**Session.** `{ email, fullName, organisation, role }`, persisted under one
`localStorage` key. No token, because there is no token to hold: the fixture
authenticates nothing. Corrupt or unparseable stored JSON is treated as no
session, never as a crash, the same rule `saved-query.store.ts` already applies.

**Invitation.** `{ token, email, organisation, role, invitedBy, sentAt,
expiresAt, status }` where status is one of `valid`, `expired`, `revoked`. A
token the fixture does not know resolves to `unknown` rather than an error, so a
mistyped link is a dead end rather than a failure. The expired screen renders
`sentAt` and `expiresAt` as dates, which is why they are fields and not a
boolean. Seven days between them is the export's stated rule and the fixture
honours it.

**Password rules.** At least 12 characters, at least one digit, at least one
character that is neither a letter nor a digit, and at least one upper and one
lower case letter. The function returns every result on every call so the UI can
show each rule's state rather than one pass or fail.

**The guard.** Redirects to `/sign-in` and carries the attempted URL in the
`returnUrl` query parameter. Sign-in returns there only when it is a relative
path beginning with a single `/`, and to `/overview` otherwise, so the parameter
cannot bounce a visitor to another origin.

**What this is not.** Everything above lives in the browser. A guard that reads
a `localStorage` flag stops no one, and the API is still open, exactly as
`project-overview.md` records as an accepted gap until feature 14. Each new file
that could be mistaken for a security control says so in a comment.

## Testing

`npm test` in `ui/` is the gate and it currently holds 716 specs. The logic this
feature adds is genuinely testable and in scope under the standards' rule:
`password-rules.ts` is pure with real boundaries, `session.store.ts` has a
corrupt-input path, and the guard has a redirect decision with a `returnUrl`
rule that can be attacked. All three get focused tests.

The components ride on rendering assertions in the same style as
`console-shell.spec.ts`, mounting through the router so the route tree is
exercised.

`npm run test:browser` gains the three cases in step 6. The split layout and the
footer are rendered-geometry claims, which is what the harness exists for.

## Notes for the AI

- Reuse the existing primitives: `.card`, `.field`, `.btn.primary`, `.search`
  and the `.ms-icon` ligature span. The export's controls are the console's
  controls, so a new button style is a sign of drift, not of a new screen.
- The console chrome must not appear on an auth route, and the auth layout must
  not appear on a console route. That is the whole point of feature 18.
- Never log, echo or persist a password, including in an error path.
- The fixture starts signed in. Every existing spec navigates without a session
  today, and the guard must not turn them all red.
- Announce denied and error states with `role="status"` the way the console's
  other error slots do, and associate each field with its label and its message.
- `blueprint/context/findings.md` carries 34 open findings, none blocking. F-78
  is the only one this feature touches, through step 6.

## Fidelity notes

Two differences from the captured reference, both deliberate.

**The heading sits about 15px higher.** Corrected after the independent review
measured it: the first version of this note claimed the opposite, and blamed
scaffolding hidden during capture. Both were wrong. The built form column and
the reference's equivalent block are each centred on the same midline; the
build's column is roughly 28px taller because the live region under the fields
is reserved whether or not it has text, so its heading starts higher.

**The fields start empty.** The reference shows a filled-in address and password
because it is a static mockup.

Everything measured off the export is matched: the 960/480 split, the navy panel
inset at 52/56, the hero at 32/800 on 40, the body and footer in
`--cl-primary-100`, the 391px form column, 50px inputs with a 5px radius, and
the 48px filled action. The 5px is local to these screens on purpose: the
console is square because the export renders it square, and the export's own
auth inputs are not.

## Open questions

**How does a signed-in visitor sign out?** The export has no design for it. The
guard makes the signed-out state reachable only by clearing `localStorage` by
hand, which is fine for a fixture but is not a product answer, and this is the
feature that introduces the state.

The narrow options are a control in the topbar beside the token pill, which
means deciding what that pill reports once a visitor has a session of their own,
or leaving sign-out to feature 14 with the real session. My recommendation is
the second: the pill's meaning changes when sessions become real, and deciding
it twice is worse than deciding it late.

Implementation can begin either way. Step 3 is the first step that would carry a
sign-out control, so an answer is only needed before the review packet.

## Findings
Resolved with this feature and archived from the live ledger. IDs carry the
archive prefix so they stay unique across the project history.

### 19-auth-screens/F-78 [P3] closed - The shell's full-height rule now resolves through an unstyled app-root, and nothing holds that in place

**File:** ui/src/app/shell/console-shell.scss:1
**Found:** 2026-09-21 by /audit (scope: current; lens: quality)
**Why it matters:** `:host { display: flex; flex-direction: column;
min-height: 100% }` with `.app-main { flex: 1 0 auto }` is the sticky-footer
mechanism: on a short page the attribution footer sits at the bottom of the
viewport rather than under the content. Before this change that host was
`app-root`, a direct child of a `body` that `styles.scss:255` gives
`height: 100%`. It is now `app-console-shell`, nested one level deeper inside
`app-root`.

Measured at HEAD against the dev server at 1440x900 on a `/vintages` page with
an empty result, the shell still computes to 900px and the footer's bottom edge
is at 900px, so there is no regression today. It survives only because `App`
declares no styles, leaving `app-root` at `display: inline`, which means it
establishes no containing block and the percentage still resolves against
`body`. The day anyone gives `app-root` a `display: block` or a height, the
percentage starts resolving against an auto-height box and the footer rides up.
No unit spec or browser case asserts the footer's position, so that regression
would ship silently. The new browser case checks the footer is visible, not
where it is.
**Suggested fix:** either move the full-height contract somewhere it cannot be
broken from outside - `app-root { display: contents }` in `styles.scss`, or
`min-height: 100dvh` on the shell host instead of a percentage - or add one
assertion to `ui/e2e/console-shell.spec.ts` that the footer's bottom edge is at
the viewport bottom on a short page.
**Resolution:** Closed 2026-09-21 by /audit independent (scope: current). The
finding offered two remedies; feature 19 took the second. `ui/e2e/auth.spec.ts:65`
now asserts the footer's own geometry on a short `/vintages` page at 1440x900:
`scrollHeight <= 901` and the footer's bottom edge at or below 880. Re-derived
here - `npm run test:browser` passes 11 of 11 at this checkpoint, and the
assertion is load-bearing rather than decorative: if `app-root` ever gains a
`display`/height that makes `min-height: 100%` resolve against an auto-height
box, the shell collapses to content height and the footer's bottom edge lands
far above 880. The underlying percentage chain is unchanged and still indirect,
which is the accepted half of the original fix menu; what is repaired is the
silent-regression risk the finding actually gated on.

### 19-auth-screens/F-80 [P1] closed - The expired-invitation screen's primary action is a text link, not the button the spec table and the reference both specify

**File:** ui/src/app/auth/accept-invitation.html:62
**Found:** 2026-09-21 by /audit independent (scope: current; lens: quality)
**Why it matters:** The spec's Design reference table is declared "binding for
this feature" and gives the Expired invitation row a Primary action of
BACK TO SIGN IN. `blueprint/references/11-expired-invitation.png` draws it as a
full-width control the width of the 391px form column, roughly 48px tall, white
fill with a thin green border and an uppercase green label. The build renders
`<a class="back" routerLink="/sign-in">Back to sign in</a>`: an inline,
sentence-case text link about 88px wide.

The distinction is deliberate in the export, not an artefact of the capture.
`9-reset-password.png` shows the same words as a small navy text link in exactly
the style the build used, on a screen whose primary action is the green SEND
RESET LINK button. The expired screen has no other action at all, so the export
promotes its only way out to a button; the build demotes it to the styling the
export reserves for a secondary escape hatch. Measured against the running app
at 1440x1000 on `/accept-invite/expired-token`, this is the largest visual
difference between any of the four built screens and its reference.

The Fidelity notes declare two deliberate differences, the column offset and the
empty fields. This is not one of them, so it is recorded nowhere: it reads as an
oversight rather than a decision, and `/complete` would archive a spec whose own
binding table the code does not satisfy.
**Suggested fix:** render the dead end's action as a full-width outline button in
`accept-invitation.scss`, reusing the `.auth-submit` box model with a transparent
fill, an accent border and accent-link text, and keep it an
`<a routerLink="/sign-in">`. Roughly a dozen lines, no template logic change. If
the text link is the intended call after all, say so under Fidelity notes and
change the spec's Design reference row, so the table and the build agree either
way.
**Resolution:** The action is now `a.btn.outline-green.wide`, measured at 391x48 with the green border and ink the capture shows. The finding is right about the cause: that screen was built from the export text rather than from `11-expired-invitation.png`. Marked `fixed`; a review has not looked at it yet. **Re-reviewed 2026-09-21 by /audit independent at `bb371bc`:** closed. Rendered `/accept-invite/expired-token` at 1440x1000 and measured the action at x 1005, y 588, 391x48, border `rgb(63,170,36)`, ink `rgb(49,154,27)`, label uppercase and centred; `11-expired-invitation.png` draws the same box at x 1005, y 578, 391x48. The template is `a.btn.outline-green.wide` and still a `routerLink`, so the reference primitive is reused rather than a new button style. No new defect in the file.

### 19-auth-screens/F-81 [P2] closed - The expired screen's reason sentence lost the reference's alert panel, and the token for it is already declared

**File:** ui/src/app/auth/accept-invitation.html:57
**Found:** 2026-09-21 by /audit independent (scope: current; lens: quality)
**Why it matters:** `11-expired-invitation.png` renders the "Invitations expire
seven days after they are sent..." sentence inside a full-width panel: pale pink
fill, red body text, padded, sitting directly under the heading. The build
renders it as `<p class="sub">`, which is `var(--muted)` grey body copy
indistinguishable from the explanatory paragraph two lines below it. On the built
screen the reason the visitor is stuck and the advice about what to do next carry
the same weight, so nothing marks which one is the error.

`styles.scss:55` already declares `--cl-error-background-color: #ffe0e0`, which is
the reference's fill, and `--change-down` is already the error text colour this
feature uses for `.problem`. The token pair exists and nothing reads the
background one, so this is a missed use of the design system rather than a new
style decision. Like F-80 it is undeclared in the Fidelity notes.
**Suggested fix:** in `accept-invitation.scss`, give the dead-end `.sub` an alert
treatment - `background: var(--cl-error-background-color)`,
`color: var(--change-down)`, `padding: var(--space-4)` and the same 5px radius as
the sibling `.invite` panel - scoped to the dead-end branch so the valid screen's
own `.sub` is untouched. Keep `role="status"`.
**Resolution:** The reason renders on `--cl-error-background-color` with `--cl-error-color` ink, measured at `#ffe0e0` on `#d20101`. The token was declared at the port and read by nothing until now. Marked `fixed`; a review has not looked at it yet. **Re-reviewed 2026-09-21 by /audit independent at `bb371bc`:** closed. The reason now renders in `.alert` with `role="status"`, measured at 391px wide from y 412 to 508 against the reference band y 420 to 507. Fill is `#ffe0e0` on `#d20101` from the declared tokens; the capture's own fill samples as `#f8d7da` on `#721c24`, a difference of a few RGB steps that is invisible at this size and is the price of using the token set rather than pinning a hex. Not worth a new entry.

### 19-auth-screens/F-82 [P2] closed - The three auth components are the only bare subscribe calls in the app, and none of them tears down

**File:** ui/src/app/auth/accept-invitation.ts:82
**Found:** 2026-09-21 by /audit independent (scope: current; lens: quality)
**Why it matters:** Every other observable consumer in `ui/src/app` reads its
provider through `toSignal`: `overview.ts:40`, `series.ts:79`, `vintages.ts:73`,
`countries-indicators.ts:91`, `working-query-card.ts:63`, `console-shell.ts:42`
and `result-state.ts:103`. Those unsubscribe with the injection context for free.
`accept-invitation.ts:82`, `sign-in.ts:61` and `reset-password.ts:50` are the only
three `.subscribe(` call sites in non-spec source, and none of them takes
`takeUntilDestroyed` or holds a `Subscription`.

Nothing misbehaves today, because `FixtureAuthProvider` answers with `of(...)`,
which completes before `subscribe` returns. The cost lands in feature 14, which is
the entire reason this seam exists: once `AUTH` is an HTTP provider,
`accept-invitation.ts:82` starts a request in the constructor that is never
cancelled, so a visitor who leaves `/accept-invite/:token` mid-flight keeps the
request open and resolves it into a destroyed component's signals. Swapping the
provider is meant to be a one-line change in `app.config.ts`; a teardown audit of
three hand-rolled subscriptions is not part of that line, and it is the kind of
thing that gets found afterwards rather than then.
**Suggested fix:** wrap each source in `takeUntilDestroyed()` from
`@angular/core/rxjs-interop` - available directly in the constructor for the
invitation load, and with an injected `DestroyRef` for the two submit handlers.
Three one-line changes. The submit flows do genuinely want `subscribe` rather
than `toSignal`, since they are commands rather than reads, so the pattern to
match here is teardown, not the reactive read.
**Resolution:** All three subscriptions carry `takeUntilDestroyed`, two with an explicit `DestroyRef` because they run from a handler rather than an injection context. Marked `fixed`; a review has not looked at it yet. **Re-reviewed 2026-09-21 by /audit independent at `bb371bc`:** closed. `accept-invitation.ts:84` takes `takeUntilDestroyed()` in the injection context, and `sign-in.ts:64` and `accept-invitation.ts:116` and `reset-password.ts:53` take it with an injected `DestroyRef`. Those are the only `.subscribe(` sites in non-spec source. No new defect.

### 19-auth-screens/F-83 [P3] closed - safeReturnUrl lets a backslash authority through; only the wildcard route stops it, and the comment claims otherwise

**File:** ui/src/app/auth/session.guard.ts:39
**Found:** 2026-09-21 by /audit independent (scope: current; lens: security)
**Why it matters:** The test is `candidate.startsWith('/') && !candidate.startsWith('//')`,
and the doc comment above it states that only a path on this origin is allowed
through. That is not quite what the code does. Under the WHATWG URL parser a
backslash is a slash for a special scheme, so a candidate of slash-backslash
followed by a host resolves to that host exactly as `//evil.test` does, and
`safeReturnUrl` returns it unchanged.

Verified against the running app at HEAD: signing in from
`/sign-in?returnUrl=%2F%5Cevil.test` lands on `/overview`, as do the raw
backslash form and `//evil.test`. So there is no open redirect today and this is
not a live defect. The reason sits downstream of this function: `navigateByUrl`
hands the string to `DefaultUrlSerializer`, which treats the backslash as an
ordinary segment character, nothing matches, and the `**` redirect at
`app.routes.ts:50` sends the visitor to Overview.

The risk is that the protection lives somewhere other than where the comment says
it does. Two ordinary future changes remove it: replacing the `**` redirect with a
real 404 page, which `project-overview.md` puts outside MVP scope rather than
never; or a second caller handing this function's output to `location.assign`,
`window.open` or an `href`, all of which resolve the backslash the way the URL
parser does rather than the way the router does. The spec's Data / contracts
section promises that "the parameter cannot bounce a visitor to another origin",
and that is a promise about this function.
**Suggested fix:** reject a backslash anywhere in the candidate alongside the
existing double-slash test, and add the two backslash forms, raw and
percent-encoded, to the hostile list already in `sign-in.spec.ts:164`. One
predicate and two strings, after which the guarantee holds in the function rather
than two layers away.
**Resolution:** The second character is now tested for a backslash as well as a slash, so the guarantee is in the function the contract names. `sign-in.spec.ts` covers the two backslash forms alongside the protocol-relative one. Marked `fixed`; a review has not looked at it yet. **Re-reviewed 2026-09-21 by /audit independent at `bb371bc`:** closed for the backslash. `session.guard.ts:43` rejects both `/` and `\` in the second position, and `sign-in.spec.ts:164` covers `/\evil.test` and `/\\evil.test` alongside the protocol-relative and absolute forms; the percent-encoded form the original fix note mentioned is the same string after the router decodes it, so the decoded test is the right one. The test is sufficient for the defect it was written for. It is not sufficient for the guarantee the comment states, which is a separate gap recorded as F-86; the original defect is gone and the repair introduced no new one.

### 19-auth-screens/F-84 [P3] closed - The Fidelity note describes a form-column offset that measurement contradicts, in the wrong direction

**File:** blueprint/context/current-feature.md (Fidelity notes)
**Found:** 2026-09-21 by /audit independent (scope: current; lens: quality)
**Why it matters:** The note reads: "The reference centres the form including its
prototype-screen switcher; step 1 hid that scaffolding before capturing, so the
captured PNG is centred around content that is no longer there. The build centres
what the screen actually contains, which puts the heading about 50px lower than
the PNG shows."

Measured at 1440x1000, the viewport the PNGs were captured at, the built sign-in
`.form-column` is `y: 310.8, height: 378.4`, so its midline is 500.0, the exact
centre of the window. In `8-sign-in.png` the equivalent block runs from the "Sign
in" heading to the end of the self-registration note, about y 326 to 676, also
centred on 500. Both are centred on the same line, so the described cause does not
exist: the capture is not centred around removed scaffolding. The build's heading
is about 15px higher than the PNG's, not 50px lower, and the reason is that its
column is roughly 28px taller - chiefly the reserved `.problem` live region at
`auth-form.scss:184`, which the static mockup has no equivalent for.

This matters because `/complete` archives this file as the feature's permanent
fidelity record. A later fidelity pass reading "about 50px lower" will look for a
discrepancy in the wrong direction and either chase it or decide the reference is
unusable. F-49 already records that the export itself is not in the repository, so
these notes and the four PNGs are the whole of the evidence.
**Suggested fix:** replace the paragraph with the measured version: the built
column is centred on the same midline as the reference and sits about 15px higher
because the reserved error region makes it about 28px taller. Text only, no code
change.
**Resolution:** The Fidelity note is rewritten to what the reviewer measured: the heading sits about 15px higher, not 50px lower, because the reserved live region makes the column taller. Both halves of the original claim were wrong. Marked `fixed`; a review has not looked at it yet. **Re-reviewed 2026-09-21 by /audit independent at `bb371bc`:** closed, verified by measurement rather than by reading. At 1440x1000 the built sign-in's right-panel ink runs y 317 to 686 and `8-sign-in.png`'s runs y 331 to 675, so the midlines are 501.5 and 503: the same line, as the corrected note says. The heading band starts 14px higher in the build (317 against 331) against a stated "about 15px", and the ink column is 25px taller against a stated "roughly 28px". Both halves of the corrected claim hold.

### 19-auth-screens/F-85 [P3] closed - The browser suite hardcodes the session key and shape that session.store.ts owns

**File:** ui/e2e/stub-api.ts:120
**Found:** 2026-09-21 by /audit independent (scope: current; lens: tests)
**Why it matters:** `signIn()` writes the literal string `cyte.macro.session.v1`
and a literal four-field session object into `localStorage` through an init
script. Both are already exported: `SESSION_KEY` at `session.store.ts:9` and
`FIXTURE_SESSION` at `fixture-auth.provider.ts:16`. The unit-test seam does import
them - `signed-in-session.ts:3` builds its in-memory storage from exactly those
two exports - so the browser suite is the only place the values are copied.

The key's own comment says it is "versioned so feature 14 can recognise what it is
replacing", which is a stated intention to change it. When it changes, four
browser specs stop seeding a session, the guard redirects each of them to
`/sign-in`, and they fail on a missing `.topbar`, a missing `.tabs` or a missing
`.attribution` rather than on anything to do with the session. Three of the four
are pre-existing specs about chart geometry and paging that have no business
failing for an auth reason.
**Suggested fix:** import `SESSION_KEY` and `FIXTURE_SESSION` in `stub-api.ts` and
pass them into the init script through `addInitScript`'s argument parameter, since
the callback body runs in the page and cannot close over module scope. `ui/e2e`
already type-checks against the app sources, so no config change is needed.
**Resolution:** Imports `SESSION_KEY` and `FIXTURE_SESSION` and passes them into the init script, so a key change moves the browser suite with it. Marked `fixed`; a review has not looked at it yet. **Re-reviewed 2026-09-21 by /audit independent at `bb371bc`:** closed. `stub-api.ts:4-6` imports `FIXTURE_SESSION` and `SESSION_KEY` and passes both into `addInitScript`; no literal key or session shape remains in `ui/e2e`. The 11 browser specs pass.

## Independent review

**Status:** passed
**Target commit:** bb371bc0ac8487135f44260fb8997bfc590f08ec
**Base commit:** 5928ba0f934619c993a5ff62c160ce3fab24572d
**Base ref:** master
**Spec hash:** 377e909ef64ddf337ac413193111bef1700a6fe0576711226b4859be8eeedc4b
**Prepared by:** claude
**Builder model:** claude-opus-5[1m]
**Requested reviewer:** claude
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-09-21T14:29:58Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5[1m]
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-09-21T14:58:00Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

### Commands

- `npm test` in `ui/`: pass (769 specs, Chrome Headless)
- `npx ng build --configuration development` in `ui/`: pass
- `npm run test:browser` in `ui/`: pass (11 Playwright specs, Chromium)
- `npm test` in `api/`: pass (67 tests, 6 files)
- `npm run typecheck` in `api/`: pass
- lint: unavailable, no lint command is configured in either package
- `Verify`: unavailable, no Verify command exists

### Evidence

- Preconditions verified: `HEAD` equals the target, `git merge-base master HEAD`
  returns the recorded base, the spec SHA-256 matches, and `blueprint/context/review.md`
  is the only differing path.
- Rendered all four screens at 1440x1000 against the running dev server and
  compared them pixel-wise with `blueprint/references/8..11-*.png`: the 960/480
  split, the 391px form column, and per-screen ink bands.
- Expired screen at `/accept-invite/expired-token`: action measured 391x48 at
  x 1005, green border and uppercase centred label, against the reference's
  391x48 at the same x; reason renders on the error surface with `role="status"`.
- Sign-in fidelity measured for the corrected Fidelity note: built ink y 317-686,
  reference y 331-675, midlines 501.5 and 503, heading 14px higher, column 25px
  taller.
- Open-redirect probe against the running app: `returnUrl` of `/vintages`,
  `//evil.test`, `/\evil.test`, `/%0A/evil.test` and `/%09/evil.test` all land on
  this origin; the last two are accepted by `safeReturnUrl` but absorbed by the
  router, recorded as F-86.
- Reviewed the full `5928ba0..bb371bc` delta: 39 files, the nine new `ui/src/app`
  sources, six new spec files, the four e2e changes, the route and config wiring,
  and the spec and ledger text.

### Findings

- Closed after re-examination: F-80, F-81, F-82, F-83, F-84, F-85
- Added: F-86 (P2), F-87 (P2), F-88 (P3), F-89 (P3)

### Remaining risk

- No lint command exists in either package, so style and unused-symbol drift is
  found only by reading.
- No `Verify` command exists, so no single command proves both packages.
- F-86 leaves `safeReturnUrl` short of the guarantee its own comment states. It
  is not exploitable at this commit because `navigateByUrl` never leaves the
  origin, but replacing the `**` redirect with a real 404 page, or a second
  caller using `location.assign` or an `href`, makes it live.
- F-87 means the denied and unexpected-error paths on sign-in and accept
  invitation are unreachable from the fixture, so feature 14's first real
  failure will be their first exercise.
- The design reference for these screens is four PNGs, not the export itself
  (finding F-49), so fidelity was judged against the captures only.
- The reset-password confirmation replaces the form in place, which drops focus
  to the body and inserts its `role="status"` region with its content already
  present. This matches the pattern used across the existing console pages, so
  it is recorded here as a consistency risk rather than as a finding.
