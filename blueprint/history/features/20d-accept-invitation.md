# Feature: Accept invitation

**From build-plan:** feature 20d

**Branch:** `feature/accept-invitation`

**Status:** verified

## Goal

The invitee clicks the link in Supabase's invite email and lands on
`/accept-invite`. The screen shows the invitation (email, organisation, role,
who invited them), and the invitee sets their name and password. They then land
in the console, signed in. An expired, used or revoked link lands on the
existing dead-end screen.

The two invitation methods of `SupabaseAuthProvider` stop delegating to the
fixture.

## Design reference

The existing accept-invitation screen and its dead end, `accept-invitation.html`
(feature 19, references `10-accept-invitation.png` and
`11-expired-invitation.png`). Its layout and form are unchanged; only the
dead-end wording changes (see Data / contracts). After this feature nothing uses
`prototypes/`, so this feature's `/complete` deletes it.

## In scope

- **Route:** `/accept-invite` with no token, under `AuthLayout`. This is where
  20c's `redirectTo` points. Keep `accept-invite/:token` routed to the same page
  so the fixture provider and its specs still work.
- **`SupabaseAuthProvider.invitation()`:**
  1. Wait for the client to finish reading the link, using `getSession()`.
  2. With a session whose user carries `app_metadata.invited_by`, answer
     `status: 'valid'` with the user's details.
  3. With no session, read the link's fragment for Supabase's `error_code`.
     `otp_expired` gives `'expired'`; anything else gives `'unknown'`.
- **`SupabaseAuthProvider.acceptInvitation()`:** calls
  `updateUser({ password, data: { full_name } })` on that session.
  - Success answers the `Session`.
  - A missing session answers `'denied'`.
  - A weak-password refusal answers `'weak-password'`. This means
    `acceptInvitation`'s return type gains `PasswordRejection`.
  - Anything else is an error.
- **Accept screen:**
  - on success, call `SessionStore.signIn(result)` and go to `/overview`, as the
    set-password screen does;
  - a `weak-password` answer keeps the form and shows the same sentence the
    set-password screen uses;
  - new dead-end wording for the real link states.
- **API:** 20c's `invite` (and therefore `resend`) also stamps
  `app_metadata.invited_by_name`, the caller's `fullName` at the time, so the
  invitee's screen can name the inviter without an extra request.

## Out of scope

- **Signing out an invitee who leaves without setting a password.** Following
  the link already proves they own the email (see Notes).
- **Distinguishing "revoked" from "expired" for real links.** A revoked
  invitation's user is deleted, so Supabase rejects the link the same way as an
  expired one. The `revoked` state stays for the fixture.
- **Changing the invite email template,** and invitation lifetime.
- **Fixing 20c's open findings** (F-106 to F-111). Those go through `/fix`.

## Build loop

`workflow.stepReview` is `feature`: build all steps, then present one review
packet. `checkpointCommits` is disabled. This turns an emailed link into a
password and a signed-in session, so the independent-review gate
(`when-sensitive`) runs before `/complete`.

## Build steps

- [x] **1. API: stamp the inviter's name.**
  - In `api/src/admin/user-directory.ts`, `sendInvite` adds
    `invited_by_name: <caller fullName>` to the stamped `app_metadata`.
  - The caller is already found by `asAdministrator`: pass its `AdminUser`
    through.
  - `toInvitation` keeps reading the live inviter first. The stamp is only for
    the invitee's screen.
  - Extend the invite and resend tests to assert the stamp.

  **Done when:** `npm test` and `npm run typecheck` pass in `api/`.

- [x] **2. UI: route and provider.**
  - In `app.routes.ts`, add `{ path: 'accept-invite', component: AcceptInvitationPage }`
    beside the token route.
  - In `auth.provider.ts`, `acceptInvitation`'s return type becomes
    `Session | AuthFailure | PasswordRejection`. Update the fixture provider's
    signature too; it never answers a rejection.
  - In `supabase-auth.provider.ts`, implement the two methods per In scope:
    - The invitation fields:
      - `token` is `''`;
      - `email` is `user.email`;
      - `organisation` and `role` come from `app_metadata`;
      - `invitedBy` is `app_metadata.invited_by_name`, or `'an administrator'`;
      - `sentAt` is `user.invited_at`;
      - `expiresAt` is `''`;
      - `status` is `'valid'`.
    - Read the fragment from `DOCUMENT.location.hash` as `URLSearchParams`.
      Check during build that supabase-js leaves the error fragment in place
      after it fails to read the link. If it clears it, use `'unknown'`, which
      shows the same generic dead end, and record that.
  - The class comment no longer describes the fixture delegation, and
    `FixtureAuthProvider` is no longer injected there.
  - Update `supabase-auth.provider.spec.ts` (stubbed client):
    - a valid session;
    - no session with `otp_expired`;
    - no session with no fragment;
    - a session without `invited_by`, which answers `unknown` so an ordinary
      signed-in user is not shown an invitation;
    - accept success;
    - missing session gives `denied`;
    - weak password;
    - service failure.

  **Done when:** `npm test` passes in `ui/`.

