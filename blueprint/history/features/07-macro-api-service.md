# Feature: Macro API service

**From build-plan:** feature 7

**Branch:** `feature/macro-api-service`

**Status:** verified

## Goal

Give the console a server it can talk to: an Express passthrough for the five
Core API read routes that holds the Auth0 M2M credentials, caches the token, and
relays the upstream response — body, status and caching headers — untouched.

This is the first `api/` work since the scaffold. It exists so the browser never
sees a client secret, and so the console's own fetches stay same-origin.

The API's job is deliberately tiny, and the overview says so in three points:
hold the credentials and do the client-credentials grant, forward five read
routes with the query string unchanged, and **nothing else**. No reshaping, no
aggregation, no business logic.

## In scope

- Five read routes under `/api/macro`: `countries`, `indicators`,
  `observations`, `series`, `vintages`, plus `vintages/:id/revisions`.
- Auth0 client-credentials grant with an in-memory token cache: reuse until
  expiry, refresh on expiry, and refresh-and-retry-once on an upstream `401`.
- Query string forwarded verbatim; `If-None-Match` forwarded upstream.
- Upstream status, body, `ETag` and `Cache-Control` relayed as-is, including
  `304` with no body and RFC 7807 `application/problem+json` error bodies.
- `Access-Control-Expose-Headers` for `ETag`, `Cache-Control` and
  `X-Total-Count`, without which the console cannot read them cross-origin.
- A `503` with a curated message when the Core API or Auth0 settings are absent,
  so the service still boots and `/api/health` still answers.
- The pass-through auth seam middleware the overview requires on day one.
- New settings in `src/config.ts` and `.env.example`.

## Out of scope

- **The console side.** Swapping `MACRO_DATA` to an HTTP provider, browser ETag
  handling and rendering `ProblemDetails` are feature 8.
- Any reshaping, aggregation, filtering or caching of payloads. The API is a
  relay; the console's models are the guide's models.
- Redis or any response cache. The overview rules it out: data changes at most
  daily and the responses already carry ETags.
- Real JWT verification or role checks (features 14 and 15). The seam calls
  `next()` for everything.
- Admin routes. `api/admin/macro/*` is sysadmin-only and explicitly not part of
  the consumer surface.
- Render configuration and deploy (feature 13).
- A validation library. See the note under Data / contracts.

## Build loop

`workflow.stepReview: "feature"` and `workflow.checkpointCommits: "disabled"`.
Build all four steps, then present one review packet. `/complete` makes the
single feature commit.

Verification per step, all in `api/`: `npm test`, `npm run typecheck`, and
`npm run build`. No `Verify` command is declared. `ui/` is untouched, so its
suite is not a gate here — but run it once at the end, because it is cheap and
proves the claim.

**No new dependencies.** Node 22 has global `fetch`, so nothing needs
installing and no approval is needed mid-build.

## Build steps

- [x] **1. Settings and the auth seam.** Add `auth0Domain`, `auth0ClientId`,
  `auth0ClientSecret`, `auth0Audience` and `coreApiBaseUrl` to `src/config.ts`
  with empty-string defaults, plus a derived `macroConfigured` boolean. Add all
  five names to `.env.example`. Add `src/middleware/auth.ts` exporting a
  pass-through handler and mount it ahead of the `/api` router in `app.ts`. Add
  `ETag`, `Cache-Control` and `X-Total-Count` to the `cors()` `exposedHeaders`.
  **Done when** `npm test` passes a `config.test.ts` proving `macroConfigured`
  is false while any of the five is blank and true when all are set; the auth
  seam calls `next()` and sets no status; `npm run build` and
  `npm run typecheck` pass; and `/api/health` still answers with no env file.

- [x] **2. The token provider.** Add `src/macro/token-provider.ts` exporting
  `createTokenProvider({ fetch, config })` with a single `getToken()` method.
  It performs the client-credentials POST, caches `access_token` against
  `expires_in` minus a safety margin, shares one in-flight request between
  concurrent callers, and exposes `invalidate()` for the retry path.
  **Done when** `token-provider.test.ts` proves, against a fake `fetch`: one
  network call for two sequential `getToken()` calls; **one** network call for
  two concurrent calls; a second call after the cached token expires; a fresh
  call after `invalidate()`; a thrown error carrying no secret and no token when
  Auth0 answers non-2xx or malformed JSON; and that the request body sends
  `grant_type`, `client_id`, `client_secret` and `audience`.

