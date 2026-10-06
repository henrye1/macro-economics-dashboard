# Feature: Role assignment

**From build-plan:** feature 20b

**Branch:** `feature/role-assignment`

**Status:** verified

## Goal

An Administrator changes another person in their organisation between **Member**
and **Administrator** from the Users table on `/administration`. The API refuses:
- a change to your own role;
- a change to anyone outside your organisation;
- a change that would leave the organisation with no Administrator.

The new role is written to Supabase `app_metadata`, the only place roles are
read from.

## Design reference

`prototypes/administration.html`, the Users card:
- the `Change role` button on each row;
- the mid-edit row, with a role dropdown, `Cancel` and `Save role`;
- the caller's own row, which reads `You can't change your own role`.

The invitations card and invite form are 20c. No new theme token is needed.
Keep `prototypes/` until 20c's `/complete`.

## In scope

- **API:** `PUT /api/admin/users/:id/role`, on the existing `/api/admin/users`
  router, so it inherits `requireRole('Administrator')`, the `503` guard and the
  no-organisation `403`.
- **Directory:** gains `setRole(organisation, callerId, targetId, role)`. It
  re-reads the directory and enforces every rule under Data / contracts before
  writing.
- **UI:** an Actions column in the Users table, with one row editable at a time.
  It covers:
  - the saving state, a success confirmation and an error message;
  - a note on your own row instead of a button;
  - focus returning to the row's `Change role` button after Cancel or Save.

## Out of scope

- **Invitations** (20c).
- **Removing, disabling or renaming users.**
- **Roles other than `Member` and `Administrator`.**
- **Moving a user between organisations.**
- **Forcing the changed user's session to refresh.** The new role reaches their
  console when their token next refreshes (see Notes).
- **Bulk changes.**

## Build loop

`workflow.stepReview` is `feature`: build all steps, then present one review
packet. `checkpointCommits` is disabled. This changes who holds authority, so the
independent-review gate (`when-sensitive`) runs before `/complete`.

## Build steps

- [x] **1. Directory `setRole`.**
  - In `api/src/admin/user-directory.ts`, extend `AdminUsersClient` with
    `updateUserById(id, { app_metadata })`.
  - Add `setRole(organisation, callerId, targetId, role)` to `UserDirectory`.
  - The checks, in order:
    1. Read the whole directory, as `listOrganisation` already does.
    2. The caller must still be an `Administrator` in `organisation` in the
       directory. A token that is minutes stale must not keep authority after a
       demotion.
    3. The target must be in `organisation`.
    4. The target must not be the caller.
    5. If the change is Administrator to Member, at least one other
       Administrator must remain in `organisation`.
    6. When `role` already matches, return the user unchanged and do not write.
    7. Otherwise write `app_metadata` as the target's **full existing**
       `app_metadata` with only `role` replaced, so `organisation` and
       `provider` survive whether Supabase merges or replaces it.
  - Serialize `setRole` calls per organisation within the process with an
    in-memory promise chain. Without it, two Administrators demoting each other
    at the same moment could both pass check 5.
  - Each refusal throws a typed `RoleChangeError` with a `reason` of
    `'caller-not-admin' | 'not-found' | 'self' | 'last-admin'`. Any client
    error is rethrown as-is.
  - Extend `user-directory.test.ts` with a stub client covering:
    - each refusal;
    - the no-op;
    - preserved `app_metadata`;
    - a successful promote and demote, returning the mapped `AdminUser`;
    - two concurrent demotions of the last two other Administrators, where the
      second is refused;
    - a target in another organisation answering `not-found`, never
      `forbidden`.

  **Done when:** `npm test` and `npm run typecheck` pass in `api/`.

- [x] **2. Route.**
  - In `api/src/routes/admin.ts`, add `PUT /:id/role`.
  - Validate with Zod:
    - `:id` must be a UUID;
    - the body must be exactly `{ role: 'Member' | 'Administrator' }`, and
      unknown keys are stripped.
  - Map outcomes per Data / contracts: `RoleChangeError` reasons to fixed
    messages, anything else to `502` with one `console.error`.
  - Extend `admin.routes.test.ts`, running over `node:http` against a fake
    directory, covering:
    - success;
    - the no-op;
    - every refusal status and message;
    - `400` for a bad id, a bad role and a missing body;
    - a Member gets `403` and the directory is never called;
    - no session gets `401`;
    - no organisation gets `403`;
    - unconfigured gets `503`;
    - an organisation or caller id in the body or query is ignored, and only
      `req.auth.organisation` and `req.auth.userId` reach the directory.

  **Done when:** the tests pass, the existing API suite passes, and
  `npm run build` passes in `api/`.

- [x] **3. UI role editing.**
  - `ui/src/app/core/admin-directory.ts` gains
    `setRole(id, role): Observable<AdminUser>`.
  - In `administration.ts` and `.html`:
    - **Actions column.** Your own row (matched by email) shows
      `You can't change your own role`. Every other row has
      `Change role` (`outline-navy`).
    - **Editing.**
      - Clicking `Change role` puts that row into editing, and only one row
        edits at a time.
      - The row shows a labelled `<select>` with
        `aria-label="Role for <name>"`, preselected to the current role, plus
        `Cancel` and `Save role`.
      - Focus moves to the select.
      - `Save role` is disabled while the selection equals the current role and
        while saving.
    - **Saving.** `Save role` reads `Saving…` and the row's controls are
      disabled.
      - On success, the row shows the returned user and leaves editing.
      - A `role="status"` confirmation above the table reads
        `<name> is now <role>. It takes effect the next time their session refreshes.`
      - Focus returns to that row's `Change role`.
    - **Refusal or failure.** The row stays in editing with the selection kept,
      and `role="alert"` text inside the row shows the API's `{ error }`
      message. These are fixed server strings, rendered by interpolation. With
      no message, it shows `Could not change the role. Try again.`
    - **Cancel or Escape** (on the select) leaves editing, clears any row error
      and returns focus to `Change role`.
  - Extend `administration.spec.ts`, using `HttpTestingController`, to cover:
    - your row has no button;
    - edit, cancel and focus;
    - Save stays disabled until the role changes;
    - saving, then success with the row updated and the confirmation shown;
    - each refusal message (`409`, `403`, `404`) shown in the row;
    - a generic failure;
    - opening one row closes another.

  **Done when:** `npm test` and `npm run build` pass in `ui/`. Browser tests are
  not extended.

