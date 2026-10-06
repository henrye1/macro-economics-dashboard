# Feature: Invitations

**From build-plan:** feature 20c

**Branch:** `feature/invitations`

**Status:** verified

## Goal

An Administrator invites someone to their organisation by email and role, sees
who is still waiting, and can revoke or resend an invitation. Supabase sends the
email (`auth.admin.inviteUserByEmail`). A pending invitation **is** the invited
Supabase user who has not yet accepted. There is no invitations table: the
user's `app_metadata` and `invited_at` hold everything the card shows.

## Design reference

`prototypes/administration.html`: the **Invitations** card (with its revoked
confirmation) and both drawings of the **Invite someone** form, the
invalid-email one and the after-sending one. Port the prototype's
`--invalid` and `--invalid-bg` tokens into `ui/src/styles.scss` before the form
uses them. `/complete` of 20d discards `prototypes/`; keep it for now.

## In scope

- **API** (all on a new `/api/admin/invitations` router):
  - list pending invitations;
  - issue;
  - revoke;
  - resend.
- **Directory:**
  - `listInvitations`, `invite`, `revoke` and `resend`, with the same live
    caller check as `setRole`;
  - pending invitees no longer appear in `listOrganisation` (the Users list).
- **Config:**
  - `CONSOLE_URL`, the console origin the invite link returns to;
  - `INVITE_LINK_TTL_HOURS`, which must match the project's email link expiry
    and is used only to show **Expires** and **Expired**.
- **UI:**
  - the Invitations card, with loading, empty, failed and ready states and
    Revoke and Resend;
  - the Invite someone form: an email field with a field-level error, a role
    choice, a sending state, a confirmation and a refusal message.

## Out of scope

- **The accept-invitation screen** (20d). Until 20d lands, the emailed link
  arrives at `/accept-invite`, which no route matches yet, so the console's
  wildcard sends it to `/overview`. 20d adds the route.
  - Nothing here is pushed or deployed before 20d.
- **An invitations table, our own tokens, and our own email sending.**
- **Inviting someone who already has an account**, in any organisation. This is
  refused.
- **Bulk invites, and messages in the email.** The email is Supabase's invite
  template.

## Build loop

`workflow.stepReview` is `feature`: build all steps, then present one review
packet. `checkpointCommits` is disabled. This creates and deletes accounts and
sends email, so the independent-review gate (`when-sensitive`) runs before
`/complete`.

## Build steps

- [x] **1. Config and directory: pending invitees.**
  - `src/config.ts`:
    - add `consoleUrl`, from `CONSOLE_URL`, default `http://localhost:4200`,
      with any trailing slash trimmed;
    - add `inviteLinkTtlHours`, from `INVITE_LINK_TTL_HOURS`, default `24`.
      Fall back to the default when the value is not a positive number.
    - add both to `.env.example`, and add both to `render.yaml`:
      `CONSOLE_URL` is `https://macro-economics-console.onrender.com` and
      `INVITE_LINK_TTL_HOURS` is `"24"`.
  - In `user-directory.ts`:
    - add a pure `isPendingInvitee(user)`: it has `invited_at`, and has neither
      `email_confirmed_at` nor `last_sign_in_at`;
    - add a pure `toInvitation(user, invitedByName, ttlHours, now)`;
    - `listOrganisation` excludes pending invitees;
    - add `listInvitations(organisation)`: the pending invitees in the
      organisation, newest first. `invitedBy` is the inviter's `fullName` when
      that inviter is in the same organisation, otherwise `''`.

  Add tests for the predicate, the mapping (with the clock injected),
  pending versus expired at the boundary, the Users list no longer showing
  invitees, the config parsing, and tenant scoping.
  **Done when:** `npm test` and `npm run typecheck` pass in `api/`.