- [x] **3. The upstream client.** Add `src/macro/macro-client.ts` exporting
  `createMacroClient({ fetch, tokenProvider, config })` with one
  `get(path, search, headers)` method returning `{ status, headers, body }` as
  raw text plus content type. It builds the upstream URL from
  `coreApiBaseUrl` + `/api/macro` + path + the verbatim search string, sends the
  bearer token and any `If-None-Match`, and on a `401` invalidates the token and
  retries exactly once.
  **Done when** `macro-client.test.ts` proves: the URL and `Authorization`
  header are exactly right; the query string passes through byte-for-byte
  including repeated and encoded parameters; `If-None-Match` is forwarded and a
  `304` comes back with an empty body; a `400` `problem+json` body is returned
  verbatim rather than thrown; a `401` triggers one token refresh and one retry
  and no more; a second `401` after the retry is returned to the caller; and a
  network rejection surfaces as an error whose message names neither the token
  nor the secret.

- [x] **4. The routes.** Add `src/routes/macro.ts` with the five routes and
  `vintages/:id/revisions`, registered in `src/routes/index.ts` under `/macro`.
  Each handler relays status, body and the allowed headers. `:id` must be a
  positive integer or the route returns `400` through the shared error handler.
  When `macroConfigured` is false every macro route returns `503`.
  **Done when** `macro.routes.test.ts` proves, driving `createApp()` with a stub
  client: each of the six routes calls the client with the expected path and the
  request's own search string; the upstream status, body and `ETag` reach the
  response unchanged; `304` responses carry no body; `problem+json` is relayed
  with its content type intact; `/vintages/abc/revisions` and
  `/vintages/-1/revisions` both give `400` without touching the client; an
  unconfigured service gives `503` on every macro route while `/api/health`
  still gives `200`; and a client rejection becomes a `502` whose body contains
  no secret, token or upstream URL.

## Files / areas

| Path | Change |
| --- | --- |
| `api/src/config.ts` | five new settings plus `macroConfigured` |
| `api/src/config.test.ts` | new |
| `api/.env.example` | five new names |
| `api/src/middleware/auth.ts` | new — the pass-through seam |
| `api/src/middleware/auth.test.ts` | new |
| `api/src/app.ts` | mount the seam, extend `cors()` `exposedHeaders`, accept injected deps |
| `api/src/macro/token-provider.ts` | new |
| `api/src/macro/token-provider.test.ts` | new |
| `api/src/macro/macro-client.ts` | new |
| `api/src/macro/macro-client.test.ts` | new |
| `api/src/routes/macro.ts` | new |
| `api/src/routes/macro.routes.test.ts` | new |
| `api/src/routes/index.ts` | register `/macro` |

Untouched: `api/src/index.ts`, `api/src/routes/health.ts`,
`api/src/middleware/error-handler.ts`, `ui/proxy.conf.json` (it already proxies
`/api/*` to port 3000), and all of `ui/`.

## Data / contracts

**The API defines no types of its own.** It relays bytes. `Envelope`,
`Observation` and the rest are the console's hand-written types; duplicating
them here would create a second place to drift from the Core API. The client's
return shape is deliberately `{ status, headers, body: string }`.

**Upstream contract**, from `CONSUMER-GUIDE.md` §2:

| Piece | Value |
| --- | --- |
| Token endpoint | `POST https://<auth0Domain>/oauth/token` |
| Token body | JSON `{ grant_type: 'client_credentials', client_id, client_secret, audience }` |
| Token response | `{ access_token, expires_in, token_type }` |
| Upstream call | `GET <coreApiBaseUrl>/api/macro/<route>?<search>` with `Authorization: Bearer <token>` |
| On `401` | refresh the token and retry |

**Status codes to relay, not to interpret** (guide §8): `400` with
`ProblemDetails`, `401`, `404`, `304`, `5xx`, and `200` with empty `data` as a
success. The API adds exactly two of its own: `503` when unconfigured and `502`
when the upstream is unreachable.