## Files / areas

- `api/src/admin/user-directory.ts` and its test
- `api/src/routes/admin.ts` and `api/src/routes/admin.routes.test.ts`
- `ui/src/app/core/admin-directory.ts`
- `ui/src/app/administration/administration.ts`, `.html`, `.scss` and spec

## Data / contracts

**Route:** `PUT /api/admin/users/:id/role` with the body
`{ "role": "Member" | "Administrator" }`.

- **Success:** `200 { data: AdminUser }`, the target after the change, in the
  same shape as `GET`.
- **No-op:** `200`, the target unchanged, and nothing is written.
- **Trusted inputs:** only `req.auth.organisation` and `req.auth.userId`. The
  role is resolved live from the directory, not from the token.

**Errors** use the shared `{ error }` shape with fixed strings. Only `role` and
`id` are read from the request.

| Status | When | Message |
| --- | --- | --- |
| `400` | Bad id or body | `The role change is not valid.` |
| `401` | No session | Seam or `requireRole` |
| `403` | Not an Administrator by token | `requireRole`'s message |
| `403` | No organisation | Existing message |
| `403` | `caller-not-admin` (the directory no longer says the caller is an Administrator) | `Your account is no longer an Administrator.` |
| `403` | `self` | `You can't change your own role.` |
| `404` | `not-found` (missing, or another organisation; deliberately the same) | `That person is not in your organisation.` |
| `409` | `last-admin` | `This would leave your organisation without an Administrator.` |
| `503` | Not configured | Existing message |
| `502` | Client failure | `The user directory could not be reached.` |

A `502` logs the cause once. No message ever names an organisation, a user or an
id.

**Write:** `updateUserById(targetId, { app_metadata: { ...existing, role } })`.
`user_metadata` is never touched.

**Concurrency:** one in-flight `setRole` per organisation per API process. The
API runs as one Render instance, so this closes the race for the deployed shape.
With more than one instance, the race comes back (see Notes).

## Testing

- `api/`, Vitest:
  - directory rules and concurrency against a stubbed admin client;
  - the route over HTTP against a fake directory.
- `ui/`, Karma: the page's edit flow with `HttpTestingController`.
- **No live evidence is claimed.** A live run needs `SUPABASE_SERVICE_KEY` and at
  least two Administrators in one organisation. Use `/check` afterwards.

## Notes for the AI

