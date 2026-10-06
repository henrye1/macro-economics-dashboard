# Feature: Admin page and user list

**From build-plan:** feature 20a

**Branch:** `feature/admin-page-and-user-list`

**Status:** verified

## Goal

An Administrator opens **Administration** from a new user menu in the topbar and
sees everyone in their own organisation. A Member who opens `/administration`
directly sees a short not-permitted card. The API serves the list from Supabase's
admin user directory, scoped to the caller's verified organisation, and only to
Administrators.

## Design reference

`prototypes/administration.html`, its Administrator view and its Member view.
Use only the topbar user menu, the page heading, the **Users** card and the Member
card. The role-edit row (20b) and the invitations card and invite form (20c) are
later features. The theme is already ported to `ui/src/styles.scss`, and no new
token is needed here. Keep `prototypes/` until 20c's `/complete`.

## In scope

- **Topbar user menu** in `ConsoleShell`. It replaces the current name, role and
  Sign out block.
  - The trigger shows the name and role.
  - The panel shows the name, then `email · organisation`.
  - The panel then shows **Administration**, for Administrators only.
  - Last comes **Sign out**.
- **`/administration`**, under the console shell and behind the existing
  `sessionGuard`.
  - No tab is active.
  - It shows the heading `Administration` and the organisation, plus a
    `Back to the console` link to `/overview`.
- **Users card:**
  - a table of Name, Email, Role and Last sign-in;
  - the caller's own row is marked `you`;
  - the meta line reads `N people in <organisation>`.
- **Member card**, for a non-Administrator session or a `403` from the API:
  `Administration is for administrators.` and
  `Ask an administrator in your organisation to change your role.`
- **API:** `GET /api/admin/users` behind `requireRole('Administrator')`, scoped
  to `req.auth.organisation`, read with the service role key.
- **Auth interceptor:** carries the token to `/api/admin`.

## Out of scope

- **Changing roles** (20b). There is no actions column yet.
- **Invitations** (20c): the invitations list, the invite form, and making the
  accept-invitation screen real.
- **Deleting, disabling or renaming users.**
- **Searching or paging the user list.** All users in the organisation are
  listed.
- **Anything on `/api/admin/macro/*`.** That is the Core API's admin surface and
  stays out of scope.

## Build loop

`workflow.stepReview` is `feature`: build every step, then present one review
packet. `checkpointCommits` is disabled. This is authorization and user data, so
the independent-review gate (`when-sensitive`) runs before `/complete`.

## Build steps

- [x] **1. API directory module.**
  - In `api/src/config.ts`, add `adminConfigured`. It uses the same predicate and
    settings as `savedQueriesConfigured`: `SUPABASE_URL` and
    `SUPABASE_SERVICE_KEY` must both be non-blank. Share one function and do not
    duplicate the check.
  - Add `api/src/admin/user-directory.ts` with:
    - a `UserDirectory` interface with `listOrganisation(organisation)`;
    - `createSupabaseDirectory(url, serviceKey)`, which pages through
      `auth.admin.listUsers({ page, perPage: 1000 })` until a page comes back
      short;
    - a pure `toAdminUser(user)` and a pure `inOrganisation(user, organisation)`.
  - Add `user-directory.test.ts` covering:
    - the mapping (`fullName` falls back to the part of the email before `@`,
      `role` goes through `resolveRole`, `lastSignInAt` comes back as an ISO
      string or `null`);
    - exact, case-sensitive organisation matching, with a missing or empty
      organisation never matching;
    - nothing outside the documented fields is returned;
    - paging across two pages, using a stubbed client.

  **Done when:** `npm test` and `npm run typecheck` pass in `api/`.

- [x] **2. API route.** Add `api/src/routes/admin.ts` and mount it at
  `/admin/users` in `routes/index.ts`. The order is:
  1. `requireRole('Administrator')`;
  2. a 503 guard for when admin is not configured;
  3. a 403 for a caller with no organisation;
  4. `GET /` returning `200 { data: AdminUser[] }`.

  Add `userDirectory?` and `adminConfigured?` to `ApiDeps`. Add
  `api/src/routes/admin.routes.test.ts`, run over `node:http`, covering:
  - an Administrator gets only their organisation's users, sorted;
  - the organisation passed to the directory is `req.auth.organisation` even
    when the query string names another;
  - a Member gets `403`;
  - no session gets `401`;
  - no organisation gets `403` with that fixed message;
  - an unconfigured service gets `503`;
  - a directory that throws gets `502`, the cause is logged once, and nothing
    about it is returned;
  - the real auth seam still guards the route (`401` or `503`, as in the saved
    queries test).

  **Done when:** those tests pass, the existing API suite passes unchanged, and
  `npm run build` passes in `api/`.

