# Feature: Authentication

**From build-plan:** feature 14

> **Generated file.** Holds the one feature, fix, or rollback being built right now.

**Type:** Feature
**Status:** verified
**Branch:** feature/authentication

## Goal

Make a session mean something. Supabase Auth replaces the fixture behind the
`AUTH` token, the console attaches the access token to every `/api/macro` call,
and `api/src/middleware/auth.ts` stops calling `next()` for everything and starts
verifying the JWT. When this lands, the "known gap, accepted" in
`project-overview.md`, that anyone with the API URL can spend the M2M quota by
proxy, is closed.

Feature 19 built the screens and the seam against fixtures on the bet that the
implementation could be swapped without rewriting a consumer. This feature
collects on that bet: the four screens keep their markup, their states and their
specs.

## In scope

- `SupabaseAuthProvider`, implementing `AuthProvider`, chosen by the one line in
  `app.config.ts` that currently chooses `FixtureAuthProvider`.
  - `signIn` and `requestPasswordReset` call Supabase for real.
  - `invitation` and `acceptInvitation` delegate to an injected
    `FixtureAuthProvider` and stay fixtures until feature 20 builds the
    administration surface that issues invitations. The delegation is explicit
    and tested, so it reads as a decision rather than an oversight.
- Session identity from Supabase, not from our own `localStorage` entry. The
  Supabase client owns the access token, its refresh and its persistence.
  `SessionStore` keeps its current signal API and becomes a projection of the
  Supabase session.
- `organisation` and `role` come from the user's `app_metadata`, set in the
  Supabase dashboard. Non user editable, carried inside the JWT, so feature 15
  reads them from the verified token with no database round trip. `fullName`
  comes from `user_metadata.full_name`.
- An `HttpInterceptorFn` that attaches `Authorization: Bearer <token>` to
  `/api/macro/*` requests and to nothing else.
- A `401` from the relay signs the visitor out and routes to
  `/sign-in?returnUrl=...`, so an expired session lands on the screen that can
  fix it rather than on seven empty tabs.
- **Accept-invitation ends at sign-in, not in the console.** Added during
  implementation, decided 2026-09-29. The fixture cannot mint a Supabase session,
  so the session it used to hand to `SessionStore` would now carry no token and
  every macro request would answer `401`, bouncing the visitor straight back out.
  On success the screen routes to `/sign-in` with a short notice instead. This is
  the one feature 19 screen whose behaviour changes, and it changes because the
  API is real now, not because the screen was wrong.
- `authSeam` verifies the JWT and answers `401` without a valid one.
  `/api/health` stays open. When Supabase is unconfigured the macro routes answer
  `503`, matching `macroConfigured`, so a missing setting fails closed.
- The sign-out control feature 19 deferred to "the real session", in the topbar
  beside the service-token pill.
- `/set-password`, the screen the reset email links to, reusing the
  accept-invitation form as feature 19's archive proposed. See Open questions.
- The Request builder learns the `Authorization` header, as a
  `$MACRO_TOKEN` placeholder, never the live token, plus `401` in its status code
  reference.
- `ui/src/environments/`, with `fileReplacements` in `angular.json`, carrying
  `supabaseUrl` and `supabaseAnonKey`. This settles the overview's "Angular
  build-time config mechanism undecided" open question for the anon key only.
  `API_BASE_URL` stays feature 13's.

## Out of scope

- **Role checks on routes.** Feature 15. This feature makes the role a verified
  claim and stops there. No route reads it to allow or deny.
- **Saved queries keyed by user.** Feature 16. They stay in `localStorage`.
- **Real invitations, issue, revoke, administration.** Feature 20.
- **Sign-up.** The product is invitation only, which the sign-in panel already
  says.
- **MFA, password change while signed in, email template design, SMTP
  configuration.** Supabase defaults.
- **Any change to the five macro routes.** They keep relaying unchanged. The only
  new answer on that surface is `401` before the relay runs.

## Build loop

`workflow.stepReview` is `feature` and `checkpointCommits` is `disabled`, so the
steps run end to end and produce one review packet. No per step approval pause
and no checkpoint commits. `/complete` creates the single feature commit.

`qualityGates.regular.independentReview` is `when-sensitive` and this feature is
authentication, so expect independent review to be selected before `/complete`.
`review.independentExecution` is `automatic`.