- [x] **3. UI: accept screen.**
  - In `accept-invitation.ts`:
    - a `weak-password` answer keeps the form, clears the password and shows
      the set-password screen's weak-password sentence (`role="status"`, the
      existing `accept-problem`);
    - success calls `SessionStore.signIn(result)` and navigates to `/overview`;
    - the comment explaining the old sign-in redirect is removed.
  - The dead-end copy (`deadEnd`):
    - **expired:** `This invitation link has expired or has already been used.`
      When the invitation carries both dates, keep the existing dated sentence
      without "seven days": `This invitation was sent to <email> on <date> and expired on <date>.`
    - **revoked:** unchanged.
    - **unknown:** unchanged.
  - Update `accept-invitation.spec.ts`:
    - success lands on `/overview`, signed in;
    - the weak-password message;
    - the new expired sentence;
    - the dated sentence no longer says "seven days".
  - Keep every existing accessibility assertion.

  **Done when:** `npm test` and `npm run build` pass in `ui/`. Browser tests are
  not extended.

## Files / areas

- `api/src/admin/user-directory.ts` and its test
- `ui/src/app/app.routes.ts`
- `ui/src/app/core/auth.provider.ts`, `ui/src/app/core/fixtures/fixture-auth.provider.ts`
- `ui/src/app/core/supabase/supabase-auth.provider.ts` and its spec
- `ui/src/app/auth/accept-invitation.ts` and its spec (`.html` only if the copy binding changes)
- `prototypes/` (deleted at `/complete`)

## Data / contracts

**Trusted fields** on the invite session's user:

| Field | Source | Trust |
| --- | --- | --- |
| `organisation`, `role`, `invited_by`, `invited_by_name` | `app_metadata`, set by the API | Administrator-written. Displayed only; the API re-derives authority from the token. |
| `full_name` | `user_metadata`, written by the invitee here | Display only, as before |

**Is this an invitation?** A session counts as an invitation only when
`app_metadata.invited_by` is a non-empty string. Any other session (an ordinary
user who opens `/accept-invite`) answers `unknown`.

**Fragment errors** come from Supabase's redirect (`#error=…&error_code=…`):
- `otp_expired` gives `expired`;
- any other code, or no fragment at all, gives `unknown`.

**Accept call:** `updateUser({ password, data: { full_name: fullName.trim() } })`.

| Supabase answer | Result |
| --- | --- |
| Success | The mapped `Session` (via `toSession`) |
| `session_not_found` or no session | `'denied'` |
| `weak_password` | `'weak-password'` (via the existing `passwordRejection`) |
| Anything else | Error, which shows the existing `UNAVAILABLE` sentence |

**Copy:**
- **Expired:** `This invitation link has expired or has already been used.`
  With dates: `This invitation was sent to <email> on <date> and expired on <date>.`
- **Weak password:** reuse `REJECTED['weak-password']` from `set-password.ts`.
  Move it into a shared constant rather than duplicating it.

## Testing

- `api/`, Vitest: the inviter-name stamp on invite and resend.
- `ui/`, Karma:
  - the provider against a stubbed Supabase client, with `DOCUMENT` stubbed for
    the fragment;
  - the accept screen against the fixture provider.
- **No live evidence is claimed.** A live run needs:
  - 20c's setup (service key, `CONSOLE_URL`, the redirect allowlist, working
    email);
  - an invitation sent, its link followed, then the password set and the
    console reached;
  - a second click of the same link, which should show the dead end.

  Use `/check` afterwards.

## Notes for the AI

