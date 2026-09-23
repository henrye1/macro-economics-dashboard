# Fix: Close the four findings feature 19 left open

> **Generated file.** Holds the one feature, fix, or rollback being built right now.

**Type:** Fix
**Status:** verified
**Branch:** fix/close-the-four-findings-feature-19-left-open
**Fixes:** F-86, F-87, F-88, F-89

## The problem

The second independent review of feature 19 passed and raised four entries
against the auth screens. None blocks, all four are small, and all four sit in
the same corner of the code, so they travel better as one branch than as four.

**F-86 [P2], `ui/src/app/auth/session.guard.ts:43`.** `safeReturnUrl` inspects
the second character to reject `//evil.test` and `/\evil.test`. The URL parser
strips ASCII tab, newline and carriage return *before* parsing, so the character
it inspects is not the character the parser sees: `new URL('/\n/evil.test',
base).href` resolves to `http://evil.test/`, and the router hands back exactly
that string from `?returnUrl=%2F%0A%2Fevil.test`.

The reviewer verified there is no live open redirect, because `navigateByUrl`
never leaves the origin whatever it is given. The defect is the comment the last
repair added, which claims the guarantee "lives in this function rather than in
the router's wildcard". It does not, and the next person to add a real 404 page
or to pass this result to `location.assign` finds out the expensive way.

**F-87 [P2], `ui/src/app/auth/sign-in.ts:84` and `accept-invitation.ts:118`.**
The spec put denied and unexpected-error states in scope for every screen.
`FixtureAuthProvider.signIn` and `acceptInvitation` can neither error nor answer
`'unavailable'`, so three branches are unreachable and asserted nowhere.
Reset-password has `FIXTURE_UNREACHABLE_EMAIL` for exactly this; the other two
have no equivalent. Feature 14 makes those branches the common paths, which is
the wrong moment to discover they were never run.

**F-88 [P3], `ui/src/app/auth/accept-invitation.html:46`.** The message
paragraph declares `id="accept-problem"` and no input points at it. The two
forms beside it wire theirs, and the spec asks for each field to be associated
with its message.

**F-89 [P3], `ui/src/app/core/password-rules.ts:37`.** `passwordMeetsRules` has
no caller outside its own spec, while `accept-invitation.ts:58` asks the same
question a second way with `ruleList().every(...)`. Two answers to one question
drift apart.

## The fix

**F-86.** Reject the three stripped characters before the positional test, and
correct the comment to say what the function actually guarantees. Add the forms
to the hostile list in `sign-in.spec.ts` so a later change cannot quietly lose
it.

**F-87.** Give the fixture one reachable failure per form, shaped like the one
reset already has: an address whose `signIn` errors, and a token that resolves
as valid and is then refused on acceptance. Assert both messages. This also
gives the `'unavailable'` arm of `AuthFailure` a producer, which it currently
lacks.

**F-88.** Point the password input's `aria-describedby` at the message, joined
with the rules list it already references.

**F-89.** Gate on `passwordMeetsRules` at `accept-invitation.ts:58` rather than
re-deriving the answer. One helper, one caller, no drift. Do not delete it: the
screen needs the question answered and the helper is where that belongs.

**Must not break.** The dead-end screens keep the markup and the button F-80 put
there. The fixture's existing tokens and credential keep working, because
`signed-in-session.ts` and the browser suite both read them. Nothing changes for
a visitor who types the right things.

## Build steps

- [x] **1. Repair all four.** They touch four files and share one suite, so
      splitting them would produce four diffs each needing the same review
      context.
      *Done when:* `safeReturnUrl` rejects the tab, newline and carriage-return
      forms and its comment matches what it does; the fixture has one reachable
      failure per form and a spec asserts each message; the accept form's
      password input describes both its rules and its message; the accept screen
      gates on `passwordMeetsRules`; and `npm test` and `npm run test:browser`
      are green in `ui/`.
      *Built:* 772 specs, up from 769. F-87 took two fixture inputs rather than
      one: `FIXTURE_FAILING_EMAIL` makes `signIn` error, and
      `FIXTURE_REFUSED_TOKEN` resolves as a valid invitation and is then refused
      on acceptance, which is the shape an administrator revoking an invitation
      mid-flow actually has. The second is what gives `'unavailable'` a producer;
      before this it was a type nothing could return.

## Verify

`npm test` in `ui/` is the gate, and every claim above is assertable there.
`npm run test:browser` proves nothing new for this fix but must stay green,
since the guard and the fixture session are what four of its cases rest on.

Manually: open `/accept-invite/valid-token`, set a name and a password that
fails one rule, and confirm the button stays disabled and the message is reached
through the password field. Then sign in with the new failing address and
confirm the unavailable wording rather than the denied wording.

## Findings

None resolved with this fix. F-86 to F-89 are all `fixed` rather than `closed`:
the repairs exist and are tested, but no review has looked at them, so they stay
in the live ledger for a later `/audit` to close. All four are P2 or P3, which is
why they do not block completion.