**A `304` has no body.** Send the status and the headers, and end the response
without writing one. `res.json()` on a 304 is a protocol violation.

**Upstream errors are payloads, not exceptions.** A `400` `problem+json`
response must be relayed with its status, content type and body intact. Throwing
it into the shared `errorHandler` would replace the `detail` that names the
offending code with our own `{ error }` shape and destroy the thing the console
is meant to teach. Only *our* faults — no config, network failure, malformed
token response — go through `errorHandler`.

**The error handler returns `err.message` verbatim for any status below 500.**
That is fine for the shapes it was written for, and a hazard here: a `502` or
`503` message must be a fixed, curated string chosen at the throw site. Never
interpolate an upstream URL, a token, a secret, or a caught error's message into
it. `error-handler.test.ts` already asserts a `500` cannot leak a connection
string; the same rule applies by construction to everything this feature throws.

**Secrets never leave the process.** The client secret and the access token
appear only in the request to Auth0 and the `Authorization` header sent upstream.
They must never be logged, echoed in an error, or included in any response. The
console is a public site with no login in v1, so anything the API returns is
public.

**Header allowlist, both directions.** Forward only `If-None-Match` upstream;
relay only `ETag`, `Cache-Control`, `Content-Type` and `X-Total-Count` back.
Blind header copying would relay upstream `Set-Cookie` or auth headers to a
browser, and copying request headers wholesale would let a caller inject an
`Authorization` of their own choosing.

**`:id` is validated, nothing else needs to be.** The five route names are fixed
by our own router, and the search string is opaque to us — the Core API owns its
own `400`s for a bad indicator code, which is exactly the behaviour the console
demonstrates. So the only client-supplied identifier reaching a URL we build is
the vintage id, and it must be a positive integer.

> The coding standards leave a `> TODO` for picking a validation library. This
> feature does not pick one: a single positive-integer guard does not justify a
> dependency, and installing one would need approval mid-build. The TODO stays
> open for the first feature with a real request body.

**Authorization and tenancy:** none yet, by design. The seam middleware calls
`next()` for everything. The overview records the accepted gap plainly: until
logins exist, anyone with the API URL can use the M2M credentials by proxy, and
the mitigation if it becomes urgent is a shared header plus an origin allowlist —
both throwaway. Do not build either now.

## Testing

`api/` uses Vitest (`npm test`), tests beside their source as `*.test.ts`,
excluded from the emitted build by `tsconfig.json` and kept typechecked by
`tsconfig.spec.json`. Both already exist.

Everything in this feature is unit-testable without a network: inject a fake
`fetch` into the token provider and the client, and a stub client into
`createApp()`. That injection is the only reason to touch `createApp()`'s
signature, and it must stay optional so `src/index.ts` keeps working unchanged.

- `config.test.ts` — `macroConfigured` across blank and populated settings.
- `auth.test.ts` — the seam calls `next()` and writes nothing.
- `token-provider.test.ts` — caching, expiry, concurrency, invalidation, and
  redaction on failure.
- `macro-client.test.ts` — URL and header construction, verbatim query
  passthrough, `304`, `problem+json` relay, and the single-retry rule.
- `macro.routes.test.ts` — the six routes end to end against a stub client,
  plus `400`, `502`, `503` and the untouched `/api/health`.

No browser-test command exists, so no browser coverage is added. **No live
evidence may be claimed:** there is no Core API host and no Auth0 tenant to call.
Every assertion here is against a fake upstream, and the review packet must say
so plainly.

## Notes for the AI

- **Relay, do not interpret.** Every instinct to normalise a payload, add a
  field, or turn an upstream error into a nicer shape is wrong here. The one
  thing this service must get right is being boring.
- **`error-handler.ts` is not the place for upstream errors.** Read the "Upstream
  errors are payloads" note above before touching a catch block.
- **Relative imports need the `.js` extension.** `api/` is ESM with `NodeNext`
  resolution, so `import { config } from '../config.js'` even though the source
  is `.ts`. This is the single most likely build break in this feature.
- **`process.env` only in `config.ts`.** The standards are explicit, and the
  token provider is the obvious place someone would break the rule.
- **The concurrency test is the one that matters** in the token provider. Two
  requests arriving together must produce one token fetch; the naive
  check-then-fetch passes every sequential test and fails this one.
