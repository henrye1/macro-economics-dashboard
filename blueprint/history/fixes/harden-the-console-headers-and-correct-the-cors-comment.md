# Fix: Harden the console headers and correct the CORS comment

> **Generated file.** Holds the one feature, fix, or rollback being built right now.

**Type:** Fix
**Status:** verified
**Branch:** fix/harden-the-console-headers-and-correct-the-cors-comment
**Fixes:** F-99, F-100

## The problem

**F-99 [P3], `render.yaml:43`.** The console static site declares `routes` but
no `headers`. Render therefore serves the sign-in and set-password screens with
no `X-Frame-Options`, no `X-Content-Type-Options` and no `Referrer-Policy`. Any
site can frame a page that takes a password, which is the setup for clickjacking.

**F-100 [P3], `api/src/app.ts:29`.** The comment on `exposedHeaders` says "The
console is served from a different origin in production". Feature 13 made that
false: the console's `/api/*` rewrite keeps every browser request on the
console's own origin, and `http-macro-data.provider.ts` now says so. Two comments
contradict each other about the deployment, and the wrong one sits on
security-relevant middleware.

## The fix

- **`render.yaml`:** add a `headers` block to `macro-economics-console` for
  `path: /*`:

  | Header | Value |
  |---|---|
  | `X-Frame-Options` | `DENY` |
  | `X-Content-Type-Options` | `nosniff` |
  | `Referrer-Policy` | `strict-origin-when-cross-origin` |

  Nothing in the console is meant to be embedded, so `DENY` costs nothing.
  `X-Frame-Options` is used rather than a CSP `frame-ancestors` directive
  because a CSP is a separate decision: `index.html` loads Google Fonts from two
  origins, and a policy that misses one breaks the icons (see F-46).
- **`api/src/app.ts`:** reword the comment. `exposedHeaders` stays exactly as it
  is. The comment should say these headers only matter when the console calls
  the API cross-origin, which neither development (`proxy.conf.json`) nor
  production (the rewrite) does, and that they are kept so a direct caller can
  still read `ETag`, `Cache-Control` and `X-Total-Count`.

Must not break: the route order in `render.yaml` (`/api/*` before `/*`), the CORS
behaviour itself, and the response headers the API sends through the rewrite.
Static-site headers apply to files the console serves. Whether Render also adds
them to responses proxied by the `/api/*` rewrite is not documented, and it does
not matter here because none of the three changes how a JSON response is read.

## Build steps

- [x] **1. Headers and comment.**
      Add the `headers` block and reword the comment.
      **Done when:** `render.yaml` declares the three headers under the console
      service with `path: /*`, and the routes are unchanged; `app.ts` changes
      only in comment lines; `npm run typecheck` and `npm test` pass in `api/`.

## Verify

- `git diff` shows `app.ts` changing only comment lines, and `render.yaml`
  gaining one `headers` block on the console.
- `npm run typecheck` and `npm test` in `api/`.
- After the next deploy, `curl -I https://macro-economics-console.onrender.com/sign-in`
  shows all three headers. That is the only real proof, because Render applies
  the headers, not the local build. Until a deploy, record it as not observed.

## Findings

Resolved with this fix and archived from the live ledger. IDs carry the
archive prefix so they stay unique across the project history.

### harden-the-console-headers-and-correct-the-cors-comment/F-99 [P3] closed - The console static site declares no response headers, so the sign-in screens can be framed

**File:** render.yaml:43
**Found:** 2026-10-05 by /audit independent (scope: current; lens: security)
**Why it matters:** The console service declares `routes` but no `headers`, so Render serves the sign-in and set-password screens with no `X-Frame-Options` or `frame-ancestors`, no `X-Content-Type-Options` and no `Referrer-Policy`. A page that takes a password can be framed by any site for clickjacking. F-75 records the API-side equivalent and expected feature 13 to add headers; neither service gets any here. Low risk, cheap to close.
**Suggested fix:** add a `headers` block to the console service for `path: /*` setting `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin`; a CSP can follow later.
**Resolution:** Fixed 2026-10-05 by /implement (fix/harden-the-console-headers-and-correct-the-cors-comment). The console service in `render.yaml` declares `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin` for `path: /*`; routes unchanged. Not observed on Render until a deploy (`curl -I` on the console). Closed 2026-10-05 by /audit independent (claude-opus-5-5, fresh subagent) at 3bdb2f4: headers block sits on the console service only, three entries for `path: /*` with the specified values, `/api/*` rewrite still precedes `/*`; no new defect. Live `curl -I` still not observed until a deploy.