- [x] **3. UI user menu.**
  - In `auth.interceptor.ts`, add `/api/admin` to the authenticated prefixes.
  - In `ConsoleShell`, replace the `.account` block with the user menu above.
  - The trigger is a `<button>` with `aria-haspopup="menu"` and
    `aria-expanded`.
  - The panel uses `role="menu"`, and its links and button use
    `role="menuitem"`.
  - Opening moves focus to the first item.
  - **Escape** closes it and returns focus to the trigger. An outside click or a
    navigation closes it.
  - **Administration** is a `routerLink` to `/administration`. It renders only
    when `session().role === 'Administrator'` (exact). That is display only; the
    API enforces access.
  - **Sign out** keeps today's behaviour.
  - Style it with the existing `--cl-*` tokens in `console-shell.scss`.
  - Extend `console-shell.spec.ts` and `auth.interceptor.spec.ts`.

  **Done when:** specs prove:
  - the menu opens and closes;
  - focus moves in and back;
  - Administration shows for an Administrator and is absent for a Member or a
    session with no role;
  - Sign out still signs out;
  - the token is attached to `/api/admin/users`.

  `npm test` passes in `ui/`.

- [x] **4. UI Administration page.**
  - Add `ui/src/app/administration/administration.ts`, `.html`, `.scss` and
    `.spec.ts`.
  - Add `ui/src/app/core/admin-directory.ts`, an `HttpClient` service with
    `users(): Observable<AdminUser[]>`.
  - Add the `administration` route under `ConsoleShell` in `app.routes.ts`.
  - The page's states:
    - **Member:** a session whose role is not `Administrator` shows the Member
      card and sends no request.
    - **Loading:** `Loading users…` (`role="status"`).
    - **Ready:** the table, sorted as the API returns it. Dates show as
      `YYYY-MM-DD` and a `null` sign-in shows `Never`. The caller's row is
      matched by email and marked `you`.
    - **Empty** (cannot happen for a real caller, but handled):
      `No users in <organisation> yet.`
    - **Forbidden (`403`):** the Member card when the API says the caller is not
      an Administrator. The no-organisation `403` shows its own message in the
      Users card.
    - **Failed (other errors):** `Could not load users.` (`role="status"`).

    A `401` is already handled by the interceptor.
  - Every name and email is rendered by interpolation only. `fullName` is
    user-writable `user_metadata`.
  - `administration.spec.ts` uses `HttpTestingController` and covers each state.

  **Done when:** `npm test` and `npm run build` pass in `ui/`. Browser tests are
  not extended.

## Files / areas

- `api/src/config.ts` and its test; `api/src/admin/user-directory.ts` and its test (new)
- `api/src/routes/admin.ts`, `api/src/routes/admin.routes.test.ts` (new); `api/src/routes/index.ts`
- `ui/src/app/core/http/auth.interceptor.ts` and its spec
- `ui/src/app/shell/console-shell.ts`, `.html`, `.scss` and spec
- `ui/src/app/core/admin-directory.ts` (new); `ui/src/app/administration/` (new); `ui/src/app/app.routes.ts`

## Data / contracts

**`AdminUser`** is the only shape the API returns:

| Field | Type | Source |
| --- | --- | --- |
| `id` | string (uuid) | Supabase user id |
| `email` | string | `user.email`, `''` if absent |
| `fullName` | string | `user_metadata.full_name` when it is a non-empty string, otherwise the email before `@`. Display only. |
| `role` | `'Administrator' \| 'Member'` | `resolveRole` over `app_metadata.role` |
| `lastSignInAt` | ISO string or `null` | `last_sign_in_at`, re-serialized with `toISOString()` |

- Nothing else from the Supabase user, including any other metadata, is
  returned.
- **Scope:** a user is listed only when `app_metadata.organisation` equals the
  caller's `req.auth.organisation` exactly. Both must be non-empty strings.
- **Sort:** `fullName` ascending (`localeCompare`), then `email`.

**Route:** `GET /api/admin/users` returns `200 { data: AdminUser[] }`. It takes no
parameters, and any query string is ignored.

**Errors** use the shared `{ error }` shape with fixed strings:

| Status | When | Message |
| --- | --- | --- |
| `401` | No session | From the seam or `requireRole` |
| `403` | Not an Administrator | `This account does not have permission for this request.`, from `requireRole` |
| `403` | No organisation | `This account has no organisation to administer.` |
| `503` | Not configured | `Administration is not configured on this service.` |
| `502` | Directory failure | `The user directory could not be reached.` |

On a `502`, the caught error is logged with `console.error` and never returned.
The service key is never logged.