There is no project `Verify` command. Each step's check is `npm run typecheck`
and `npm test` in `api/`, `npm test` in `ui/`, and `npm run test:browser` in
`ui/` where the step touches session seeding.

## Build steps

- [x] **1. Settings and dependencies, both sides.**
      Add `@supabase/supabase-js` to `ui/` and `jose` to `api/`. Add
      `ui/src/environments/environment.ts` and `environment.production.ts` with
      `supabaseUrl` and `supabaseAnonKey`, wired through `fileReplacements` in
      `angular.json`. Add `supabaseUrl` to `api/src/config.ts` with an
      `isAuthConfigured` predicate beside `isMacroConfigured`, and to
      `.env.example` with the same "set these in the Render dashboard" note.
      **Check:** confirm against the real project whether its JWTs are signed
      with asymmetric signing keys, which is what step 2 assumes, or the legacy
      HS256 secret. Fetch `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`. A
      populated `keys` array means asymmetric. An empty one means the project is
      still on the legacy secret, and step 2 stops for a decision between
      migrating the project in the dashboard and verifying with a shared secret.
      **Done when:** `npm run typecheck` and `npm test` pass in `api/` with a
      config spec covering blank and complete Supabase settings, `npm run build`
      passes in `ui/`, and the JWKS check is recorded in the step notes.

- [x] **2. The API verifies the JWT.**
      `authSeam` builds a cached remote JWKS from `SUPABASE_URL` once per
      process, verifies the bearer token, and attaches the claims it trusts to
      `req.auth`. No header, malformed header, bad signature, wrong issuer,
      wrong audience or expired token all answer `401` through the existing
      error shape. `/api/health` is exempt and answers `200` with no header.
      When `isAuthConfigured` is false the macro routes answer `503` and never
      fall open.
      **Done when:** `npm test` in `api/` covers missing, malformed, unsigned,
      expired and valid tokens plus the open health route and the unconfigured
      `503`, and with the API running, `curl localhost:3000/api/macro/countries`
      answers `401` while `curl localhost:3000/api/health` answers `200`.

- [x] **3. `SupabaseAuthProvider` replaces the fixture.**
      `signInWithPassword` for `signIn`, `resetPasswordForEmail` for
      `requestPasswordReset` with `redirectTo` pointing at `/set-password`. Map
      an invalid credential to `'denied'` and a transport or `5xx` failure to the
      error channel, honouring the interface's rule that a rejected credential is
      an answer and only our own failures throw. `invitation` and
      `acceptInvitation` delegate to `FixtureAuthProvider`. Swap the `AUTH`
      provider line in `app.config.ts`.
      **Done when:** `npm test` in `ui/` passes, a new provider spec covers
      success, denied, unavailable and both delegations against a stubbed
      Supabase client, and the four existing screen specs pass untouched.

- [x] **4. Session truth moves to Supabase.**
      `SessionStore` hydrates from the current Supabase session, maps
      `app_metadata.organisation`, `app_metadata.role` and
      `user_metadata.full_name` into `Session`, and follows
      `onAuthStateChange` for sign in, sign out, token refresh and expiry. It
      removes the `cyte.macro.session.v1` entry once on boot, so an entry written
      by hand no longer signs anybody in. `sessionGuard` awaits hydration before
      deciding, returning an observable rather than a boolean. Accept-invitation
      routes to `/sign-in` with a notice rather than entering the console, per
      the In scope item above. The browser suite can no longer seed a session by
      writing `localStorage`, so it gains an `e2e` build configuration pointed at
      a stub project and signs in through the real form against a stubbed
      `/auth/v1` endpoint.
      **Done when:** `npm test` in `ui/` passes with specs for a hydrated
      session, a hand written legacy entry granting nothing, and a guard that
      waits rather than redirecting mid hydration, and `npm run test:browser`
      passes in `ui/` including the existing deep link redirect test.

- [x] **5. The console sends the token, and reacts to `401`.**
      An `HttpInterceptorFn` registered through `withInterceptors` attaches
      `Authorization: Bearer <token>` to requests whose URL starts with
      `/api/macro` and leaves every other request alone. A `401` from the relay
      triggers sign out and a route to `/sign-in` carrying the attempted URL as
      `returnUrl`, which `safeReturnUrl` already validates on the way back.
      **Done when:** `npm test` in `ui/` covers header present on a macro URL,
      header absent on a non macro URL, no header when there is no session, and a
      `401` landing on sign-in with the right `returnUrl`.

