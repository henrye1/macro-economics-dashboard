# Fix: Core API credential refusal signs everyone out

**Type:** Fix

**Status:** verified

**Branch:** `fix/core-api-credential-refusal-signs-everyone-out`

**Fixes:** F-114

## The problem

When the Core API refuses the API's own M2M token, the console signs out every
visitor. The token can be refused because the Auth0 client was rotated or
revoked, the audience is wrong, or the clocks are skewed.

- `get()` in `api/src/macro/macro-client.ts:87` retries once on a 401, then
  returns the second 401 as a payload.
- `relay` (`api/src/routes/macro.ts:96`) copies that status to the browser.
- The browser's `authInterceptor` treats any 401 under `/api/macro` as "your
  session is invalid". It signs the visitor out and redirects to sign-in, and
  every new sign-in hits the same 401.

The visitor did nothing wrong. The API's 401 means "this request carried no
valid session" (`auth.ts`). The auth seam already keeps its own outages out of
401 for exactly this reason: a JWKS failure answers 502.

A Core API **403** is the same kind of fault: the M2M client lacks a permission,
and the visitor cannot fix that by signing in again. The consumer guide lists no
403 for the read routes.

## The fix

- In `get()`:
  - if the retry still answers 401, throw
    `badGateway('The Core API rejected the service credentials.')`;
  - if either attempt answers 403, throw the same error without retrying, since
    a new token does not change permissions.
  - Every other status stays a relayed payload, exactly as today. That covers
    200, 304, 400, 404, other 4xx and 5xx.
- The message is a fixed string with no upstream text, URL or token, like the
  existing `badGateway` messages. The route already maps an `UpstreamError` to
  its status and message through `errorHandler`.

**Must not break:**
- the single retry on a first 401;
- `If-None-Match` forwarding on the retry;
- 304 and ETag relaying;
- relayed 400 and 404 bodies.

Nothing changes in the UI: the interceptor signs out only on a 401, so a 502
on `/api/macro` leaves the visitor signed in and the tab shows its failure
state.

> **Found while building:** `macroErrorMessage` reads only an RFC 7807
> `detail`, and the relay's own errors come back as `{ error }`. So the tab
> shows its generic failure wording, not "The Core API rejected the service
> credentials." This is older than this fix and applies to every relay
> 502/503, so it is out of scope here and is a follow-up for `/fix`.

## Build steps

- [x] **1. Map a refused credential to 502.**
  - Change `get()` in `api/src/macro/macro-client.ts`.
  - In `macro-client.test.ts`, change "gives up after the single retry and
    returns the second 401" so a double 401 rejects with a 502
    `UpstreamError`. Assert the fixed message, that the upstream body is not in
    it, and still exactly two fetches and one invalidation.
  - Add a test that a 403 rejects with that 502 after **one** fetch and no
    invalidation.
  - Keep "does not retry any other status" passing for a relayed 400 and 404.
  - In `macro.routes.test.ts`, add one route test: a stub client that throws the
    502 makes `GET /api/macro/countries` answer `502` with
    `{ error: 'The Core API rejected the service credentials.' }`, never `401`.

  **Done when:** `npm test`, `npm run typecheck` and `npm run build` pass in
  `api/`.

## Verify

- `npm test`, `npm run typecheck` and `npm run build` in `api/`.
- Live, optionally: temporarily set a wrong `AUTH0_CLIENT_SECRET` on a local
  `api/.env` and open Observations. The tab shows its failure state and you
  stay signed in. Then restore the secret.

## Findings

### core-api-credential-refusal/F-114 [P1] closed - A Core API 401 is relayed as the caller's own 401, so one service-credential fault signs out every visitor

