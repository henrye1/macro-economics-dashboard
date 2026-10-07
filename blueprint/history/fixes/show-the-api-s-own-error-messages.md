# Fix: Show the API's own error messages

**Type:** Fix

**Status:** verified

**Branch:** `fix/show-the-api-s-own-error-messages`

## The problem

The console never shows the error sentences the API writes for its own
failures on `/api/macro/*`. Those include:

- `The Core API rejected the service credentials.` (the F-114 fix);
- `Could not reach the Core API.`;
- `The macro service is not configured. …`;
- `The session could not be verified.`

Visitors see each tab's generic wording instead, such as "Observations are
unavailable."

The cause is `ui/src/app/core/http/macro-error.ts`, where `problemDetail` reads
only an RFC 7807 `detail`. The Core API's own problems carry one. The API's
errors come from the shared `errorHandler` (`api/src/middleware/error-handler.ts`)
as `{ error }`, so they are dropped.

The UI cannot simply read `error` from any body. A relayed upstream body can
also be JSON with an `error` key; the existing tests use
`{"error":"expired"}`. Reading that would put arbitrary upstream text on screen
"under the pretence that the service explained itself", which is exactly what
the module's comment rules out.

## The fix

The API marks the sentences it wrote itself, and the UI trusts the `error`
field only when that mark is present.

- **API:** `errorHandler` sets the response header `X-Error-Source: api`
  whenever it relays the error's own fixed message, that is, any status
  except 500.
  - A 500 keeps its generic "Internal Server Error" with no header, so the tab
    wording stands.
  - `notFound` stays unmarked: "Not Found" for an unknown route explains
    nothing.
  - Relayed Core API responses never pass through `errorHandler`, so they can
    never carry the header.
- **UI:** `toMacroRequestError` reads, in order:
  1. a problem `detail`, as today;
  2. otherwise, only when `X-Error-Source` is `api`, a non-empty string `error`.
  - Everything else still yields `null`, which shows the tab wording.
  - Rendering stays interpolation only.

The console reaches the API on its own origin (the dev proxy and the Render
rewrite), so the header is readable. CORS `exposedHeaders` is changed only if a
spec shows it is needed for a direct caller. It isn't needed for the console.

**Must not break:**
- RFC 7807 details from the Core API, still shown;
- the 401 sign-out path;
- relayed upstream `{ error }` bodies, which must still show the tab wording;
- the admin and saved-queries screens, which already read `{ error }` themselves
  and are unchanged.

## Build steps

- [x] **1. Mark and read the API's own messages.**
  - API: set the header in `errorHandler` for non-500 statuses. In
    `error-handler.test.ts`, assert the header for a 4xx and a 502, and its
    absence on a 500 and on `notFound`. One route test in `macro.routes.test.ts`
    checks that the credentials-refused 502 carries the header.
  - UI: in `macro-error.ts`, read `response.headers.get('X-Error-Source')`.
    Update the module comment to state the rule. In `macro-error.spec.ts`:
    - a marked `{ error }` gives that detail;
    - an unmarked `{ error }` gives null;
    - a marked empty or non-string `error` gives null;
    - a problem `detail` still wins over a marked `error`.

  **Done when:**
  - `npm test`, `npm run typecheck` and `npm run build` pass in `api/`;
  - `npm test` and `npm run build` pass in `ui/`.

## Verify

- The checks above.
- Locally, put a wrong `AUTH0_CLIENT_SECRET` in `api/.env`, restart the API and
  open Observations. The tab shows "The Core API rejected the service
  credentials." and you stay signed in. Then restore the secret.
- With live data, an unknown indicator code still shows the Core API's own
  `400` detail.