- [x] **6. Sign out, set password, and the Request builder.**
      A sign-out control in `console-shell.html` beside the service-token pill.
      The pill keeps its M2M meaning and its existing title attribute, which is
      the decision feature 19 left open: it reports the server's client, and the
      new control reports the visitor. A `/set-password` route under `AuthLayout`
      reusing the accept-invitation form for the recovery link. The Request
      builder renders the `Authorization: Bearer $MACRO_TOKEN` header in its curl
      and adds `401` to the status code reference.
      **Done when:** `npm test` and `npm run test:browser` pass in `ui/`, and
      signing out returns to `/sign-in` and leaves a subsequent macro request
      answering `401`.

- [x] **7. End to end against the real project.**
      Sign in with a real Supabase user carrying `organisation` and `role` in
      `app_metadata`, load all seven tabs against the live relay, let the token
      refresh, then sign out. Record what was observed, not what was expected.
      **Done when:** the seven tabs render live data for a signed-in visitor,
      every macro request carries the bearer header, and the same requests answer
      `401` once signed out.
      **Observed 2026-10-05** against project `vphjbpespgidksqifeab`, API on
      `:3000` via `npm run dev`, console on `:4202` via `ng serve --port 4202`
      (4200 was held by an unrelated project's server):
      - JWKS publishes one `ES256` / `EC` key, so the asymmetric path applies.
      - Probed by the agent: `/api/health` `200`; `/api/macro/countries` with no
        token `401`, with a malformed bearer `401`, and through the dev proxy
        with no token `401`.
      - Reported by the user in the browser: a dashboard-created, auto-confirmed
        user with `organisation` and `role` set in `app_metadata` signed in;
        the topbar showed name, organisation and role; all seven tabs rendered
        live data; macro requests carried `Authorization: Bearer`; the session
        refreshed past expiry with a `grant_type=refresh_token` call; sign out
        landed on `/sign-in` and `/api/macro/countries` then answered `401`.
      - The first attempt failed with the refusal copy because the project had
        no users; the `app_metadata` update had matched zero rows. Not a defect.

- [x] **8. Repair the independent review's findings F-90 and F-91.**
      F-90: a token whose `kid` the JWKS does not hold, or an HS256 token,
      answered `502` because jose's `ERR_JWKS_NO_MATCHING_KEY` and
      `ERR_JOSE_NOT_SUPPORTED` matched no `TOKEN_FAILURE_CODES` prefix. Both now
      answer `401`; key-set outages such as `ERR_JWKS_TIMEOUT` stay `502`.
      F-91: the mounted-seam route test asserted `503`, which only holds when the
      gitignored `api/.env` leaves `SUPABASE_URL` blank.
      **Done when:** `npm run typecheck` and `npm test` pass in `api/` with
      `SUPABASE_URL` set and with it blank, and the new unpublished-`kid` and
      HS256 cases fail against the `634eaa8` seam.

## Files / areas

**api/**

- `src/middleware/auth.ts` and `auth.test.ts` - the verification, replacing the
  no-op.
- `src/config.ts` and `config.test.ts` - `supabaseUrl`, `isAuthConfigured`.
- `src/routes/macro.ts` - the `503` when auth is unconfigured, beside the
  existing `macroConfigured` guard.
- `.env.example` - `SUPABASE_URL`.
- `package.json` - `jose`.

**ui/**

- `src/app/core/supabase/supabase-auth.provider.ts` plus spec - new.
- `src/app/core/supabase/supabase.client.ts` - one client, injected, so specs
  never construct a real one.
- `src/app/core/http/auth.interceptor.ts` plus spec - new.
- `src/app/core/session.store.ts` and spec - hydration and `onAuthStateChange`.
- `src/app/auth/session.guard.ts` and spec - async decision. `safeReturnUrl` is
  unchanged.
- `src/app/auth/set-password.ts`, `.html` plus spec - new, reusing the
  accept-invitation form.
- `src/app/app.config.ts` - the `AUTH` line, the interceptor.
- `src/app/app.routes.ts` - `/set-password`.
- `src/app/shell/console-shell.html`, `.scss`, spec - sign-out control.
- `src/app/request-builder/request-builder.ts`, `.html`, spec - the header line
  and `401`.
- `src/environments/*`, `angular.json` - build-time config.
- `e2e/stub-api.ts` - session seeding.
- `src/app/core/fixtures/fixture-auth.provider.ts` - **kept**, not deleted. Its
  own file comment says feature 14 deletes it. That comment is now wrong and the
  step that touches the file corrects it: two of its four methods are still the
  implementation.

## Data / contracts

**Env vars.** API: `SUPABASE_URL`. UI build: `supabaseUrl`, `supabaseAnonKey`.
`SUPABASE_SERVICE_KEY`, which the overview's deployment section names, is **not**
added: nothing here uses the admin API, and a service key with no caller is a
liability. Feature 20 adds it when invitations become real.

**Verification.** Asymmetric signing keys, JWKS at
`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`, verified with `jose` and cached
for the process lifetime. Issuer `${SUPABASE_URL}/auth/v1`, audience
`authenticated`. Verification is local. No network call per request beyond JWKS
refresh, and no `getUser()` round trip.

**Claims the API trusts.** `sub`, `email`, `app_metadata.role`,
`app_metadata.organisation`. Anything in `user_metadata` is user writable through
the client SDK and is display only. The API must never read a role from it.

**`req.auth` shape.** `{ userId: string; email: string; role: string | null;
organisation: string | null }`, declared once and exported so feature 15 imports
it rather than redeclaring it.

**`401` body.** The existing handler's shape, `{ error: string }`, with a message
that says the request carried no valid session and never why the token failed.
Distinguishing expired from forged for an unauthenticated caller tells an
attacker which half to fix.

**Session mapping.** `email` from the JWT's `email`; `fullName` from
`user_metadata.full_name`, falling back to the email local part when absent;
`organisation` and `role` from `app_metadata`, falling back to empty string so
the topbar renders rather than crashes on a user an administrator set up
incompletely. `Session` gains no token field: the Supabase client is the only
holder of credentials, which keeps the interface's original promise that no
consumer reads one.

**Storage.** `cyte.macro.session.v1` is removed, not migrated. It never held a
credential, only a display shape, and re-deriving it from Supabase is exact where
a migration would be a guess.

## Testing

`api/` uses Vitest, specs beside source. `ui/` uses Karma and Jasmine, specs
beside source. `ui/` browser tests use Playwright from `ui/e2e/`.

New coverage, all of it deterministic and none of it touching a real Supabase
project:

- `authSeam`: missing, malformed, wrong issuer, wrong audience, expired, bad
  signature, valid. Sign test tokens with a locally generated key pair and inject
  the JWKS, so the suite needs no network. Health route open. Unconfigured
  `503`.
- `SupabaseAuthProvider`: the four methods against a stubbed client, including
  the denied and unavailable mappings and both fixture delegations.
- `SessionStore`: hydration, `app_metadata` mapping and its fallbacks, auth state
  changes, one time removal of the legacy key.
- `sessionGuard`: waits for hydration, allows a hydrated session, redirects with
  `returnUrl` otherwise.
- The interceptor: attaches on `/api/macro`, does not attach elsewhere, does not
  attach with no session, and signs out on `401`.
- Browser: the existing auth suite keeps passing against the new seeding, and one
  new assertion that the sign-out control returns to `/sign-in`.

The suite proves wiring, not that the live project accepts a password. That is
step 7's job and it is manual.

## Notes for the AI

- The four screens from feature 19 are **not** to be rewritten. If a screen needs
  editing beyond the provider swap, that is a signal the provider mapping is
  wrong, not the screen.
- Fail closed. Every branch that cannot verify a token denies. A `catch` that
  calls `next()` is the one mistake in this feature that silently undoes it.
- The token never reaches a log, an error message, the Request builder's output,
  or `MacroRequestError`. `macro-error.ts` already refuses to carry a raw body;
  keep that property.
- `F-86` in the archived feature 19 findings is why `safeReturnUrl` looks the way
  it does. Do not simplify it while touching the guard.
- The console had no sign-out control before this feature, so there is no
  existing pattern to match. Keep it to the topbar, keep the pill's wording, and
  do not redesign the header.
- Nine P2 and twenty-three P3 findings are open in the ledger and none of them
  are in scope here. `F-30`, the service-token pill's undriven health dot, sits
  in the markup step 6 edits. Leave it. It is a fix, not this feature.

## Open questions

**Copy and heading for `/set-password`.** Feature 19's archive proposed reusing
the accept-invitation form for the screen the reset email links to, and recorded
that it needs a design review before it is built. There is no design for it in
the export. Unless answered at review, step 6 uses the accept-invitation form
with the heading "Set a new password" and the action "SET PASSWORD", changing
nothing else. This affects one screen's wording and no contract, so it does not
block the other six steps.

## Findings

Resolved with this feature and archived from the live ledger. IDs carry the
archive prefix so they stay unique across the project history.

### 14-authentication/F-86 [P2] closed - safeReturnUrl still lets a foreign origin through, because the URL parser strips the character it inspects

**File:** ui/src/app/auth/session.guard.ts:43
**Found:** 2026-09-21 by /audit independent (scope: current; lens: security)
**Why it matters:** The repaired predicate reads the second character and rejects
`/` and `\`. The WHATWG URL parser removes ASCII tab, newline and carriage return
from a URL before it parses it, so the second character is not the one the parser
sees. Verified in Node against a `http://localhost:4300/sign-in` base:
`new URL('/\n/evil.test', base).href`, and the tab and carriage-return forms,
all resolve to `http://evil.test/`. `safeReturnUrl('/\n/evil.test')` returns the
candidate unchanged, so the function hands back a string that is a foreign origin
to anything that resolves it.

That string is reachable: the router decodes `?returnUrl=%2F%0A%2Fevil.test` into
exactly it before `sign-in.ts:81` reads it.

There is no open redirect today, for the same downstream reason F-83 recorded.
Verified against the running app at `bb371bc`: signing in from
`/sign-in?returnUrl=%2F%0A%2Fevil.test` and from the tab form both land on
`/overview`, because `navigateByUrl` parses through `DefaultUrlSerializer`, which
does not strip control characters and does not leave the origin.

What makes this worth its own entry rather than a note on F-83 is the comment the
repair added: "Rejecting both slashes keeps the guarantee in this function rather
than in the router's wildcard." The guarantee is not in the function. A later
caller that hands this output to `location.assign`, `window.open` or an `href`,
or a real 404 page replacing the `**` redirect, turns it into a live open
redirect, and the comment tells that author the check has already been done.
**Suggested fix:** strip or reject ASCII tab, newline and carriage return before
the positional test, for example reject when `/[\t\n\r]/.test(candidate)` or
normalise them out first, then apply the existing check. Add
`'/\n/evil.test'` and `'/\t/evil.test'` to the hostile list at
`sign-in.spec.ts:164`. One predicate and two strings.
**Resolution:** Tab, newline and carriage return are rejected before the positional test, so the function no longer depends on the parser leaving the inspected character alone. The comment claiming the guarantee is rewritten to say what it actually covers, and it now states that the result is router-safe rather than a sanitiser for anything taking a full URL. Four more strings in the hostile list at `sign-in.spec.ts`. Marked `fixed`; a review has not looked at it yet. Closed 2026-10-05 by the independent review of `634eaa8`: `session.guard.ts:54` rejects tab, newline and carriage return before the positional test, and `sign-in.spec.ts:189-191` carries the three hostile strings. No new defect in the repair.

### 14-authentication/F-87 [P2] closed - The denied and unexpected-error states the spec puts in scope are unreachable from the fixture on two of the three forms, and untested

**File:** ui/src/app/auth/sign-in.ts:84
**Found:** 2026-09-21 by /audit independent (scope: current; lens: tests)
**Why it matters:** The spec's In scope lists "Every state each screen needs:
idle, submitting, field-invalid, denied, and unexpected error". The reset screen
has a fixture address built for exactly this, `FIXTURE_UNREACHABLE_EMAIL`, and
`reset-password.spec.ts:236` asserts the error state. The other two forms have no
equivalent.

`FixtureAuthProvider.signIn` only ever answers `FIXTURE_SESSION` or `'denied'`,
and `acceptInvitation` only ever answers a session or `'denied'`. Neither can
error and neither can return `'unavailable'`. So three branches in the delta can
never run and are asserted nowhere: the `error` handler and `UNAVAILABLE` message
at `sign-in.ts:84-90`, the `'unavailable'` arm at `sign-in.ts:69`, and the whole
denied-and-error block at `accept-invitation.ts:118-134`. The `DENIED` constant at
`accept-invitation.ts:9` is never rendered by any test either.

This is not hypothetical dead weight: feature 14 puts HTTP behind `AUTH`, at
which point both paths become the common ones, and the first evidence that they
work will be a real outage.
**Suggested fix:** give the fixture one reachable failure per screen, in the shape
the reset screen already uses: an address that makes `signIn` error, and a token
whose acceptance is refused after resolving as valid. Then assert the two
messages. Roughly two fixture constants and three specs, and it makes the
`'unavailable'` arm of `AuthFailure` mean something rather than being a type with
no producer. Closed 2026-10-05 by the independent review of `634eaa8`: `fixture-auth.provider.ts:99` and `:147` produce the error and refusal, asserted at `sign-in.spec.ts:117` and `accept-invitation.spec.ts:125`. No new defect in the repair.
**Resolution:** `FIXTURE_FAILING_EMAIL` makes `signIn` error and `FIXTURE_REFUSED_TOKEN` resolves valid then refuses on acceptance, so both screens reach the paths the spec put in scope. Two specs assert the wording, and `'unavailable'` now has a producer. Marked `fixed`; a review has not looked at it yet.

### 14-authentication/F-88 [P3] closed - The accept-invitation form declares a message id that nothing points at, unlike the sign-in form beside it

**File:** ui/src/app/auth/accept-invitation.html:46
**Found:** 2026-09-21 by /audit independent (scope: current; lens: quality)
**Why it matters:** `<p class="problem" id="accept-problem" role="status">` gives
the message an id, and no element carries `aria-describedby="accept-problem"`.
`sign-in.html:13` and `sign-in.html:29` wire their inputs to `sign-in-problem`,
and `reset-password.html:23` wires its input to `reset-problem`, so this is the
one form of the three that does not. The spec's Notes for the AI ask to
"associate each field with its label and its message".

The consequence is small, because `role="status"` still announces the text when it
arrives, but a visitor who moves back to the password field afterwards is not told
what went wrong there, and the unused id reads as an oversight rather than a
choice. The password input already carries
`aria-describedby="password-rules"`, so the fix is a token list rather than a new
attribute.
**Suggested fix:** bind `[attr.aria-describedby]` on both inputs the way sign-in
does, appending `accept-problem` to the password field's existing
`password-rules`. Two attributes. Closed 2026-10-05 by the independent review of `634eaa8`: `accept-invitation.html:30` carries the token list, and the new `set-password.html:13` follows the same pattern.
**Resolution:** The password input describes `password-rules accept-problem`, and a spec asserts every id in that list resolves to an element. Marked `fixed`; a review has not looked at it yet.

### 14-authentication/F-89 [P3] closed - passwordMeetsRules has no caller outside its own spec

**File:** ui/src/app/core/password-rules.ts:37
**Found:** 2026-09-21 by /audit independent (scope: current; lens: quality)
**Why it matters:** The screen that needs the rules uses `passwordRules` through
`accept-invitation.ts:47`, and derives its submit gate from the same computed at
`accept-invitation.ts:57`. `passwordMeetsRules` is exported, carries eight
assertions in `password-rules.spec.ts:179-189`, and is called by nothing else in
`ui/src`. It is a second way to ask the same question, which is how the two drift:
a fifth rule added to `passwordRules` changes the screen and leaves this predicate
silently weaker for whoever picks it up later.

`SessionStore.signOut` at `session.store.ts:56` is in the same position, also
called only from its spec, but the spec's Out of scope and Open questions record
sign-out as a deliberate deferral to feature 14, so that one is a documented stub
rather than an accident. This one is not mentioned anywhere.
**Suggested fix:** either delete `passwordMeetsRules` and its describe block, or
use it at `accept-invitation.ts:58` in place of `ruleList().every(...)` so the
gate and the helper are the same code. The second is the smaller change and
removes the drift rather than the function. Closed 2026-10-05 by the independent review of `634eaa8`: `accept-invitation.ts:56` and the new `set-password.ts:55` both gate on `passwordMeetsRules`, so the helper has two callers and no second derivation.
**Resolution:** `accept-invitation.ts:58` gates on `passwordMeetsRules` instead of re-deriving with `ruleList().every(...)`. The helper is kept rather than deleted: the screen needs the question answered and this is where it belongs. Marked `fixed`; a review has not looked at it yet.

### 14-authentication/F-90 [P1] closed - A token signed by a key the JWKS does not hold answers 502 and logs an error, not 401

**File:** api/src/middleware/auth.ts:72
**Found:** 2026-10-05 by /audit independent (scope: current; lens: security)
**Why it matters:** `TOKEN_FAILURE_CODES` lists `ERR_JWK_` as a prefix, but jose's
key-set errors are `ERR_JWKS_*`, which `'ERR_JWKS_NO_MATCHING_KEY'.startsWith('ERR_JWK_')`
does not match. Reproduced against the installed jose in Node: a token whose `kid`
is not in the key set fails with `ERR_JWKS_NO_MATCHING_KEY`, and an HS256 token
against an EC key set fails with `ERR_JOSE_NOT_SUPPORTED`. Both fall through to
`auth.ts:149-150`, so the caller gets `502 The session could not be verified` and
the server writes a `console.error` with a stack.

Real Supabase access tokens always carry a `kid`, so a forged token, a token from
another project, or a token signed by a revoked key all take this path in
production. The spec's step 2 contract is that a bad signature answers `401`. It
still fails closed, which is why this is not P0, but: any unauthenticated caller can
write one error log line per request (the project's legacy HS256 anon key, which is
public by design, is enough); and the console's interceptor only signs out on
`401`, so a visitor holding a token from a revoked key sees broken tabs instead of
sign-in. The suite misses it because `auth.test.ts:28-31` publishes and signs with no
`kid`, so the stranger case reaches `ERR_JWS_SIGNATURE_VERIFICATION_FAILED` instead.
**Suggested fix:** treat `ERR_JWKS_NO_MATCHING_KEY`, `ERR_JWKS_MULTIPLE_MATCHING_KEYS`
and `ERR_JOSE_NOT_SUPPORTED` as token failures (401), keep `ERR_JWKS_TIMEOUT`,
`ERR_JWKS_INVALID` and transport errors as 502. Add cases signed with a `kid` absent
from the set, and with HS256, to `auth.test.ts`.
**Resolution:** Fixed 2026-10-05 by /implement (feature 14 step 8). `TOKEN_FAILURE_CODES` adds `ERR_JWKS_NO_MATCHING_KEY`, `ERR_JWKS_MULTIPLE_MATCHING_KEYS` and `ERR_JOSE_NOT_SUPPORTED` as exact codes, not an `ERR_JWKS_` prefix, so `ERR_JWKS_TIMEOUT` and `ERR_JWKS_INVALID` stay 502. `auth.test.ts` now signs with a `kid` like a real Supabase token and adds an unpublished-`kid` case, an HS256 case (both 401, no `console.error`) and a `JWKSTimeout` case (502). Both 401 cases fail against the `634eaa8` seam. Awaiting re-review. Closed 2026-10-05 by the independent review of `51625fb`: `auth.ts:78-86` lists the two `kid` codes and `ERR_JOSE_NOT_SUPPORTED` as exact entries, the installed jose's error codes confirm `ERR_JWKS_TIMEOUT` and `ERR_JWKS_INVALID` match no entry and stay 502, and `auth.test.ts:163-190,240-248` cover unpublished `kid`, HS256 (401, no `console.error`) and `JWKSTimeout` (502). `npm test` in `api/` passes 96/96. No new defect in the repair.

### 14-authentication/F-91 [P2] closed - The mounted-seam route test reads the developer's real .env, so npm test fails on a configured checkout

**File:** api/src/routes/macro.routes.test.ts:505
**Found:** 2026-10-05 by /audit independent (scope: current; lens: tests)
**Why it matters:** `config.ts` imports `dotenv/config` and freezes
`authConfigured` at import time, and `createApp` mounts the real `authSeam` built from
it. The test asserts `503` on the comment's premise that "this repository has no
Supabase project configured". This checkout has `SUPABASE_URL` set in `api/.env`
(needed for step 7), so the seam is configured and answers `401`: `npm test` in
`api/` fails 1 of 93 at `634eaa8`. The suite's result depends on a gitignored local
file, and the spec's Done when for steps 1 and 2 claims it passes. The behaviour the
test wants to prove, that `createApp` mounts the seam at all, holds either way.
**Suggested fix:** assert that the unauthenticated request is refused with
`expect([401, 503]).toContain(...)`, or better, export a `createAuthSeam` override path
that `createApp` uses by default and build the real seam with `configured: false`
in the test, so the result no longer depends on the environment.
**Resolution:** Fixed 2026-10-05 by /implement (feature 14 step 8). The mounted-seam test accepts `401` or `503`, both refusals, and its comment explains why. `npm test` in `api/` passes 96 of 96 with `SUPABASE_URL` set and with it forced blank. Awaiting re-review. Closed 2026-10-05 by the independent review of `51625fb`: `macro.routes.test.ts:507` accepts either refusal, a configured seam answers 401 before any JWKS fetch because the request carries no token, and every other route test injects `openSeam`. `npm test` in `api/` passes 96/96 on this checkout.

## Independent review

**Status:** passed
**Target commit:** 51625fbcfde3f08385173b94f48aff871043ea3e
**Base commit:** f3411e0b27a670bcc80479db3f6fc9261f99391c
**Base ref:** master
**Spec hash:** 71d3378c9a6fb1a48e22503392365ffebccfdf5cc320ee9e9a0e98b7170afd6a
**Prepared by:** claude
**Builder model:** claude-opus-5-5
**Requested reviewer:** claude
**Requested model:** claude-opus-5-5
**Requested execution:** automatic
**Requested at:** 2026-10-05T08:18:52Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5-5
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-10-05T08:22:07Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

### Commands

- `git rev-parse HEAD`, `git merge-base master HEAD`, `sha256sum blueprint/context/current-feature.md`, `git status --porcelain`: pass (all match the request; only `review.md` modified)
- `npm run typecheck` in `api/`: pass
- `npm test` in `api/`: pass (96/96, with this checkout's `SUPABASE_URL` set)
- `npm test` in `ui/`: pass (820/820, ChromeHeadless)
- `npm run test:browser` in `ui/`: pass (12/12, Playwright on its own port 4201)

### Evidence

- `api/src/middleware/auth.ts`: every non-verified path denies (503 unconfigured, 401 no/malformed/invalid token, 502 only for key-set outage); no `catch` calls bare `next()`; fixed messages carry no token or reason; trusted claims from `sub`, `email`, `app_metadata` only.
- `api/src/app.ts`: `cors()` precedes the seam, so preflight for `Authorization` is answered; seam mounted ahead of `/api` with only `/api/health` open.
- `ui/src/app/core/http/auth.interceptor.ts`: bearer attached only to `/api/macro` URLs (relative base in `http-macro-data.provider.ts:29`); 401 signs out and routes with `returnUrl`; token never placed on an error or log.
- `ui/src/app/core/session.store.ts`, `session-mapping.ts`: no own credential storage; legacy key removed on boot; role/organisation from `app_metadata` only.
- `ui/src/environments/environment.ts` carries the publishable anon key only; no service key anywhere in the delta. `api/.env` not read.
- F-90 and F-91 repairs re-examined against the installed jose error codes and the tests; both closed.

### Findings

- F-90 [P1] closed - token signed by an unpublished key answered 502
- F-91 [P2] closed - mounted-seam route test depended on the local `.env`
- F-95 [P2] open - sessionGuard has no spec; hydration wait unproved
- F-96 [P3] open - `SupabaseAuthProvider.setPassword` has no provider spec
- F-97 [P3] open - step 6 claims a `$MACRO_TOKEN` Request-builder change the delta never makes
- F-92 [P3], F-93 [P3] re-confirmed open; F-94 [P3] remains unverified

### Remaining risk

- Live Supabase behaviour (real sign-in, token refresh, recovery link into `/set-password`) was not re-exercised by this review; it rests on the step 7 record, which is partly user-reported.
- F-94 unverified: project session settings (refresh-token lifetime after local-only sign-out) not inspected.
- F-92: a default production build still ships blank Supabase settings; must be settled before `/release`.
- No dependency vulnerability scan was run; `jose` and `@supabase/supabase-js` were inspected by manifest only.
