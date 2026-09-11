# Fix: Clear the response when the request changes

**Type:** Fix
**Status:** verified
**Branch:** fix/clear-the-response-when-the-request-changes
**Fixes:** F-38

## The problem

`selectEndpoint` at `ui/src/app/request-builder/request-builder.ts:76` clears
`result` and `copied`, with the comment *"the previous answer described a
different request"*. The reasoning is right and it covers only one of the two
ways a request changes.

`app-working-query-card` sits directly above on the same page. Editing an
indicator, a country or a year changes `consumerUrl`, `curl` and the request key,
and nothing clears the Response card: it goes on showing the previous status, its
three headers and its body. One screen, two regions, different questions, no cue.
`copied` has the same gap — "curl copied." can outlive the curl it described.

The export card has the same shape and is unreachable there, because its query is
edited on another tab and the component is destroyed in between. Here both live
in one viewport.

## The fix

An `effect` on `proxyUrl()` clears `result` and `copied`. That signal derives
from the endpoint and the query together, so it moves for either cause, and
`selectEndpoint`'s two manual resets come out.

**The in-flight window is the part that needs care, and skipping it would
introduce the defect this fix exists to remove.** `send()` awaits, then assigns.
Edit the query while a request is in flight and the sequence is: the effect
clears the response, the await resolves, and the old query's answer is written
into a card whose URL block now shows a different request. That is the same
window F-11, F-13, F-16, F-26 and F-29 all lived in, arriving by a new route.

So the send must capture the request key it asked for and discard an answer that
is no longer current, exactly as `result-state.ts` captures `asked` where the
request is built and `LastResultMeta` refuses a meta whose query has moved on.

Three things it must not break:

- **A normal send still lands.** Capturing a key must not drop the answer to a
  request nobody changed.
- **Selecting the already-selected endpoint changes nothing.** Angular signals
  compare with `Object.is`, so setting the same value does not notify and the
  effect does not run; `selectEndpoint` can lose its early return along with the
  resets.
- **The held validator is untouched.** It lives in `RequestSendService` and is
  already keyed per request. This fix is about what the card displays, not about
  what the next request sends.

Out of scope: **F-37**, the bare `this.result();` dependency in `heldEtag`, and
**F-39**, the validator outliving the card. Both are in the same file, and the
audit noted F-38 and F-39 could be repaired together; they are separate findings
and are not folded in here.

## Build steps

- [x] **1. Clear the response when the request key changes, and discard a late answer.**
      In `request-builder.ts`:

      - Add an `effect` field that reads `proxyUrl()` and clears `result` and
        `copied`. Comment why it reads the URL rather than the endpoint: the URL
        is the request, and both the endpoint and the query move it.
      - Reduce `selectEndpoint` to `this.endpoint.set(spec.endpoint)`.
      - In `send()`, capture `proxyUrl()` before awaiting and assign the outcome
        only when it still matches after. Say in a comment that this is the
        in-flight window, and that without it the effect above would leave behind
        the stale answer it just cleared.

      Specs in `request-builder.spec.ts`:

      - a settled response is cleared when an indicator, a country or a year
        changes, and the status pill returns to `Not sent`
      - the `copied` message is cleared by the same change
      - changing the endpoint still clears, so the behaviour `selectEndpoint`
        used to own survives its own deletion
      - selecting the already-selected endpoint leaves a settled response alone
      - **an answer that arrives after the query changed is discarded**: send,
        edit the query while the request is held open, then flush it, and assert
        the card still reads `Not sent` with no body
      - an ordinary send still settles and renders

      `HttpTestingController` holds a request open, so the in-flight case is a
      real window rather than a zero-width one.

      **Done when:** `ui` `npm test` passes with the new cases, `ui`
      `npm run build` is clean, and removing the request-key comparison from
      `send()` fails the late-answer spec rather than passing quietly.

## Verify

1. `cd ui && npm test` — all specs pass, including the late-answer case.
2. `cd ui && npm run build` — clean.
3. By hand: both servers up → **Request builder**. Build a query, press
   **Send request**, then add a country. The URL and curl update and the Response
   card returns to `Not sent` rather than keeping the previous answer. Press Send
   again and the new answer lands normally.

## Findings

Resolved and archived with this fix. IDs are prefixed with this archive
name, which is their permanent form.

### clear-the-response-when-the-request-changes/F-36 [P3] closed - A newline in an attribution line or a vintage label breaks out of the CSV header comments

**File:** ui/src/app/core/export/export-csv.ts:74
**Found:** 2026-09-11 by /audit (scope: full; lens: security)
**Why it matters:** Every data field goes through `csvField`, which quotes and
now guards it. The header comment lines do not: `toCsv` interpolates
`meta.attribution` straight into `` `${COMMENT}${line}` `` at `:74`, and
`vintageHeader` at `:92` joins `vintage.label` the same way. Both strings come
from the Core API.

A newline in either value ends the comment and starts a new physical line with
no `# ` prefix, above the column header. A reader is then handed a line it
cannot classify: too few columns to be a row, not marked as a comment, and
positioned where the header is expected. A carriage return does the same. The
file stops being well formed, and unlike F-34 no hostile intent is needed —
a multi-line attribution string is an ordinary thing for an upstream to send.

F-34 deliberately ruled these lines out of scope, and correctly, on the grounds
that a `# ` prefix means they can never begin with a formula character. That
reasoning holds for formula injection and says nothing about line injection,
which is a different failure of the same untrusted text.
**Suggested fix:** strip or replace CR and LF in every value interpolated into a
comment line, in one small helper beside `csvField` so both the attribution loop
and `vintageHeader` use it. Collapsing them to a space keeps the text readable
and cannot break the line structure.
**Resolution:** Fixed on 2026-09-11 as suggested. `commentSafe` at
`export-csv.ts:115` collapses any run of CR and LF to one space and trims the
ends, applied to each attribution entry, to each `vintage.label` inside
`vintageHeader`, and to the stamp. The stamp does not need it — it is sliced to
ten characters first — and goes through anyway so no reader has to work out which
of the three is the exception.

Collapsed rather than stripped: a line wrapped mid-sentence would otherwise read
as `IMFWorld Economic Outlook`.

Eight specs. Two of them exist to stop the helper being over-applied: an ordinary
attribution line must be byte-for-byte unchanged, and a newline inside a *data*
field must still be quoted and preserved, because RFC 4180 handles that case
correctly and the comment lines are the only place with no such mechanism.

Probed by reverting `commentSafe` to the identity function, which failed six
specs including the header-position case this finding is actually about, and left
those same two passing — the split the probe was designed to show. Restored and
re-run green at 604.

Not covered: the defect in the wild. It needs an upstream returning a multi-line
attribution string, and the live service returns single-line values.

Closed at 666f4c6 by this pass. Re-examined `export-csv.ts`: `commentSafe` at
`:115` collapses any run of CR and LF to one space and trims, and it is applied at
all three sites — the stamp at `:65`, each attribution entry at `:75`, and each
`vintage.label` at `:94`. Data fields still go through `csvField` alone, so a
newline inside a value is still quoted and preserved. No new defect in the
repaired region, and the XLSX removal that landed in the same commit did not
touch this file.