- The service must be runnable and its whole suite green **with no credentials
  configured**, which is the state of this repository today. If a step needs real
  values to pass, the step is wrong.
- `ui/proxy.conf.json` already sends `/api/*` to port 3000, so the console will
  reach these routes in development with no change.

## Open questions

> **No Core API host and no Auth0 tenant.** `CORE_API_BASE_URL`,
> `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET` and `AUTH0_AUDIENCE`
> are names without values. This is the overview's one standing open question and
> it is unchanged.
>
> It does **not** block this feature: the contract is documented in
> `CONSUMER-GUIDE.md` §2, and every behaviour above is provable against a fake
> upstream. It **does** block signing off feature 8, which cannot demonstrate a
> real `200`, `304` or `400` without them.
>
> Two things to confirm the moment real values exist, both assumed here from the
> guide: that the Core API mounts the macro routes at `/api/macro` under the host
> in `CORE_API_BASE_URL`, and that `expires_in` is seconds.

## Findings

### 07/F-01 [P1] closed - res.send lets Express rewrite a relayed 200 into a bodyless 304

**File:** api/src/routes/macro.ts:106
**Found:** 2026-09-09 by /audit (scope: current; lens: quality, security, performance, tests)
**Why it matters:** `relay()` ends with `res.send(upstream.body)`. Express 5's
`res.send` is not a byte relay: it runs `if (req.fresh) this.status(304)` and
then strips the body, generates an `ETag` over the payload when the response has
none, and rewrites the relayed `Content-Type` to add `; charset=utf-8`. All three
break the spec's "relay bytes and do nothing else" rule, and the first one loses
data. Two reproduced scenarios, both against the built `dist/app.js` driven by a
stub client that returns a 200:

1. Upstream answers `200` with `ETag: W/"v14"` and the caller sent
   `If-None-Match: W/"v14"`. A raw HTTP GET, which is what a browser sends,
   receives `304` with an empty body and the relayed rows are discarded. Guide
   section 6 says the upstream ETag is derived from the underlying vintages, not
   from the body, so one ETag is shared across queries and routes. Any Core API
   route that emits the vintage ETag without honouring `If-None-Match` will
   answer `200` with an ETag the caller already holds, and this proxy will then
   silently blank it.
2. Upstream answers `200` with no ETag. The proxy invents
   `W/"10-U9KaaRoTbc9ipjgAe8Ih1luNn44"` and returns it. Replaying that
   fabricated validator produces a `304` with an empty body while still paying
   for the upstream call, so the console caches against a validator the Core API
   never issued.

No test sees any of this, because `macro.routes.test.ts` drives the app through
Node's `fetch`, and undici always attaches `cache-control: no-cache`, which
forces `fresh()` to return false. Swap in `http.request` and the same route
returns `304`.
**Suggested fix:** end the relay with `res.end(upstream.body)` instead of
`res.send`, which bypasses the freshness check, the ETag generation and the
charset rewrite in one line. Note that `app.set('etag', false)` is not
sufficient: `req.fresh` compares against whatever `ETag` is on the response,
including the relayed upstream one. Add a route test that issues the conditional
request with `node:http` rather than `fetch`.
**Resolution:** Confirmed by reproduction before repairing: a stub 200 with
`ETag: W/"v14"` and a matching `If-None-Match`, issued over `node:http` against
the built `dist/app.js`, returned `304` with an empty body. `relay()` now ends
with `res.end(upstream.status === 304 ? undefined : upstream.body)`, which
bypasses the freshness check, the ETag generation and the charset rewrite
together. Four tests added to `macro.routes.test.ts` under
`/api/macro conditional requests, over raw HTTP`, using `node:http` for the
reason the finding names. Verified they are not vacuous: with `res.send`
restored, three of the four fail (relayed 200 blanked, invented ETag, charset
appended); with the fix they pass. `npm test` 64 passed, `npm run typecheck`
and `npm run build` pass, `ui/` 233 passed.
Independently re-reviewed 2026-09-09 by /audit (independent, scope: current).
Both halves of the claim were verified from scratch rather than accepted.
Express 5.2.1's `res.send` was read directly
(`api/node_modules/express/lib/response.js`): it rewrites `Content-Type`
through `setCharset(type, 'utf-8')`, computes
`generateETag = !this.get('ETag') && typeof etagFn === 'function'`, and only
then runs `if (req.fresh) this.status(304)` before stripping the body. A
standalone `node:http` probe held outside the repository, importing this
project's own Express build and replaying the four relayed shapes the new tests
use under both `res.send` and `res.end`, reproduced all three defects on `send`
(a 200 with a matching `If-None-Match` became a bodyless `304`; a 200 with no
upstream ETag gained a fabricated weak validator; `application/problem+json`
became `application/problem+json; charset=utf-8`) and none of them on `end`.
The builder's "three of the four fail" is accurate: the bodyless-304 relay
passes under both, so that fourth test is a regression guard rather than a
fix-proving one, which its own resolution says.
The repair introduces no new defect. `res.end(string)` still produces a correct
`Content-Length` from Node, measured at 23 bytes for a 21-character multi-byte
body, so nothing silently falls back to chunked encoding. A `204` and a `304`
emit no body because Node clears `_hasBody` for those statuses, and a `HEAD`
request, which Express routes to the `GET` handler, likewise emits no body; the
only difference from `res.send` is an omitted `Content-Length` on `HEAD`, which
RFC 9110 permits and which no documented route uses. The
`upstream.status === 304 ? undefined : upstream.body` guard is redundant, since
`macro-client.ts:108` already forces an empty body on a `304`, but it is
harmless. Closed.