- [x] **2. Directory: invite, revoke, resend.**
  - `AdminUsersClient` gains:
    - `inviteUserByEmail(email, { redirectTo })`;
    - `deleteUser(id)`.
  - All three operations run inside the existing per-organisation queue and
    re-check the caller live (`caller-not-admin`), as `setRole` does.
  - **`invite(organisation, callerId, email, role)`:**
    1. An email already on any user in the project gives a refusal of
       `'already-registered'`.
    2. Otherwise call `inviteUserByEmail` with
       `redirectTo = ${consoleUrl}/accept-invite`.
    3. Then call `updateUserById` with
       `app_metadata { ...existing, role, organisation, invited_by: callerId }`.
    4. If that update fails, `deleteUser` the new user, which never leaves an
       invitee without an organisation, and rethrow.
  - **`revoke(organisation, callerId, id)`:** the target must be a pending
    invitee in `organisation`, otherwise `not-found`. Then call `deleteUser(id)`.
  - **`resend(organisation, callerId, id)`:**
    1. The target must be a pending invitee in `organisation`, otherwise
       `not-found`.
    2. Delete it, then invite again with the same email and role, and with the
       caller as the new inviter.
    3. The new user has a new id. Return the new invitation.

    The old link dies with the deleted user.
  - A Supabase rate-limit error (`status === 429`) becomes the refusal
    `'rate-limited'`. Every other client error is rethrown.
  - Extend `RoleChangeRefusal`, or add a sibling type, with
    `'already-registered' | 'rate-limited'`.
  - Add tests with a stateful stub covering:
    - each refusal;
    - the rollback when the metadata update fails;
    - preserved metadata;
    - resend replacing the invitee;
    - revoke and resend refusing confirmed users and other organisations
      (`not-found`);
    - the queue serialising an invite against a revoke.

  **Done when:** `npm test` and `npm run typecheck` pass in `api/`.

- [x] **3. Routes.**
  - Add `api/src/routes/invitations.ts`, mounted at `/admin/invitations` in
    `routes/index.ts`, with the same guards as `/admin/users`:
    `requireRole('Administrator')`, then `503`, then no organisation `403`.
  - Its routes are `GET /`, `POST /`, `DELETE /:id` and `POST /:id/resend`.
  - Validate with Zod:
    - `email`: trimmed, lowercased, `z.email()`, at most 254 characters;
    - `role`: the enum;
    - `:id`: a UUID.
  - Share the `REFUSALS` map, and its fixed messages, with `admin.ts`.

  Add `api/src/routes/invitations.routes.test.ts`, run over `node:http`, with
  the same coverage pattern as `admin.routes.test.ts`:
  - success for each route;
  - every refusal status and message;
  - `400`s;
  - Member, no session, no organisation, unconfigured, `502`;
  - only verified claims reach the directory;
  - the real seam mounted.

  **Done when:** those tests pass, the existing API suite passes, and
  `npm run build` passes in `api/`.

- [x] **4. UI: Invitations card.**
  - `admin-directory.ts` gains `invitations()`, `invite(email, role)`,
    `revoke(id)` and `resend(id)`.
  - In `administration.ts`, `.html` and `.scss`, add an **Invitations** card
    below Users, for Administrators only, loaded independently of the Users
    list. It shows:
    - `Loading invitations…`;
    - `No invitations waiting.`;
    - `Could not load invitations.`;
    - otherwise a table of Email, Role, Sent, Expires, Status and Actions.
  - **Status** is a `Pending` badge (`badge latest`) or an `Expired` badge
    (`badge superseded`). **Expires** shows `YYYY-MM-DD HH:mm` UTC, because a
    24-hour link needs the time.
  - **Actions:**
    - pending rows have `Revoke`;
    - expired rows have `Resend` and `Revoke`;
    - one action runs at a time per row, and the row's buttons are disabled
      while it runs.
  - **Revoke** asks first, with an inline confirm in the row:
    `Revoke the invitation to <email>?` with `Revoke` and `Keep`.
    - On success the row disappears, and a `role="status"` line above the table
      reads `Revoked the invitation to <email>. That link no longer works.`
  - **Resend** replaces the row with the new invitation and confirms
    `Sent a new invitation to <email>. The old link no longer works.`
  - A refusal or failure shows the API's fixed message in the row
    (`role="alert"`), or `Could not update the invitation. Try again.`
  - Spec tests use `HttpTestingController` and cover each state, the confirm
    step, and success and failure for both actions.

  **Done when:** `npm test` passes in `ui/`.

- [x] **5. UI: Invite form.**
  - Port `--invalid` and `--invalid-bg` into `ui/src/styles.scss`, mapped to the
    existing error token.
  - Add an **Invite someone** card beside the stack, as the mockup's right
    column, stacking on narrow screens. It has:
    - a labelled email input (`type="email"`, `autocomplete="off"`);
    - a role radio group (`Member` is preselected), built with
      `role="radiogroup"` and `aria-labelledby`;
    - a `Send invitation` button;
    - the hint
      `They get an email with a link to set a password. The link expires after <N> hours.`
  - `N` comes from a new `expiresInHours` field on `GET /api/admin/invitations`
    (`{ data, expiresInHours }`), so the UI never guesses.
  - **Client check on submit:** the email is empty or has no `@` followed by a
    `.`. The input gets `aria-invalid="true"` and `aria-describedby` pointing at
    the error `Enter a full email address, like name@company.co.za.`, and focus
    moves to the input. Editing the field clears the error.
  - **Sending:** the button reads `Sending…` and the form is disabled.
  - **Success:**
    - the form clears and keeps the role;
    - `role="status"` reads
      `Invitation sent to <email> as <role>. It expires on <YYYY-MM-DD HH:mm> UTC.`;
    - the new invitation appears at the top of the Invitations card.
  - **Refusal:** the API's message shows (`role="alert"`) and the input is kept.
    For example:
    - `This email address can't be invited.` (409);
    - `Too many invitations have been sent. Try again later.` (429).
  - Spec tests cover each of these, plus focus, the error association and its
    clearing.

  **Done when:** `npm test` and `npm run build` pass in `ui/`. Browser tests are
  not extended.

