# Fix: Tell the visitor when set password rejects their password

> **Generated file.** Holds the one feature, fix, or rollback being built right now.

**Type:** Fix
**Status:** verified
**Branch:** fix/tell-the-visitor-when-set-password-rejects-their-password
**Fixes:** F-93, F-96

## The problem

**F-93 [P3], `ui/src/app/core/supabase/supabase-auth.provider.ts:100`.**
`SupabaseAuthProvider.setPassword` maps a missing recovery session to `'denied'`
and rethrows every other error. `SetPassword` renders a rethrow as its outage
copy, "We could not set your password just now. Try again in a moment.", and
clears the field.

Supabase answers `updateUser({ password })` with `422` and one of two codes the
visitor can fix themselves:

- `same_password`: the new password is the one they already have.
- `weak_password`: the project's policy, for example leaked-password protection,
  is stricter than the screen's three rules.

Both are the visitor's to fix, and the screen tells them to wait. That inverts the
rule `signIn` already follows through `isRefusal`: a refusal is an answer, not an
error.

## The fix

Give `setPassword` a third kind of answer, a password the service refused, and
let the screen say so beside the field.

- `auth.provider.ts`: add `export type PasswordRejection = 'same-password' |
  'weak-password'`, and widen only `setPassword`'s result to
  `Session | AuthFailure | PasswordRejection`. `AuthFailure` itself does not
  change, so `signIn` and `acceptInvitation` and their callers are untouched.
- `supabase-auth.provider.ts`: match `error.code` (not the message, matching
  `isRefusal`) for `same_password` and `weak_password` and return the rejection.
  Missing-session codes stay `'denied'`; everything else still rethrows.
- `set-password.ts`: on a rejection, stay on the form, keep `state` at `'form'`,
  and set `problem` to the message below. The existing
  `aria-describedby="password-rules set-password-problem"` already ties it to the
  field. Clear the field, as the other refusal paths do.
- `FixtureAuthProvider.setPassword` keeps returning the session. The screen's
  spec already drives answers through its own `providerAnswering` stub.

Copy, written to the project's writing standard (no em dashes):

| Answer | Message |
|---|---|
| `same-password` | That is already your password. Choose a different one. |
| `weak-password` | That password is too easy to guess, or has appeared in a known data breach. Choose a different one. |

Must not break: the expired-link dead end on `'denied'`, the outage copy on
`'unavailable'` and on a thrown error, and sign-in's own refusal mapping.

## Build steps

- [x] **1. The provider recognises a rejected password.**
      Add `PasswordRejection` and map the two codes in
      `SupabaseAuthProvider.setPassword`.
      **Done when:** `supabase-auth.provider.spec.ts` covers `setPassword`
      answering `'same-password'` for `same_password`, `'weak-password'` for
      `weak_password`, `'denied'` for a missing session, and erroring for an
      unrecognised code; `npm test` passes in `ui/`.

- [x] **2. The screen says what to change.**
      Render each rejection's message on the form in `SetPassword`.
      **Done when:** `set-password.spec.ts` asserts each rejection keeps the form
      and shows its message, not the outage copy and not the expired state, and
      the existing `'denied'`, `'unavailable'` and thrown-error cases still pass;
      `npm test` and `ng build` pass in `ui/`.

## Verify

- `npm test` in `ui/`, green with the new provider and screen cases.
- Optional live check against the real project: request a reset for the test
  user, open the emailed link, and submit the current password. The form should
  read "That is already your password." This needs the project's redirect URL
  to allow `http://localhost:4202/set-password`.

## Notes

- **F-96 folded in during implementation.** Step 1's `setPassword` provider
  specs are the ones F-96 asked for. Two more cases from its suggested fix, any
  `401` answering `'denied'` and an unconfigured client raising, were added so it
  is fully covered rather than half.

## Findings

Resolved with this fix and archived from the live ledger. IDs carry the
archive prefix so they stay unique across the project history.

### tell-the-visitor-when-set-password-rejects-their-password/F-93 [P3] closed - Set password reports a rejected password as an outage

**File:** ui/src/app/core/supabase/supabase-auth.provider.ts:102
**Found:** 2026-10-05 by /audit independent (scope: current; lens: quality)
**Why it matters:** `setPassword` maps only missing-session errors to `'denied'` and
rethrows everything else, which the screen renders as "We could not set your
password just now. Try again in a moment." Supabase answers `422` with
`same_password` when the visitor reuses their old password, and `weak_password`
when the project's policy (for example leaked-password protection) is stricter than
the screen's three rules. Both are the visitor's to fix, and the screen tells them to
wait and clears the field. This is the inverse of the `isRefusal` rule `signIn`
follows. No spec covers either code.
**Suggested fix:** map `same_password` and `weak_password` to a field-level message
on the form, and add one provider spec per code.
**Resolution:** Fixed 2026-10-05 by /implement (fix/tell-the-visitor-when-set-password-rejects-their-password). New `PasswordRejection` (`same-password`, `weak-password`) widens only `setPassword`; the provider maps `same_password` and `weak_password` by code, and `SetPasswordPage` keeps the form with a message per rejection. Provider and screen specs cover both. Awaiting re-review. Closed 2026-10-05 by the independent review of `94a4f64`: `passwordRejection` (`supabase-auth.provider.ts:195`) maps both codes by `error.code` after the missing-session check, unrecognised codes still rethrow, and `set-password.ts:100` keeps state `form`, clears the field and sets `problem` (tied to the input by `aria-describedby`). Provider specs assert each code's exact answer and screen specs assert each message, the kept form and no sign-in; `npm test` 832/832.

