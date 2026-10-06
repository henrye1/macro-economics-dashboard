# Feature: Roles

**From build-plan:** feature 15

**Branch:** `feature/roles`

**Status:** verified

## Goal

Give the API one way to say "this route needs this role", composed on top of the
verified `AuthContext` that feature 14's auth seam already produces. Feature 20's
admin routes become its first users. No route is gated in this feature.

## In scope

- Two product roles, `Administrator` and `Member`, defined once in the API.
- A pure resolver from `AuthContext` to a role:
  - an exact `Administrator` in `app_metadata.role` resolves to `Administrator`;
  - anything else resolves to `Member`, including no role, an empty string, an
    unknown name, or a case variant.
- A `requireRole(role)` Express middleware that admits or refuses a request through
  the shared `errorHandler`.
- Ranking: `Administrator` satisfies `Member`, and `Member` never satisfies
  `Administrator`.
- Vitest coverage of the resolver, the middleware and its HTTP response shape.

## Out of scope

- Gating any existing route. `/api/health` and the five `/api/macro/*` read routes
  stay exactly as they are today: any verified session can read.
- Admin routes, user lists, invitations and role assignment (feature 20).
- Any UI change. The shell keeps showing `app_metadata.role` as it does now, and
  it shows nothing when the role is absent.
- Writing roles. They are set only in Supabase `app_metadata` by an administrator,
  outside this app.
- Saved-query accounts (16) and the `/api/admin/macro/*` surface.

## Build loop

`workflow.stepReview` is `feature`, so build both steps, then present one review
packet. `checkpointCommits` is disabled. `/complete` makes the single feature
commit.

## Build steps

- [x] **1. Role model and resolver.** In `api/src/middleware/roles.ts`, add:
  - `ROLES = ['Member', 'Administrator'] as const` and `type Role`, in rank order;
  - `resolveRole(auth: AuthContext): Role`, which applies the rules under In scope;
  - `satisfies(held: Role, required: Role): boolean`, which compares rank.

  Add `roles.test.ts` beside it.
  **Done when:** `npm test` in `api/` passes cases for `Administrator`, `Member`,
  a `null` role, an unknown name such as `Owner`, the case variant `administrator`,
  and all four `satisfies` pairs. `npm run typecheck` is clean.
- [x] **2. `requireRole` middleware.** In the same module, add
  `requireRole(required: Role): RequestHandler`:
  - no `req.auth` → `next(error)` with status `401` and the auth seam's existing
    fixed message, `This request carried no valid session.`;
  - a resolved role below `required` → status `403` and the fixed message
    `This account does not have permission for this request.`;
  - otherwise `next()` with no argument.

  The error carries `status` the way `AuthError` does, so `errorHandler` returns
  `{ error }`. Extend `roles.test.ts` with direct middleware cases. Add one
  HTTP-level case: a throwaway Express app in the test sets `req.auth`, mounts
  `requireRole('Administrator')` on one route, and ends with `errorHandler`. Drive
  it over `node:http` the way `macro.routes.test.ts` does.
  **Done when:** tests show `401`, `403` and pass-through, each with the exact
  `{ error }` body and nothing else. `npm test` and `npm run typecheck` in `api/`
  pass, and existing auth and macro route tests still pass unchanged.

## Files / areas

- `api/src/middleware/roles.ts` (new)
- `api/src/middleware/roles.test.ts` (new)
- `api/src/middleware/auth.ts`: only if the `401` message is exported for reuse
  instead of duplicated. The `AuthContext` shape is not widened.
- No changes to `api/src/app.ts`, `api/src/routes/*` or `ui/`.

## Data / contracts

- **Role source:** only `AuthContext.role`. That comes from signature-verified
  `app_metadata.role`, never `user_metadata` or the token's top-level `role`
  (which is always the Postgres role, `authenticated`).
- **Matching:** exact and case-sensitive. Fail-safe: anything unrecognised gets
  the least privilege, `Member`.
- **Error shape:** `errorHandler`'s existing `{ error: string }` with status `401`
  or `403`. Messages are fixed strings. Never interpolate the role, user id, email
  or path.
- **Ordering:** `requireRole` runs after the auth seam, per route, as
  `router.get(path, requireRole('Administrator'), handler)`. It never replaces the
  seam.
- **`/api/health`** stays open and must never get a `requireRole`.

## Testing

- Vitest, `api/` only: `api/src/middleware/roles.test.ts`. The resolver and rank
  are pure functions. The middleware is tested both directly and once over HTTP to
  pin the response shape through the real `errorHandler`.
- No UI tests and no browser tests: nothing visible changes.
- No live Supabase evidence is claimed. Roles reach the API through the
  already-tested `toAuthContext`.

## Notes for the AI

- Feature 14's comment in `auth.ts` says role checks must not widen
  `AuthContext`. Keep `resolveRole` a function over it, and do not add a resolved
  role to `req.auth`.
- A `requireRole` path that calls `next()` without an error on a refusal would
  silently undo authorization. Test every refusal branch.
- With no gated route, nothing in the running app changes. That is the expected
  result, not a gap.

## Independent review

**Status:** passed
**Target commit:** 1f708e43ff173e6a6336fedcd0f17ffd6dad710a
**Base commit:** 9852bd907c5a3abeb5175f194442819140be76c7
**Base ref:** master
**Spec hash:** 4ab7ea6588c2e99d8f467a4f6958fbc9248e89afc37e982dd1aeceb1677d3e0b
**Prepared by:** claude
**Builder model:** claude-opus-5-5
**Requested reviewer:** claude
**Requested model:** claude-opus-5-5
**Requested execution:** automatic
**Requested at:** 2026-10-06T07:45:21Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5-5
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-10-06T07:47:00Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

### Commands

- `npm run typecheck` (api/): pass
- `npm test` (api/): pass, 7 files, 114 tests
- `npm run build` (api/): pass

### Evidence

- Freshness: `HEAD` = target, `git merge-base master HEAD` = base, spec SHA-256 matches, only `blueprint/context/review.md` differs from target.
- Delta is 4 files: `api/src/middleware/roles.ts` (new), `roles.test.ts` (new), `auth.ts` (exports `NO_SESSION` only, `AuthContext` not widened), `current-feature.md`. No change to `app.ts`, `routes/*` or `ui/`, as the spec requires.
- `resolveRole` reads only `AuthContext.role` (from `app_metadata` via `toAuthContext`), exact case-sensitive match, fails safe to `Member`.
- `requireRole`: every refusal goes through `next(error)` with a fixed-string message and `status`; no role, id, email or path is interpolated; `errorHandler` relays `{ error }` only. Missing `req.auth` (e.g. if ever mounted on open `/api/health`) fails closed with 401.
- Tests: direct cases assert exactly one `next` call and no response writes on every branch; HTTP cases assert exact `{ error }` bodies for 401 and 403 and pass-through 200. A refusal that called `next()` bare would fail these.
- Performance: constant-time checks over a two-element tuple; no I/O.

### Findings

- None new. F-98 (P2, open) re-examined: this delta gates no route, so it stays open.

### Remaining risk

- `/check` not run (not required; no route is gated, so no running-app behavior changes).
- No live Supabase token carrying `app_metadata.role` was exercised; role arrival relies on the existing `toAuthContext` tests.
- No lint command is configured in `api/`.