## Files / areas

- `api/src/config.ts` and its test, `api/.env.example`, `render.yaml`
- `api/src/admin/user-directory.ts` and its test
- `api/src/routes/invitations.ts` and `invitations.routes.test.ts` (new); `api/src/routes/admin.ts` (shared refusals); `api/src/routes/index.ts`
- `ui/src/styles.scss` (two tokens), `ui/src/app/core/admin-directory.ts`
- `ui/src/app/administration/administration.ts`, `.html`, `.scss` and spec

## Data / contracts

**`Invitation`** is the only shape the API returns for an invitation:

| Field | Type | Source |
| --- | --- | --- |
| `id` | uuid | The invited user's id |
| `email` | string | `user.email` |
| `role` | `'Administrator' \| 'Member'` | `resolveRole(app_metadata.role)` |
| `invitedBy` | string | The `fullName` of `app_metadata.invited_by` when they are in the same organisation, else `''` |
| `sentAt` | ISO string | `invited_at` |
| `expiresAt` | ISO string | `sentAt` + `inviteLinkTtlHours` |
| `status` | `'pending' \| 'expired'` | `now < expiresAt` gives `pending` |

**Routes**, all on `/api/admin/invitations` and all Administrator-only:

| Route | Body | Success |
| --- | --- | --- |
| `GET /` | none | `200 { data: Invitation[], expiresInHours: number }`, newest first |
| `POST /` | `{ email, role }` | `201 { data: Invitation }` |
| `DELETE /:id` | none | `204` |
| `POST /:id/resend` | none | `201 { data: Invitation }`. The `id` is new. |

**Errors** use the shared `{ error }` shape with fixed strings. None names a
person, an email, an organisation or an id.

| Status | Reason | Message |
| --- | --- | --- |
| `400` | Bad body or id | `The invitation is not valid.` |
| `403` | `caller-not-admin` | `Your account is no longer an Administrator.` |
| `404` | `not-found` (no such pending invitation in your organisation) | `That invitation is not in your organisation.` |
| `409` | `already-registered` | `This email address can't be invited.` |
| `429` | `rate-limited` | `Too many invitations have been sent. Try again later.` |
| `401`, `403`, `503`, `502` | As for `/admin/users` | Existing messages; `502` logs once |

**Stored on the invitee:**

- **`app_metadata`:** `{ ...existing, role, organisation, invited_by }`, where
  `organisation` is always the caller's verified one.
- **`user_metadata`:** untouched, so the invitee sets their own name in 20d.

**Users list change:** `GET /api/admin/users` no longer includes pending
invitees.

## Testing

- `api/`, Vitest:
  - mapping, expiry and config, with the clock injected;
  - invite, revoke and resend rules, the rollback, refusals and the queue,
    against a stateful stub;
  - routes over HTTP against a fake directory.
- `ui/`, Karma: the card and form states with `HttpTestingController`.
- **No live evidence is claimed.** A live run needs:
  - `SUPABASE_SERVICE_KEY`;
  - `CONSOLE_URL`;
  - `<CONSOLE_URL>/accept-invite` added to the Supabase Auth redirect allowlist;
  - Supabase's email sending working.

## Notes for the AI

- **Supabase's built-in email** is rate-limited to a few emails an hour per
  project, which is why `429` is a first-class refusal. Production needs custom
  SMTP in Supabase. Say so in the handoff, not in the code.
- **Before 20d,** clicking the email link creates a Supabase session in the
  browser and lands on `/overview`. The invitee is then inside the console
  without having set a password. That is why 20c must not ship without 20d.
- **`already-registered` reveals that an email has an account somewhere.** That
  cannot be avoided when the email must be unique project-wide, and the message
  stays generic.
- **The rollback in `invite`** is what keeps a half-created invitee, with no
  organisation, from lingering. Test that path.