**UI role check:** the user menu and page show admin UI only for
`Session.role === 'Administrator'`, exactly the rule `resolveRole` uses. The UI
check only decides what to show. The API is the boundary.

## Testing

- `api/`, Vitest:
  - the directory mapping, organisation filter and paging, against a stubbed
    admin client;
  - the routes over HTTP, against a fake `UserDirectory`;
  - one test with the real auth seam.

  No live Supabase.
- `ui/`, Karma:
  - the shell menu (open and close, focus, admin-only item, sign out);
  - the interceptor prefix;
  - each page state, with `HttpTestingController`.
- **No live evidence is claimed.** A live run needs `SUPABASE_SERVICE_KEY` set,
  plus an Administrator account whose `app_metadata` has `role` and
  `organisation`. Use `/check` after that.

## Notes for the AI

- The organisation comes only from the verified token (`req.auth.organisation`),
  never from the request.
- The service role key lists every user in the project, so the organisation
  filter is the tenant boundary. Test it as one.
- `user_metadata.full_name` is writable by the user. Show it, never trust it, and
  never use it to match the `you` row; use email instead.
- Unconfirmed or invited users also appear in `listUsers`. 20a lists them like
  anyone else in the organisation, and 20c decides how pending invitations
  display.
- `requireRole` already answers `401` with no `req.auth`. The no-organisation
  check comes after it, so an anonymous caller never learns about organisations.
- Feature 20c will need a 7-day invitation lifetime. Supabase's invite link
  usually expires much sooner. That is 20c's problem, so don't design for it
  here.

## Independent review

**Status:** passed
**Target commit:** 9e36bbf1f43df823bd45761e9ce89f34c71a2372
**Base commit:** 0c88b573debf7f2554da33e7063c7f18eea193d7
**Base ref:** master
**Spec hash:** dbef5053a4e3ac6dcf4af3831ba5578c7de951a253ab76cc9921cea120f59752
**Prepared by:** claude
**Builder model:** claude-opus-5-5
**Requested reviewer:** claude
**Requested model:** claude-opus-5-5
**Requested execution:** automatic
**Requested at:** 2026-10-06T09:00:42Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5-5
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-10-06T09:03:21Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

### Commands

- `api: npm run typecheck`: pass
- `api: npm test`: pass (11 files, 172 tests)
- `api: npm run build`: pass
- `ui: npm test`: pass (845 specs)
- `ui: npm run build`: pass (initial bundle budget warning, 698 kB vs 500 kB)

### Evidence

- Freshness: HEAD = target, `git merge-base master HEAD` = base, spec SHA-256 matches, only `blueprint/context/review.md` dirty before review.
- Full delta reviewed: 20 files, `0c88b57..9e36bbf` (API directory, admin route, config, routes index, UI shell menu, interceptor, administration page, admin directory service, routes, specs, plan and spec).
- Tenant boundary: `routes/admin.ts` passes only `req.auth.organisation` (from the verified JWT `app_metadata`) to the directory; `inOrganisation` is exact, case-sensitive on `app_metadata.organisation` and refuses empty on either side; query string ignored (tested).
- Authorization order: global auth seam, then `requireRole('Administrator')`, then 503 guard, then no-organisation 403, then the directory; anonymous 401 and Member 403 never reach the directory (tested).
- Data exposure: `toAdminUser` returns only id, email, fullName, role, lastSignInAt (tested with extra fields); 502 logs the cause once and returns a fixed string (tested); service key never logged.
- UI: names and emails rendered by interpolation only (markup-escape spec); `you` matched by email; admin UI shown only for exact `Administrator`; interceptor adds `/api/admin`; dev proxy and Render `/api/*` rewrite cover the new route.
- No focused or skipped tests in the new specs.

### Findings

- F-101 [P3] open: account menu uses `role="menu"` without arrow-key navigation and with a non-item child.
- F-102 [P3] open: admin real-seam test passes with the seam unmounted (same weakness as F-100).
- F-103 [P3] unverified: every load scans the whole project's users; paging stop assumes GoTrue honours perPage 1000.

### Remaining risk

- No live Supabase evidence: a real Administrator with `app_metadata.role` and `organisation` and `SUPABASE_SERVICE_KEY` was not exercised; `/check` not run (not required).
- Browser tests (`ui: npm run test:browser`) not run and not extended for the menu or page.
- No lint command is configured in either package.
- Organisation membership is keyed on a free-text name in `app_metadata`; two tenants given the same string would share a directory (design choice of the spec, not tested live).
- Role and organisation come from the access token, so a changed role takes effect only at token refresh.
- Pre-existing UI bundle budget warning remains.
