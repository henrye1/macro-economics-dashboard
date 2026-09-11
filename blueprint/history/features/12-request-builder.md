# Feature: Request builder

**From build-plan:** feature 12

**Status:** verified
**Branch:** feature/request-builder

## Goal

Turn the working query into the exact request a consumer would make: the live
URL, a pasteable curl, a real send showing the real status, headers and envelope,
and the status-code reference that explains what came back.

The overview calls this tab the headline — "it is where the ETag and
vintage-pinning habits actually get taught" — so the mechanics have to be real,
not illustrated.

## Design reference

`blueprint/references/7-request-builder.png`. Four regions, top to bottom:

1. **Working query** — the existing `app-working-query-card`, unchanged.
2. **Request** — an Endpoint select, the URL in a navy block, `SEND REQUEST` and
   `COPY CURL`, the curl block, and the two-sentence auth note.
3. **Response** — a status pill (`Not sent` / `press send`), the three relayed
   headers, the envelope body, and the If-None-Match hint.
4. **Status codes** — a static three-column table: Status, Meaning, Typical cause.

## In scope

- **The URL and curl use `https://<core-api-host>`**, the placeholder
  `CONSUMER-GUIDE.md:52` itself uses. Decided on 2026-09-11: the overview
  classifies `CORE_API_BASE_URL` as a secret (`project-overview.md:264`) and
  records the host as deliberately unnamed (`:297`), and the browser has no way
  to learn it. The curl block carries a line naming what to substitute.
- **Send goes through this console's own proxy**, `/api/macro/<endpoint>?…`,
  because that is the only origin the browser can reach and the only one holding
  a token. The card says so in one line: a console that displays one URL and
  silently requests another is teaching the wrong thing.
- **Endpoint select offers `observations` and `series` only.** Decided on
  2026-09-11: they are the two routes the working query answers, so every
  parameter in the displayed URL is real. `countries` and `vintages` were
  observed at feature 8 to ignore `pageSize` entirely, and none of the other
  three take `indicators` or years.
- Every response state: not sent, sending, `2xx`, `304`, `400`/`401`/`404`,
  `5xx`, a request that never reached the service, and an unsendable query.
- The three relayed headers — `ETag`, `Cache-Control`, `X-Total-Count` — read
  from the real response. They are exactly the three `api/src/app.ts:23` exposes
  through CORS, so no fourth header is readable and none should be claimed.
- **A real `304` on a repeat send.** The last `ETag` is held and sent back as
  `If-None-Match` on the next send of the same request, and the curl block shows
  that header once one is held.
- Copy curl, behind a clipboard seam.
- The static status-code table, from the design and `project-overview.md:293`.

## Out of scope

- `countries`, `indicators`, `vintages` and `revisions` as endpoints.
- Editing the query here. The working-query card owns that, and this tab renders
  what it produces.
- Any method other than `GET`, a request-body editor, or saved request history.
- Reading or displaying `CORE_API_BASE_URL`, the Auth0 tenant, or any token. The
  curl uses the literal `$TOKEN`, as the guide does.
- A configurable production origin for the proxy. `http-macro-data.provider.ts`
  records that as feature 13's open TODO, and this tab must not become a second
  source of truth for it.
- Repairing F-04. `/indicators/{code}` is unproxied and the status table's `404`
  row mentions it; the row is reference text about the Core API, not a claim
  about this console, and the spec leaves it exactly as the design wrote it.

## Build loop

`workflow.stepReview` is `feature` and `checkpointCommits` is `disabled`: build
all four steps, then present one review packet. `/complete` makes the single
feature commit.

## Build steps