**File:** api/src/macro/macro-client.ts:87
**Found:** 2026-10-07 by /audit (scope: full; lens: security, quality)
**Why it matters:** When the Core API rejects the M2M token (revoked or rotated Auth0 client, audience mismatch, clock skew), `get()` retries once and then returns the second 401 as a payload (`macro-client.test.ts:232` asserts exactly that). `relay` (`api/src/routes/macro.ts:96`) copies the status to the browser, and `ui/src/app/core/http/auth.interceptor.ts:42` treats any 401 under `/api/macro` as "your session is invalid": it signs the visitor out and redirects to sign-in. Every visitor is signed out, and is signed out again after every sign-in, for a fault that is the service's, not theirs. The API's 401 means "no valid session" (`auth.ts:48`); the seam already keeps a JWKS outage out of 401 for this reason (`auth.ts:160`). Needs only a credential problem on the Core API side, which is outside this service's control.
**Suggested fix:** In `get()`, map a second upstream 401 (and a 403) to `badGateway('The Core API rejected the service credentials.')`; change the test at `macro-client.test.ts:232` to expect the 502.
**Resolution:** Fixed 2026-10-07 by fix/core-api-credential-refusal-signs-everyone-out: `get()` throws `badGateway('The Core API rejected the service credentials.')` when the retry still answers 401, and at once (no retry, no invalidation) on a 403; 400/404 and other statuses are relayed as before. Tests cover the double 401 (two fetches, one invalidation, fixed message, no upstream text), the 403, relayed 400/404, and a route answering 502 rather than 401. Marked `fixed`; a review has not looked at it yet.
Closed 2026-10-07 by independent `/audit independent current` (claude, claude-opus-5-5, fresh subagent) at ed48346: `macro-client.ts:97` throws the fixed-string `badGateway` (`UpstreamError` 502) when the post-retry status is 401 or 403, after the unchanged single retry (`:87-90`) that still forwards `If-None-Match`; `read()` and 304/ETag relaying are untouched. `errorHandler` maps it to `502 { error }`, and `auth.interceptor.ts:42` signs out only on 401, so the visitor stays signed in. Message carries no upstream text. Tests at `macro-client.test.ts:232-283` and `macro.routes.test.ts:290` pass; api typecheck, 251 tests and build pass. No new defect introduced; P3 follow-ups recorded as F-134 and F-135.

## Independent review

**Status:** passed
**Target commit:** ed48346b037d810b009f6941eca73ed846a087f0
**Base commit:** 0549a78ddc28e1c5bcdc267bd430c61adb22db1f
**Base ref:** master
**Spec hash:** 9a313d18a281c6a4696d2f8a934f524df0044c554d1880d7de9cc6745ca37238
**Prepared by:** claude
**Builder model:** claude-opus-5-5
**Requested reviewer:** claude
**Requested model:** claude-opus-5-5
**Requested execution:** automatic
**Requested at:** 2026-10-07T07:53:12Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5-5
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-10-07T07:54:27Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

### Commands

- `npm run typecheck` (api/): pass
- `npm test` (api/): pass (12 files, 251 tests)
- `npm run build` (api/): pass

### Evidence

- Preflight: `HEAD` = target; `git merge-base master HEAD` = base; spec SHA-256 matches; only `blueprint/context/review.md` dirty.
- Delta reviewed: `api/src/macro/macro-client.ts`, `macro-client.test.ts`, `api/src/routes/macro.routes.test.ts`, `current-feature.md`; `findings.md` ledger entries excluded as records.
- `macro-client.ts:87-99`: single retry on 401 unchanged, `If-None-Match` forwarded on retry; post-retry 401 or any 403 throws fixed-string `badGateway` (502); all other statuses go through unchanged `read()`.
- `error-handler.ts` maps `UpstreamError` 502 to `{ error }`; `ui/.../auth.interceptor.ts:42` signs out only on 401, so a 502 leaves the visitor signed in.
- Tests assert two fetches and one invalidation on double 401, one fetch and no invalidation on 403, fixed message without upstream text, relayed 400/404 bodies, and route 502 not 401.

### Findings

- F-114 [P1] closed (verified against repaired code)
- F-134 [P3] open - relay doc comment still says every upstream non-2xx is a payload
- F-135 [P3] unverified - refused response bodies are not cancelled before retry or throw

### Remaining risk

- No 401-then-403 combination test; covered by code inspection only.
- Live credential-refusal path (wrong `AUTH0_CLIENT_SECRET`) not exercised; Check not required.
- UI tests not run; UI unchanged in this delta.
- No lint command is configured.