### 07/F-05 [P3] closed - Test harness choices that hide real behaviour

**File:** api/src/routes/macro.routes.test.ts:38
**Found:** 2026-09-09 by /audit (scope: current; lens: tests)
**Why it matters:** The suite is genuinely strong in places. The token
concurrency test really does fail against a naive check-then-fetch, and the
redaction tests feed real leak vectors, a caught error carrying the URL and a
payload carrying a token, rather than asserting against an already-safe string.
Four weaknesses remain:

- `serve()` returns a `fetch`-bound helper, and undici's mandatory
  `cache-control: no-cache` is what conceals F-01 from every conditional-request
  assertion in the file.
- `responding()` in `macro-client.test.ts:34` clamps to `responses[len - 1]` and
  hands back the same `Response` instance on every call past the end. Nothing
  currently double-reads a body, because `read()` runs only on the final
  response, but the next test that does will fail with an opaque "body already
  read" instead of a clear assertion failure.
- The 502 route test asserts the body does not contain `Bearer`, `token` or
  `secret` against a hard-coded literal message, so it can never fail. The
  equivalent token-provider assertions are the ones doing real work.
- The `console.error` spy at line 268 is restored inline rather than in
  `afterEach`, so a failing assertion above it leaves `console.error` mocked for
  the rest of the file.

Also uncovered: nothing drives `createApp()` with no deps at all, and no test
proves that a caller-supplied `Authorization` header cannot reach the upstream,
since the stub client records only path, search and `ifNoneMatch` and so could
not observe one.
**Suggested fix:** add a raw `node:http` conditional-request test, make
`responding()` throw once its queue is exhausted, and move the console spy into
`afterEach`.
**Resolution:** All four addressed. Added four `node:http` conditional-request
tests, which is what caught F-01. `responding()` now throws once its queue is
exhausted rather than replaying the last `Response`. The vacuous 502
not-contains assertions are replaced by an exact-body assertion, since the whole
protection is that the throw site chose a fixed string. `vi.restoreAllMocks()`
moved into `afterEach`. Also closed the two gaps the finding named as uncovered:
a test now drives `createApp()` with no deps at all against the real
configuration, and another proves a caller-supplied `Authorization`, `Cookie`
and `X-Forwarded-Host` reach the client as nothing but `ifNoneMatch`. 66 tests
pass, typecheck and build pass.
Independently re-reviewed 2026-09-09 by /audit (independent, scope: current).
All four weaknesses are gone and the replacements are load-bearing. The
`responding()` change from `responses[Math.min(index, responses.length - 1)]`
to `responses[index]` plus a throw did not alter any existing test's meaning:
no test in `macro-client.test.ts` reads a body from a replayed response, and
the two tests that queue more responses than they consume
(`macro-client.test.ts:232` and `:247`) assert the exact call count, so the
surplus entries are deliberately unreached rather than silently reused.
`vi.restoreAllMocks()` in the file-level `afterEach` is sufficient here: the
only mock in the file is the single `vi.spyOn(console, 'error')`, and a
file-scope `afterEach` runs after every test in the file, including those in
the nested raw-HTTP describe. The surviving 500 test's
`not.toContain('postgres')` assertions resemble the vacuous pattern this
finding named but are not vacuous: the leaky string is injected by the test's
own throwing client, so they fail if `errorHandler` ever relays `err.message`
at 500. Closed.