- **`INVITE_LINK_TTL_HOURS`** describes Supabase's setting; it does not enforce
  it. If they disagree, the card's Expires column is wrong but nothing becomes
  less secure. Supabase is what refuses an expired link.
- **Built as:**
  - an `InvitationsStore` provided by the page, with `InvitationsCard` and `InviteForm` components beside it;
  - one shared directory, built in `routes/index.ts` and shared by `/admin/users` and `/admin/invitations`, so they share one queue;
  - the role choice is a `<fieldset>` and `<legend>` of native radios, which gives the same grouping and name as `role="radiogroup"` with `aria-labelledby`.
- **`resend` deletes before re-inviting.** If the re-invite then fails, the old
  invitation is gone and the error is reported. That is accepted, because the
  administrator can simply invite again.

## Independent review

**Status:** passed
**Target commit:** 064e7557ccda2ce45fd2c391b8ad68d9ab41876f
**Base commit:** 416f06ea4521773fd226099a8d16430e03673834
**Base ref:** master
**Spec hash:** 71cb3a05c5065ba80791137f3c42a5740a359278f63ec034d01572f9e0817863
**Prepared by:** claude
**Builder model:** claude-opus-5-5
**Requested reviewer:** claude
**Requested model:** claude-opus-5-5
**Requested execution:** automatic
**Requested at:** 2026-10-06T12:03:08Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5-5
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-10-06T12:06:02Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

### Commands

- `api/ npm run typecheck`: pass
- `api/ npm test`: pass (12 files, 244 tests)
- `api/ npm run build`: pass
- `ui/ npm test`: pass (874 specs; one pre-existing no-expectations warning in SavedQueryStore)
- `ui/ npm run build`: pass (initial bundle budget warning, 718.49 kB against 500 kB)
- `npx tsx <scratchpad probe>` against `api/src/admin/user-directory.ts`: ran; showed the queue test's call order also occurs with no serialisation (evidence for F-107)

### Evidence

- Freshness: `HEAD` = target, `git merge-base master HEAD` = base, spec SHA-256 matches, only `blueprint/context/review.md` differed before this pass.
- Tenant boundary: every directory method filters by `req.auth.organisation` (`inOrganisation`); `invite` stamps the caller's verified organisation, and the Zod body strips any client `organisation` or `invited_by` (route test "trusts only the verified organisation and caller").
- Deletion: `revoke` and `resend` delete only via `pendingIn`, i.e. a pending invitee (`invited_at`, no `email_confirmed_at`, no `last_sign_in_at`) in the caller's organisation; confirmed users, other organisations and unknown ids answer `not-found` with no write. The caller is re-checked live as an Administrator inside the queue.
- Shared queue: `routes/index.ts:17` resolves one directory and passes it to both `/admin/users` and `/admin/invitations`; `serialized` wraps `invite`, `revoke`, `resend` and `setRole`.
- Rollback: a stamp error or null user triggers `deleteUser` of the new user, then the error is rethrown; tested for the single-failure path. Double failure is F-106.
- Email: trimmed, lowercased, `z.email()`, max 254 at the route; project-wide case-insensitive uniqueness in the directory.
- Redaction: all refusals map to fixed strings in `REFUSALS`/`NOT_FOUND`; any other error is logged once and answered as a fixed `502`.
- UI: invitations card and form render only outside the `forbidden` branch; emails are interpolated only; fieldset/legend radios and labelled input present. Accessibility gaps are F-108 and F-110.

### Findings

- F-106 [P2] open: invite rollback ignores the delete's outcome and logs nothing on a failed rollback
- F-107 [P2] open: queue test passes without the queue
- F-108 [P2] open: invite form email error silent to screen readers on Enter submit
- F-109 [P3] open: role-change route still reaches pending invitees hidden from the Users list
- F-110 [P3] open: focus dropped by revoke confirm and sending state; live regions inserted already filled
- F-111 [P3] open: resend lacks an other-organisation not-found test
- F-103 [P3] unverified: re-examined; invitation actions add more whole-project scans

### Remaining risk

- No live Supabase evidence: `inviteUserByEmail`, the 429 shape, the redirect allowlist and email delivery are proved only against stubs (as the spec states).
- The per-organisation queue is per process only; more than one API instance removes the serialisation.
- Check was not required and was not run; browser tests (`npm run test:browser`) were not run and are not extended by this feature.
- Accepted by spec: resend deletes before re-inviting, so a failed re-invite loses the invitation; 20c must not ship before 20d.
- Pre-existing open F-98 (self sign-up) still applies to the deployed surface.
