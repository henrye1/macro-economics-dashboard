# Fix: Test that the session guard waits for hydration

> **Generated file.** Holds the one feature, fix, or rollback being built right now.

**Type:** Fix
**Status:** verified
**Branch:** fix/test-that-the-session-guard-waits-for-hydration
**Fixes:** F-95

## The problem

**F-95 [P2], `ui/src/app/auth/session.guard.ts:19`.** Feature 14 step 4 rewrote
`sessionGuard` to wait for `SessionStore.ready` before reading `signedIn()`.
Supabase restores a persisted session asynchronously, so a guard that decides
early bounces every signed-in visitor who reloads a tab to sign-in.

Nothing proves the wait. There is no `session.guard.spec.ts`, and no spec calls
`sessionGuard`. The only guard evidence is route specs whose stub `getSession()`
resolves at once, and the e2e signed-out deep link, which takes the redirect
branch either way. Reverting the guard to a synchronous `signedIn()` read, which
is the reload bounce, would keep every suite green. Feature 14's Testing section
promised "waits for hydration, allows a hydrated session, redirects with
returnUrl otherwise", and step 4's Done when claimed it.

## The fix

Add `ui/src/app/auth/session.guard.spec.ts`. Provide a stand-in `SessionStore`
whose `ready` is a promise the test settles by hand and whose `signedIn` is a
signal the test sets, and run the guard in an injection context with a real
`Router`.

Test-only. `session.guard.ts` does not change, and neither does `safeReturnUrl`,
which `sign-in.spec.ts` already covers. The stand-in must model the real store's
contract, `ready` settling once hydration has set `signedIn`, rather than
reaching into Supabase.

## Build steps

- [x] **1. Prove the guard waits, admits, and redirects.**
      Three cases:
      - While `ready` is unsettled, the guard's observable has emitted nothing.
      - After `ready` settles with `signedIn()` true, it emits `true`.
      - After `ready` settles with `signedIn()` false, it emits a `UrlTree` that
        serialises to `/sign-in?returnUrl=<encoded attempted url>`.

      **Done when:** `npm test` passes in `ui/`, and the first case fails when
      the guard is temporarily changed to read `store.signedIn()` without
      awaiting `ready`. Revert that change before checking the box.

## Verify

- `npm test` in `ui/`, which should be green with three new guard specs.
- The mutation check in step 1 is the proof that matters: the new spec must go
  red against the synchronous guard.
- No manual path. The behaviour it pins down, a signed-in reload staying on its
  tab, was observed live in feature 14 step 7.