### 07/F-07 [P3] closed - Comment volume and one em dash drift from the coding standards

**File:** api/src/middleware/auth.ts:3
**Found:** 2026-09-09 by /audit (scope: current; lens: quality)
**Why it matters:** `coding-standards.md` asks for minimal doc comments, no
banner blocks and no comments that restate the code, and forbids em dashes in
generated content including comments. The new modules carry a twelve-line header
block over a three-line function (`auth.ts`), eleven lines over a two-property
error class (`upstream-error.ts`), and several comments that narrate the line
below them, such as `// A 304 has no body by definition...`.
`api/src/routes/macro.ts:33` contains a U+2014 em dash. The rationale comments
that capture a real decision, why the query string is read off `originalUrl` and
why there is only one retry, are the ones worth keeping.
**Suggested fix:** replace the em dash with a hyphen and trim the header blocks
to a single purpose line, keeping the decision comments.
**Resolution:** Em dash removed; `grep -rn "—" api/src/` is now empty. Header
blocks trimmed in `auth.ts`, `upstream-error.ts`, `macro-client.ts` and
`token-provider.ts`, and the two comments that narrated the line below them
deleted. The decision rationale the finding called worth keeping is kept: why
the query string comes off `originalUrl`, why there is only one retry, why the
header lists are allowlists, and why the relay uses `res.end`.
Independently re-reviewed 2026-09-09 by /audit (independent, scope: current).
A recursive search for U+2014 over `api/src/` and `api/.env.example` returns
nothing. The trimming removed narration, not rationale the code needed: every
decision comment the finding called worth keeping is still present
(`macro.ts:66-68` on the vintage id being the only interpolated client value,
`macro.ts:98-104` on why the relay uses `res.end`, `macro.ts:110-113` on
reading the query string off `originalUrl`, `macro-client.ts:65-66` and
`:85-86` on the request-header allowlist and the single retry, and
`upstream-error.ts:1-8` on fixed messages below 500). Two small losses were
weighed and accepted at P3: the note on why `Content-Type` belongs in
`RELAYED_HEADERS`, and the one-liner above the `304` guard in `read()`, whose
condition reads clearly enough on its own. Closed.

## Independent review

**Status:** passed
**Target commit:** 61ee149fb3704043ab05336c893460b2abc73dd3
**Base commit:** 776d1611caa07cacd49afab588815c76d970fd69
**Base ref:** master
**Spec hash:** b5ce6c11fcdd0a2f378b9c8f262a98b968a93cca15712198c1b489c2320dc739
**Prepared by:** claude
**Builder model:** claude-opus-5[1m]
**Requested reviewer:** claude
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-09-09T09:19:21Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5[1m]
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-09-09T09:41:00Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

### Handoff

Review the active spec and the complete `776d161..61ee149` delta in a fresh
session or isolated subagent without the builder conversation. Run all Audit lenses from scratch.
Run Check when required above. Do not edit product code, accept findings, or
reuse the existing findings as the review scope.

### Commands

- `git diff 776d161..61ee149` and `git diff 82eb4d5..61ee149`: reviewed, two commits (implementation plus repair)
- `api/ npm test`: pass, 6 files, 66 tests
- `api/ npm run typecheck`: pass
- `api/ npm run build`: pass
- `ui/ npm test`: pass, 233 specs, headless Chrome
- Independent `node:http` probe of Express 5.2.1 `res.send` versus `res.end`, run outside the repository and deleted afterwards: confirmed the F-01 defects and the repair

### Evidence