- **Following the invite link signs the invitee in** (supabase-js consumes the
  fragment), much like a magic link. If they leave `/accept-invite` without
  setting a password, they are in the console as that user until the session
  ends, and can set a password later through Forgot password. This is accepted:
  the link proves they own the email. Say so in the handoff.
- **Never take `organisation` or `role` from `user_metadata`.** `toSession`
  already gets this right, so reuse it.
- **Found while building:**
  - supabase-js returns before clearing the fragment when a link fails (`GoTrueClient._initialize`), so `error_code` is readable;
  - a refused link is checked first and wins over any session already in the browser, because supabase-js keeps an existing session on a failed link;
  - the sign-in screen's `?accepted=1` notice no longer has a caller. It was left in place, since removing it is outside this feature.
- **The fragment is read only for `error_code`.** The access token in a
  successful fragment is supabase-js's business. Never read or log it.
- **After this lands,** 20c and 20d together are safe to deploy, given the setup
  in 20c's notes (custom SMTP recommended). The Administration feature (20) can
  be checked off at this `/complete`.

## Independent review

**Status:** passed
**Target commit:** 5cbaf667c9bfd0ff50a22158303547770ce7afab
**Base commit:** 3d85b70a8cb6359f0895909afa8056f090627c21
**Base ref:** master
**Spec hash:** d879851dab1be8c04b03338b968d9fdc02cfa764bb3f6b39a81a4593f56e3967
**Prepared by:** claude
**Builder model:** claude-opus-5-5
**Requested reviewer:** claude
**Requested model:** claude-opus-5-5
**Requested execution:** automatic
**Requested at:** 2026-10-06T12:25:10Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5-5
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-10-06T12:40:00Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

### Commands

- `npm run typecheck` (api/): pass
- `npm test` (api/): pass, 244 tests in 12 files
- `npm run build` (api/): pass
- `npm test` (ui/): pass, 887 of 887
- `npm run build` (ui/): pass, with the initial-bundle budget warning (719.80 kB against 500 kB)

### Evidence

- Freshness: `HEAD` equals target; `git merge-base master HEAD` equals base; spec SHA-256 matches; only `blueprint/context/review.md` differed from target before this pass.
- Trust: `invitationOf` and `acceptInvitation` take organisation and role only via `toSession`, which reads `app_metadata`; nothing in the delta reads authority from `user_metadata`. The provider spec plants `user_metadata.role` and asserts the `app_metadata` role is shown. The API stamp `invited_by_name` is display-only and read nowhere server side.
- Fragment: `fragmentErrorCode` reads only `error_code` from `location.hash`; no token is read or logged, and `serviceFailure` carries only Supabase's message. Confirmed in `@supabase/auth-js` `GoTrueClient` that a successful URL session clears `window.location.hash` and a failed one returns before clearing it, so `error_code` is readable.
- Refused link wins: `deadEnd(refused)` is returned before the session is consulted, covered by a spec with an invitee session plus `otp_expired`.
- Ordinary user: a session without `invited_by` answers `unknown` (spec covered). Accepted invitees still carry `invited_by` (F-112).
- Accept error mapping matches the spec table: session missing or 401 gives `denied`, `weak_password` gives `weak-password`, anything else including `same_password` rethrows to `UNAVAILABLE`; a null user throws. Screen signs in via `SessionStore.signIn` and goes to `/overview`.
- Console grants no authority from client claims: `SessionStore` is display only; the API re-derives authority from the verified token. Angular interpolation escapes the inviter name.
- Performance: one local `getSession()` and one `updateUser()` per screen; no repeated or unbounded work in the delta.
- Tests: every case listed in spec steps 1 to 3 is present; no skipped or focused specs in the delta.

### Findings

- F-112 [P2] open: an accepted invitee keeps `invited_by`, so a signed-in one who opens `/accept-invite` without a fragment is shown the invitation again (no authority gained).
- F-113 [P3] open: the sign-in `?accepted=1` notice has no caller after this delta.

### Remaining risk

- No live Supabase run: the real invite link, password set, and second-click dead end are unproved (spec defers to `/check`; Check not required).
- Browser tests (`npm run test:browser`) not run; not part of the requested command set, and the spec does not extend them.
- The ui build's initial-bundle budget warning was not compared against master; the delta adds no dependency.
- Following an invite link signs the invitee in before a password is set; accepted by the spec's Notes.