### tell-the-visitor-when-set-password-rejects-their-password/F-96 [P3] closed - SupabaseAuthProvider.setPassword, the one real call the set-password screen makes, has no provider spec

**File:** ui/src/app/core/supabase/supabase-auth.provider.ts:89
**Found:** 2026-10-05 by /audit independent (scope: current; lens: tests)
**Why it matters:** `supabase-auth.provider.spec.ts` covers `signIn`, `requestPasswordReset` and the two fixture delegations, and never calls `setPassword` or stubs `updateUser`. `isSessionMissing` (`:168`) decides between the screen's expired-link dead end and its outage message, and the null-user and unconfigured branches are likewise unexercised. `set-password.spec.ts` drives the screen against a fake `AUTH`, so it cannot catch a wrong mapping here.
**Suggested fix:** add a `setPassword` describe with a stubbed `updateUser`: success maps the user, `status: 401` and `session_not_found` answer `'denied'`, an unrecognised code raises, and a null client raises.
**Resolution:** Fixed 2026-10-05 by /implement (fix/tell-the-visitor-when-set-password-rejects-their-password). `supabase-auth.provider.spec.ts` gains a `setPassword` describe with a stubbed `updateUser`: success maps the user, `session_not_found` and any `401` answer `denied`, both rejection codes, an unrecognised code raises, and a null client raises. Awaiting re-review. Closed 2026-10-05 by the independent review of `94a4f64`: every case in the suggested fix is present and asserts a concrete answer or rejection, and the `401` case uses a code (`bad_jwt`) that only the status branch of `isSessionMissing` can match. The `data.user === null` throw is still unexercised; it was named in Why it matters but not in the suggested fix, and is a one-line defensive branch, so it does not keep this open.

## Independent review

**Status:** passed
**Target commit:** 94a4f640491f248b79ed6c8fb8bbfdbf046163e0
**Base commit:** 780f49ad2033c67cfcab078329db7c453f94c168
**Base ref:** master
**Spec hash:** 8645a4cd9ca66c9a19c5610ecf35524fb07a4714c403b2e416384cd545501dbe
**Prepared by:** claude
**Builder model:** claude-opus-5-5
**Requested reviewer:** claude
**Requested model:** claude-opus-5-5
**Requested execution:** automatic
**Requested at:** 2026-10-05T08:42:02Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5-5
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-10-05T08:44:36Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

### Commands

- `git rev-parse HEAD`, `git merge-base master HEAD`, `sha256sum blueprint/context/current-feature.md`, `git status --porcelain`: pass (target, base and spec hash match; only `review.md` modified)
- `npm test` in `ui/`: pass (832 of 832)
- `ng build` in `ui/` (output to reviewer scratchpad): pass (pre-existing initial-bundle budget warning, 684 kB against 500 kB)
- `npm run test:browser` in `ui/` (port 4201): pass (12 of 12)

### Evidence

- `supabase-auth.provider.ts:105-113`: missing session is checked first, then `passwordRejection` matches `same_password` and `weak_password` by `error.code`; any other code still rethrows through `serviceFailure`, which carries no token.
- `auth.provider.ts:27`: `PasswordRejection` widens only `setPassword`; `AuthFailure`, `signIn` and `acceptInvitation` unchanged. `FixtureAuthProvider.setPassword` keeps its narrower return type, which remains assignable.
- `set-password.ts:100-106`: a rejection keeps state `form`, clears the field and sets `problem`, which `set-password.html` renders in `#set-password-problem` (`role="status"`, referenced by the input's `aria-describedby`). Copy matches the spec table and has no em dashes.
- `supabase-auth.provider.spec.ts` `setPassword` describe: success, both rejection codes, `session_not_found`, a `401` with an unrelated code, an unrecognised `500` and an unconfigured client, each asserting a concrete answer or rejection.
- `set-password.spec.ts`: each rejection asserts its exact message, the kept form and heading, a cleared field and no sign-in; the existing `denied`, `unavailable` and thrown-error cases are unchanged and green.
- No new network calls, loops or subscriptions; the request is one `updateUser` per submit, as before.

### Findings

- F-93 [P3] closed - Set password reports a rejected password as an outage
- F-96 [P3] closed - SupabaseAuthProvider.setPassword has no provider spec
- F-97 [P3] open - Resolution updated: the cited spec is now archived at `blueprint/history/features/14-authentication.md`
- No new findings in this delta

### Remaining risk

- The live Supabase answer for `same_password` and `weak_password` was not exercised; mapping is proven against stubbed `updateUser` only (the spec's optional live check was not run).
- The `data.user === null` branch in `setPassword` remains untested.
- Open P2 and P3 findings carried from earlier work are unchanged by this delta and do not block.
