# Fix: Invitation hardening

**Type:** Fix

**Status:** verified

**Branch:** `fix/invitation-hardening`

**Fixes:** F-106, F-107, F-108, F-112

## The problem

Four medium-severity findings from the independent reviews of 20c and 20d:

- **F-106:** `sendInvite` (`api/src/admin/user-directory.ts`) ignores whether
  the rollback `deleteUser` worked.
  - If stamping `app_metadata` fails and the delete fails too, an invitee with
    no organisation remains. No administrator can see or revoke it, its email
    answers `already-registered` forever, and nothing logs it.
  - A rejected delete also replaces the stamp error.
- **F-107:** the queue test in `user-directory.test.ts` passes with no queue,
  because both operations happen to write in the same order anyway. The shared
  per-organisation serialisation is unproved.
- **F-108:** the invite form's email error (`invite-form.ts` / `.html`) is
  silent to screen readers.
  - Focus moves before the error renders, and the error has no live role.
  - Pressing Enter in the already focused field announces nothing.
- **F-112:** `isInvited` (`supabase-auth.provider.ts`) treats any session with
  `app_metadata.invited_by` as an invitation. That field stays on an account
  forever, so an invitee who has already accepted sees the form again on
  `/accept-invite` (from a bookmark or history).

## The fix

- **F-106:** in `sendInvite`, check the rollback.
  - Await `deleteUser` inside a `try`, treating both a returned `{ error }` and
    a rejection as a failure.
  - On failure, `console.error` one distinct line,
    `Invite rollback failed; orphaned invitee <id> has no organisation`. The id
    is an operator detail and is never returned.
  - Always rethrow the original stamp error, so the route's answer is
    unchanged.
- **F-107:** in the queue test, make the stub's first write (`deleteUser`) wait
  on a deferred promise.
  - Assert that the second operation's `listUsers` and `inviteUserByEmail` are
    not called until it is released.
  - Add the same test across two organisations, which must **not** wait for each
    other, so the test proves the queue is per organisation and actually there.
- **F-108:**
  - Give the email error element `role="alert"`.
  - Move the focus call to after render (`afterNextRender`, as the shell menu
    does). Then focus lands on an input that already carries `aria-invalid` and
    `aria-describedby`, and the alert is announced even when focus did not move.
- **F-112:** count a session as an invitation only while it still looks
  unaccepted: it has `invited_by` and has no `user_metadata.full_name` yet.
  - Accepting always sets `full_name`, so an accepted invitee gets the
    `unknown` dead end.
  - This is display only. `user_metadata` is visitor-writable, but the worst a
    visitor can do with it is see their own invitation form again, which grants
    nothing, because `/set-password` already lets that session set a password.

**Must not break:**
- the 20c rollback when only stamping fails;
- the 20a to 20c route contracts;
- the invite form's existing states;
- 20d's valid, expired and refused-link paths.

## Build steps

- [x] **1. API: F-106 and F-107.**
  - The `sendInvite` rollback check.
  - Directory tests:
    - a double failure (`{ stamp: true, delete: true }`) rethrows the stamp
      error and logs the orphan line once;
    - a delete that rejects;
    - the deferred-write queue test, for the same organisation and for two
      organisations.

  **Done when:** `npm test` and `npm run typecheck` pass in `api/`, and the
  same-organisation queue test fails if `serialized(...)` is removed from
  `invite` and `revoke`. Check this once by hand and record it.

- [x] **2. UI: F-108 and F-112.**
  - Add `role="alert"` and move the focus to after render in `invite-form`.
  - Add the unaccepted condition in `isInvited`.
  - Specs:
    - submitting while the input is already focused renders the alert with
      `role="alert"`;
    - focus ends on the input after render;
    - a signed-in user with `invited_by` **and** `full_name` gets `unknown`;
    - one with `invited_by` and no `full_name` still gets `valid`.

  **Done when:** `npm test` and `npm run build` pass in `ui/`.

## Verify

- `npm test`, `npm run typecheck` and `npm run build` in `api/`; `npm test` and
  `npm run build` in `ui/`.
- On the running console, as an Administrator, type `name@company` into Invite
  someone and press Enter. The error appears and a screen reader announces it.
- As an invitee who has already accepted, open `/accept-invite` with no link.
  It shows the "no longer valid" screen, not the form.

## Findings

### invitation-hardening/F-106 [P2] closed - The invite rollback ignores whether the delete worked, so a failed rollback leaves an org-less invitee nobody can see or remove