### harden-the-console-headers-and-correct-the-cors-comment/F-100 [P3] closed - The CORS comment says the console is cross-origin in production, which this feature makes false

**File:** api/src/app.ts:29
**Found:** 2026-10-05 by /audit independent (scope: current; lens: quality)
**Why it matters:** `app.ts:29` justifies `exposedHeaders` with "The console is served from a different origin in production". This delta's `render.yaml` and the rewritten `http-macro-data.provider.ts:23-29` comment both say the browser only ever talks to the console's own origin and never crosses an origin. Two code comments now contradict each other on the deployment shape, and the wrong one sits on security-relevant middleware. Distinct from F-41, which is the plan's sentence.
**Suggested fix:** reword to say the exposed headers matter only if the console ever calls the API directly; the production rewrite keeps requests same-origin.
**Resolution:** Fixed 2026-10-05 by /implement (fix/harden-the-console-headers-and-correct-the-cors-comment). The `exposedHeaders` comment in `app.ts` now says only a cross-origin caller needs them and the console is never one; the CORS config is unchanged (diff touches comment lines only). Closed 2026-10-05 by /audit independent (claude-opus-5-5, fresh subagent) at 3bdb2f4: `app.ts` diff is comment-only, `exposedHeaders` and `origin` unchanged, new wording agrees with `ui/proxy.conf.json`, the `render.yaml` rewrite and `http-macro-data.provider.ts`; typecheck and 96 tests pass.

## Independent review

**Status:** passed
**Target commit:** 3bdb2f4f5e8bd49d0c906c2dd2767a6c48a2eb68
**Base commit:** f002df693c85e2124d2416cb100348b677065b41
**Base ref:** master
**Spec hash:** 23eaf01434e734e63239f59b053307b7a12bbc18496f6a69cc233268824fb1a9
**Prepared by:** claude
**Builder model:** claude-opus-5-5
**Requested reviewer:** claude
**Requested model:** claude-opus-5-5
**Requested execution:** automatic
**Requested at:** 2026-10-05T10:22:45Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5-5
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-10-05T10:24:02Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

### Commands

- `git rev-parse HEAD`, `git merge-base master HEAD`, `sha256sum blueprint/context/current-feature.md`, `git status --porcelain -uall`: pass (target, base, spec hash match; only review.md modified)
- `npm run typecheck` (api/): pass
- `npm test` (api/): pass (6 files, 96 tests)

### Evidence

- `git diff f002df6..3bdb2f4 -- api/src/app.ts`: comment lines only; `origin` and `exposedHeaders` unchanged.
- `render.yaml`: console service gains one `headers` block (X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, all `path: /*`); API service untouched; `/api/*` rewrite still precedes `/*`.
- New `app.ts` comment agrees with `ui/proxy.conf.json`, the `render.yaml` rewrite and `ui/src/app/core/http/http-macro-data.provider.ts:23-29`; `index.html` Google Fonts origins match the render.yaml CSP note.
- No P0 or P1 finding is `open` or `fixed` in the ledger.

### Findings

- F-99 [P3] closed - console static site headers added
- F-100 [P3] closed - CORS comment corrected
- No new findings

### Remaining risk

- Render applying the console headers is not observed until a deploy (`curl -I https://macro-economics-console.onrender.com/sign-in`); no local Render blueprint validator or YAML parser was available, so `render.yaml` was checked by inspection only.
- No CSP / `frame-ancestors` yet (deliberately deferred per spec, see F-46); API-side headers remain tracked separately (F-75).
- `/check` not run (not required); no ui tests run (delta has no ui code).