- [x] **1. The request text, as pure functions.**
      New `core/request/request-text.ts`:

      - `CORE_API_HOST = '<core-api-host>'` and `REQUEST_ENDPOINTS`, the two
        endpoints with their labels.
      - `consumerUrl(endpoint, query)` — `https://<core-api-host>/api/macro/…`
        with the query string from `toMacroParams(query).toString()`, the same
        function every other tab serialises with, so the URL on screen cannot
        drift from the request that is actually sent.
      - `proxyUrl(endpoint, query)` — `/api/macro/…` with the same string.
      - `curlCommand(url, ifNoneMatch)` — `curl -s "<url>" \`, then
        `-H "Authorization: Bearer $TOKEN" \`, then the `If-None-Match` line only
        when one is held. Continuation lines indented two spaces, as the design
        shows, and no trailing backslash on the last line.

      **Done when:** `ui` `npm test` passes with specs covering: the two URLs
      differ only in origin; a multi-indicator query emits one comma-joined
      `indicators` parameter; an empty `countries` array is absent entirely; the
      curl has no `If-None-Match` line when none is held and exactly one when it
      is; and the last line never ends in a backslash.

- [x] **2. The raw send, behind its own service.**
      New `core/request/request-send.service.ts`, `providedIn: 'root'`. It does
      not use `MACRO_DATA`: that contract returns parsed envelopes and
      deliberately hides status and headers, which are the whole subject here.

      - `HttpClient` with `observe: 'response'` and `responseType: 'text'`, so
        the body is shown as the service sent it and a non-JSON error body does
        not throw.
      - Sends `If-None-Match` only when a held ETag belongs to **this exact
        request**. Hold `{ requestKey, etag }` where `requestKey` is the endpoint
        plus the query string, and drop it when the key differs — the same guard
        `LastResultMeta` applies for the same reason: a validator from a
        different request is a claim this one never earned.
      - Result union: `{ status, headers, body, elapsedMs }` for any response
        that arrived, including `400`, `401`, `404` and `5xx`, plus a separate
        `unreachable` case carrying a message for a request that never got an
        answer.
      - **`304` arrives through Angular's error channel**, because `HttpClient`
        treats only `2xx` as success. It must be classified as a response, not a
        failure. Check `status` on the `HttpErrorResponse` rather than assuming
        an error is an error; a `304` carries no body.
      - Headers read by name, limited to `ETag`, `Cache-Control` and
        `X-Total-Count`, with a null for any the response did not carry.
      - `busy` signal for the in-flight window.

      **Done when:** `ui` `npm test` passes using the project's existing
      `HttpTestingController` harness, with specs for: a `200` with all three
      headers; a `200` with none of them; a `400` whose problem body is returned
      rather than swallowed; a `304` classified as a response with no body; a
      network failure classified `unreachable`; `If-None-Match` sent on a repeat
      of the same request and **not** sent after the query changes; and `busy`
      true for the whole round trip.

- [x] **3. The clipboard seam.**
      `REQUEST_CLIPBOARD` injection token in the same folder, default factory
      writing through `navigator.clipboard.writeText`, matching how
      `EXPORT_DOWNLOADER` and `SAVED_QUERY_STORAGE` isolate a browser API.
      Copy reports success or failure to the user; a denied clipboard permission
      is an ordinary outcome, not a crash.

      **Done when:** `ui` `npm test` passes with a fake clipboard capturing the
      copied text, one spec asserting it equals the rendered curl exactly, and
      one asserting a rejected write reports a message rather than throwing.

- [x] **4. The page.**
      Replace the placeholder `request-builder/request-builder.ts` with the real
      page plus its template and styles, reusing `.card`, `.btn`, `.grid` and
      `.state` as the other tabs do.

      - `app-working-query-card` at the top, unchanged.
      - Request card: endpoint select, the URL block, `Send request` and
        `Copy curl`, the curl block, the design's auth note verbatim, and one
        line naming that Send goes through this console's proxy.
      - Response card: the status pill reading `Not sent` before the first send
        and the real status after; the three headers with an em dash for any the
        response omitted; the body pretty-printed when it parses as JSON and
        rendered raw when it does not; and the If-None-Match hint.
      - Both buttons disabled while the query is unsendable, with the reason
        announced, matching how every other tab declines to ask.
      - Status-code table, static.

      **Done when:** `ui` `npm test` passes with component specs for each
      response state named in In scope, the disabled-when-invalid case, the URL
      and curl updating when the endpoint or query changes, and a repeat send
      showing `304`; `ui` `npm run build` is clean.

## Files / areas

| Path | Change |
|---|---|
| `ui/src/app/core/request/request-text.ts` | new: endpoints, URLs, curl |
| `ui/src/app/app.spec.ts` | the placeholder-tab spec became a no-placeholders-left spec, and the shell now provides HttpClient |
| `ui/src/app/core/request/request-send.service.ts` | new: raw send, ETag hold |
| `ui/src/app/core/request/request-clipboard.ts` | new: the clipboard token |
| `ui/src/app/request-builder/request-builder.{ts,html,scss}` | the real page, replacing the placeholder |

No `api/` change: the proxy already relays all three headers and already passes
`If-None-Match` upstream (`api/src/macro/macro-client.ts:67`). No new dependency.

## Data / contracts

**Displayed URL**

    https://<core-api-host>/api/macro/series?indicators=GDP_GROWTH_REAL,CPI_INFLATION_AVG&countries=ZAF,NAM&yearFrom=2018&yearTo=2031&pageSize=25

**Requested URL** — `/api/macro/series?` and the identical query string.

**curl**, with a held validator:

    curl -s "https://<core-api-host>/api/macro/series?…" \
      -H "Authorization: Bearer $TOKEN" \
      -H "If-None-Match: \"v14-p1\""

`$TOKEN` is literal. No real token, host, tenant or secret is ever rendered.

**Response body rendering.** The body is service-supplied text rendered through
Angular interpolation only, which escapes it. It is never passed to `innerHTML`
and never evaluated.

## Testing

`ui` `npm test` is the gate. The send specs use the `HttpTestingController`
harness `http-macro-data.provider.spec.ts` already establishes, which gives a
real in-flight window without a hand-built double — unlike the fixture provider,
it does not resolve synchronously.

`api` is untouched and its suite is not re-run.

## Notes for the AI

- Serialise with `toMacroParams`, never by hand. It is the reason five features
  produce identical query strings.
- A `400` body is the point of this tab, not an error to hide. `macro-error.ts`
  exists to reduce a failure to a message for a result tab; this page shows what
  actually came back.
- Do not set `Cache-Control` or a cache-busting parameter on the send. The
  provider's comment explains why: the browser's own revalidation is the
  mechanism being demonstrated.
- The held ETag is per exact request. Reuse across a changed query is the same
  class of mistake the working-query guard exists to prevent.
- `elapsedMs` is measured, not estimated, and is presentation only.