**File:** api/src/admin/user-directory.ts:319
**Found:** 2026-10-06 by /audit independent (scope: current; lens: quality, security)
**Why it matters:** When stamping fails, `sendInvite` calls `await client.deleteUser(user.id)` and discards the result. If that delete also fails, the invited user stays in the project with no `organisation`, and the email has already been sent. That user is in no organisation's list, so no administrator can revoke it; its email now answers `already-registered` everywhere, so it can never be invited again; and nothing logs that a rollback failed (only the stamp error reaches the route's single log line). If `deleteUser` rejects instead of returning `{ error }`, its error also replaces the stamp error. The spec says the rollback "never leaves an invitee without an organisation". A double failure cannot be fully prevented, but it can be made visible. Not P1: it needs two consecutive Supabase failures, and the stub test covers the single-failure path.
**Suggested fix:** check the delete's `error` (and catch a rejection); when it fails, `console.error` a distinct line naming the orphaned user id for an operator, then rethrow the original stamp error. Add a stub case with `{ stamp: true, delete: true }` (the stub already supports `delete`).
**Resolution:** Fixed 2026-10-06 by fix/invitation-hardening: `sendInvite` rolls back through `rollBack`, which treats a returned error or a rejection as failure, logs `Invite rollback failed; orphaned invitee <id> has no organisation` once, and the original stamp error is still thrown. Tested for both failure shapes and for the clean rollback. Closed 2026-10-06 by /audit independent current (fresh subagent, claude-opus-5-5) at 80784fe: `rollBack` (user-directory.ts:298) awaits `deleteUser` in a try, treats `{ error }` and a rejection alike, logs the orphan line with the id only to the server log, and `check(stamped.error)` still throws the original stamp error; resend shares the path. Tests assert the exact line once, the rejecting delete, and silence on a clean rollback; api tests pass.

### invitation-hardening/F-107 [P2] closed - The queue test passes without the queue, so the shared per-organisation serialisation is unproved

**File:** api/src/admin/user-directory.test.ts:604
**Found:** 2026-10-06 by /audit independent (scope: current; lens: tests)
**Why it matters:** "serialises an invite against a revoke in the same organisation" expects `delete:pending`, `invite:...`, `update:new-1`. That order also occurs with no serialisation at all: both calls make the same number of awaits before their first write, so the revoke always writes first. Reproduced by running the same two calls against two different organisations (separate queues, so no serialisation): the call log was identical, `["delete:p","invite:k@x.co","update:new-1"]`. Removing `serialized(...)` from `invite` and `revoke` would keep the suite green. The spec lists "the queue serialising an invite against a revoke" as required coverage, and the queue is what makes the shared directory in `routes/index.ts:17` matter.
**Suggested fix:** hold the first operation's write on a deferred promise in the stub (for example, block `deleteUser` until released) and assert the second operation's `listUsers` or `inviteUserByEmail` is not called until it is released. Optionally add a route-level test that `/admin/users` and `/admin/invitations` receive the same directory instance.
**Resolution:** Fixed 2026-10-06 by fix/invitation-hardening: the stub holds `deleteUser` on a deferred promise; the same-organisation test asserts the invite has not even read until the revoke is released, and a second test shows another organisation is not held. Checked by hand: unwrapping `serialized` in `invite` and `revoke` fails the same-organisation test. Closed 2026-10-06 by /audit independent current (fresh subagent, claude-opus-5-5) at 80784fe: traced the unserialised path: revoke and invite would each call `listUsers` before the held delete is released, so `reads.count` would be 2 and the call log would gain the invite, failing the same-organisation test; a global (not per-organisation) queue would fail the two-organisation test. Not re-run by mutation in this review (reviewer may not edit code); the builder's recorded hand check agrees.

### invitation-hardening/F-108 [P2] closed - The invite form's email error is silent to screen readers when submitted with Enter from the field

**File:** ui/src/app/administration/invite-form.ts:72
**Found:** 2026-10-06 by /audit independent (scope: current; lens: quality)
**Why it matters:** On an invalid address, `send()` sets `fieldError` and calls `focus()` in the same tick, before change detection renders `aria-invalid`, `aria-describedby` and the error element, so focus lands on an input that does not yet carry its description. The usual submit path is pressing Enter in the field; the input already has focus, so `focus()` does nothing and nothing is re-announced. The error `div` has no live role. A screen-reader user pressing Enter on `name@company` hears nothing and the invitation is not sent. The spec test checks `document.activeElement` and the attributes after `detectChanges`, so it passes. The prototype's invalid-email drawing is the state this misses.
**Suggested fix:** give the error element `role="alert"` (or put it in an always-present `aria-live="assertive"` container), or move focus after render (for example with `afterNextRender`), or both. Add a spec that submits while the input is already focused and asserts the alert.
**Resolution:** Fixed 2026-10-06 by fix/invitation-hardening: the email error has `role="alert"` and focus moves after render via `afterNextRender`; a spec submits from the already focused field and asserts the alert, its association and the focus. Closed 2026-10-06 by /audit independent current (fresh subagent, claude-opus-5-5) at 80784fe: invite-form.html:29 carries `role="alert"`, so the error is announced on insertion even when focus does not move; invite-form.ts:84 focuses via `afterNextRender` with the component injector. The first spec only passes if the after-render focus fires; the new spec covers the already focused field. ui tests pass. A repeat Enter with the unchanged invalid value re-renders nothing and is not re-announced, which is acceptable once the first press is heard.