- Express 5.2.1 `res.send` in `api/node_modules/express/lib/response.js` was read directly. It applies `setCharset(type, 'utf-8')`, computes `generateETag = !this.get('ETag') && typeof etagFn === 'function'`, and then runs `if (req.fresh) this.status(304)` before stripping the body. All three F-01 claims are confirmed at the library level.
- A standalone probe replayed the four relayed shapes the new raw-HTTP tests use, under both `res.send` and `res.end`. Under `send`: a relayed 200 with a matching `If-None-Match` collapsed to a bodyless `304`, a 200 with no upstream ETag gained a fabricated weak validator, and `application/problem+json` gained `; charset=utf-8`. Under `end`: none of the three, and the upstream `304` still relayed bodyless. Three of the four new tests are therefore fix-proving and the fourth is a regression guard, exactly as the builder recorded.
- The repair keeps a correct `Content-Length` (23 bytes measured for a 21-character multi-byte body), so no response falls back to chunked encoding. `204`, `304` and `HEAD` all emit no body because Node clears `_hasBody`; the only behavioural loss versus `res.send` is an omitted `Content-Length` on `HEAD`, which RFC 9110 permits and which no documented route uses.
- Spec rules re-checked in code: verbatim query string from `req.originalUrl` (`macro.ts:115-118`), request-header allowlist of `If-None-Match` only (`macro-client.ts:60-69`), response-header allowlist (`macro-client.ts:9-14`, `:100-105`), upstream non-2xx returned as a payload (`macro-client.ts:92`), single 401 refresh and retry (`macro-client.ts:87-90`), one token grant for concurrent cold-start callers (`token-provider.ts:92-98`), `503` while unconfigured with `/api/health` unaffected (`macro.ts:50-57`, proven by `macro.routes.test.ts:269-276` and `:313-320`), and the vintage id as the only interpolated client value (`macro.ts:69-76`, `:120-127`).
- Secret handling re-checked: every throw site uses a fixed curated string (`upstream-error.ts`, `macro-client.ts:75`, `:112`, `token-provider.ts:59-75`), `errorHandler` logs only at 500 and never returns detail, and no token, secret or upstream URL is reachable in any response body or log line.
- Tests lens: the `responding()` throw-on-exhaustion change alters no existing test's meaning, because the two tests that over-queue responses assert exact call counts; `vi.restoreAllMocks()` in the file-scope `afterEach` covers the file's single spy, including the nested raw-HTTP describe. No skipped, focused or placeholder tests exist in either package.
- Coding standards re-checked: no U+2014 anywhere in `api/src/` or `api/.env.example`; `process.env` remains confined to `config.ts`; relative imports keep the `.js` extension; the trimmed comments retain each decision rationale the previous round asked to keep.

### Findings

- F-01 [P1] closed, F-05 [P3] closed, F-07 [P3] closed
- F-02 [P2], F-03 [P2], F-04 [P2] and F-06 [P3] remain open, re-confirmed against this target with reviewer evidence added to each Resolution
- No new findings raised

### Remaining risk

- No live verification is possible. This repository holds no Core API host and no Auth0 tenant, so every assertion in the suite is against a fake upstream. The two guide assumptions the spec names, that the Core API mounts the macro routes at `/api/macro` under `CORE_API_BASE_URL` and that `expires_in` is seconds, are still unconfirmed.
- Unavailable verification commands: no `Verify` command is declared in either package, no lint command exists in either package, no `Browser tests` command exists, and no security or dependency scanner is configured, so no scan was run and none is implied. `/check` was not required and was not run.
- F-02 and F-03 together are the real operational exposure: with no request timeout and an unconditional `invalidate()`, a stalled Auth0 tenant or a token revocation under load can wedge or storm the whole `/api/macro` surface. Both are P2 and neither blocks, but they are the first things to fix before this service faces real traffic.
- F-04 leaves a documented consumer endpoint, `GET /api/macro/indicators/{code}`, unreachable. Feature 8 will plan against the guide, so the omission should be resolved or recorded before then.
- The auth seam is a deliberate no-op, so anyone who can reach the API can spend the M2M quota. This is the overview's recorded accepted gap and features 14 and 15 own it; it is not raised as a finding.
- `205` is the one status where `res.end` would emit a body that `res.send` would have stripped. The Core API never returns it and no route can produce it, so this is noted rather than raised.