- The role in a caller's token can be up to an hour stale. Re-reading the
  caller's live role in step 1 is what stops a just-demoted Administrator from
  acting. Do not drop it as redundant with `requireRole`.
- Answer `404` for a target in another organisation, never `403`, so the
  response does not confirm the user exists elsewhere.
- Rule 4 (not yourself) runs after rule 3 (target in organisation) but before
  rule 5 (last Administrator). Even a self-change that would also orphan the
  organisation answers `self`.
- The changed user's console shows the old role until their Supabase session
  refreshes (up to the project's JWT expiry, one hour by default). The API also
  trusts the token's role at `requireRole`. A demoted Administrator therefore
  keeps read access to `GET /api/admin/users` until refresh. They lose the
  ability to change roles immediately, through rule 2. This is accepted for 20b
  and stated in the confirmation copy.
- Found while building: rules 2 and 4 make `last-admin` unreachable. The caller is a live Administrator and never the target, so demoting anyone else always leaves the caller. It stays as a backstop. Its route mapping is tested, and the directory test records why it cannot fire.
- The in-memory lock is per process. If the API ever scales past one instance,
  the last-Administrator check needs a database-side guard.
- `fullName` is user-writable. It appears in the confirmation and the select's
  `aria-label` through interpolation and attribute binding only.

## Independent review

**Status:** passed
**Target commit:** 4e203f2e2ae20b59b003f8ae364e016c8275e395
**Base commit:** 61d1e70fa4056b5d3891b5f3daaeb7f65d24ce04
**Base ref:** master
**Spec hash:** ece5b55eba8a62755d5b0bf32d9bfb011d9f03852727e084cec53755d06f28cd
**Prepared by:** claude
**Builder model:** claude-opus-5-5
**Requested reviewer:** claude
**Requested model:** claude-opus-5-5
**Requested execution:** automatic
**Requested at:** 2026-10-06T09:24:01Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5-5
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-10-06T09:40:00Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

### Commands

- `npm run typecheck` (api/): pass
- `npm test` (api/): pass, 11 files, 198 tests
- `npm run build` (api/): pass
- `npm test` (ui/): pass, 857 specs
- `npm run build` (ui/): pass (existing initial-bundle budget warning, under the 1MB error limit)

### Evidence

- Freshness: `HEAD` = target; `git merge-base master HEAD` = base; spec SHA-256 matches; only `blueprint/context/review.md` differed from the target before this review.
- Authorization: `PUT /:id/role` sits behind `requireRole('Administrator')`, the 503 guard and the no-organisation 403 (`api/src/routes/admin.ts:76-85,104-108`); the directory re-reads the caller's live role and refuses `caller-not-admin` (`api/src/admin/user-directory.ts:165-168`).
- Tenant boundary: only `req.auth.organisation` and `req.auth.userId` reach `setRole`; body and query extras are stripped and ignored (route test "trusts only the verified organisation and caller"); target outside the organisation answers `not-found` (404), never 403.
- Rule order matches spec: caller-not-admin, not-found, self, last-admin, no-op, write (`user-directory.ts:165-213`).
- Serialization: per-organisation promise chain (`user-directory.ts:137-152`) runs refusals and failures through without breaking the queue; the concurrent mutual-demotion test would fail without the lock (both writes would land).
- Write: `{ ...target.app_metadata, role }` read inside the lock; stub replaces `app_metadata` wholesale and the test asserts `provider` and `organisation` survive. `user_metadata` untouched.
- Errors: fixed strings only; 502 logs once and the response omits the client error text (route test asserts).
- UI: names rendered by interpolation and attribute binding only; API `{ error }` rendered by interpolation; own row matched by email shows the note and no button.

### Findings

- F-104 [P3] open: other rows' Change role stay enabled during an in-flight save; the reply closes or overwrites the row opened meanwhile.
- F-105 [P3] open: route suite lacks the no-op case that spec step 2 lists (covered at directory level).
- F-103 [P3] unverified: updated; `setRole` inherits the whole-project scan, failing safe on truncation.

### Remaining risk

- No live Supabase evidence: GoTrue's merge-vs-replace of `app_metadata` and its `per_page` cap were not exercised (spec claims none; `/check` was not required).
- The per-organisation lock is per process; a second API instance reopens the race (accepted in spec Notes).
- A demoted Administrator keeps `GET /api/admin/users` read access until token refresh (accepted in spec Notes).
- Browser tests not run (not extended by this feature, and not requested).