### invitation-hardening/F-112 [P2] closed - An invitee who already accepted is shown the invitation again, because `invited_by` stays on every account forever

**File:** ui/src/app/core/supabase/supabase-auth.provider.ts:231
**Found:** 2026-10-06 by /audit independent (scope: current; lens: quality, security, tests)
**Why it matters:** `isInvited` treats any session whose `app_metadata.invited_by` is a non-empty string as an invitation. The API stamps that field at invite time and never removes it, so every account created through an invitation (that is, every account except a bootstrap administrator) keeps it after accepting. Such a user who opens `/accept-invite` while signed in with no error fragment (a bookmark, browser history, or the typed address; a spent link correctly lands on the dead end because its `otp_expired` fragment wins), sees "Accept your invitation" with their organisation and role and can re-submit a name and password. This follows the spec's literal rule but defeats its stated intent that an ordinary signed-in user is not shown an invitation. No authority is gained: the session can already change its password through `/set-password`, and organisation and role are read only from `app_metadata` via `toSession`. The provider spec's "ordinary signed-in visitor" case uses a user without `invited_by`, so it does not cover the common case.
**Suggested fix:** also require the session to look unaccepted, for example no `user_metadata.full_name` yet, or have the API (or the accept call) clear `invited_by` / set an `accepted` marker in `app_metadata` once the password is set; add a provider spec for a signed-in user who still carries `invited_by` after accepting. Alternatively amend the spec to accept this behaviour explicitly.
**Resolution:** Fixed 2026-10-06 by fix/invitation-hardening: `isInvited` also requires no non-blank `user_metadata.full_name`, which accepting always sets; specs cover an accepted invitee (`unknown`) and a pending one with a blank name (`valid`). Closed 2026-10-06 by /audit independent current (fresh subagent, claude-opus-5-5) at 80784fe: `isInvited` (supabase-auth.provider.ts:238) is used only by `invitation()`; `acceptInvitation` always writes a trimmed `full_name` and the accept screen's `canSubmit` requires a non-blank name, so an accepted invitee now gets `unknown`. The API invite passes no user metadata, so a fresh invitee still gets `valid`. Display only; no authority depends on it. Specs cover both.

## Independent review

**Status:** passed
**Target commit:** 80784fe08974a4b504afb3830569bc0f50fa79cf
**Base commit:** 9056be6f4ea66a1c61454066271d3a31344fe4b9
**Base ref:** master
**Spec hash:** 3f71c447237e743e98b4bbf0b0a93802f781261cc26d14b3f7c07c1b21ace5cf
**Prepared by:** claude
**Builder model:** claude-opus-5-5
**Requested reviewer:** claude
**Requested model:** claude-opus-5-5
**Requested execution:** automatic
**Requested at:** 2026-10-06T13:02:00Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5-5
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-10-06T13:10:00Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

### Commands

- `npm run typecheck` (api/): pass
- `npm test` (api/): pass, 248 tests in 12 files
- `npm run build` (api/): pass
- `npm test` (ui/): pass, 890 specs
- `npm run build` (ui/): pass, with the initial-bundle budget warning (719.93 kB against 500 kB)

### Evidence

- Freshness confirmed: `HEAD` = target, `git merge-base master HEAD` = base, spec SHA-256 matches, only `blueprint/context/review.md` differed from the target before this review.
- Delta reviewed in full: `api/src/admin/user-directory.ts`, `user-directory.test.ts`, `ui/src/app/administration/invite-form.{ts,html,spec.ts}`, `ui/src/app/core/supabase/supabase-auth.provider{,.spec}.ts`, plus `findings.md`, `project-overview.md`, `current-feature.md`.
- Callers followed: `invite`/`revoke`/`resend` and `serialized` in user-directory.ts; `invitation()`/`acceptInvitation` in the provider; `canSubmit` in `ui/src/app/auth/accept-invitation.ts`.
- F-106: `rollBack` treats a returned error and a rejection alike, logs the orphan id only server-side, and the original stamp error is still thrown.
- F-107: the same-organisation test would fail without `serialized` (the invite's `listUsers` would run during the held delete), and the two-organisation test would fail with a global queue. Checked by tracing the code; the reviewer cannot edit code, so no mutation run.
- F-108: `role="alert"` on the error plus `afterNextRender` focus with the component injector; the spec covers the already focused field.
- F-112: `isInvited` is used only for display; acceptance always writes a non-blank `full_name`; invites carry no user metadata.
- `project-overview.md` changes are a documentation refresh (20d listed, notes shortened) and do not touch code.

### Findings

- Closed: F-106, F-107, F-108, F-112 (all P2)
- New: None

### Remaining risk

- `/check` not run (not required): the screen-reader announcement and the accepted-invitee dead end were not seen in a real browser or with an assistive technology.
- F-107's "fails without the queue" claim was checked by tracing the code, not by a mutation run in this review.
- UI production bundle exceeds its 500 kB initial budget (warning only; this delta does not cause it).
- No lint command is declared in either package.
