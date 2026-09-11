# Fix: Extract the shared result state machine

**Type:** Fix

**Status:** verified

**Branch:** `fix/extract-the-shared-result-state-machine`

**Fixes:** F-18, F-16, F-17

## The problem

`observations.ts` and `series.ts` hold a verbatim copy of the same result state
machine: the same `ResultState` union, the same `request`, `result`, `pagerMeta`,
`loading`, `invalid`, `unavailable`, `unavailableMessage`, `ready`, `page`,
`pageSize`, `pageCount` and `vintageLabels`, differing only in the provider
method, the payload field name and two strings.

That is F-18, and it is not a style complaint. Three consecutive repairs during
feature 8 each had to be applied identically in both files:

| Finding | Repair | Outcome |
| --- | --- | --- |
| F-11 | `loading` made per-request via `startWith` | introduced F-13 |
| F-13 | pager holds the last settled `meta` | introduced F-16 |
| F-16 | *(open)* | — |

The copies have now begun diverging in their **tests** rather than their code,
which is the configuration where one file silently keeps a defect the other
loses:

- **F-16** — `previousMeta` is captured as `this.ready()?.meta`, but `ready()` is
  null *during* loading. The hold works for the first re-query and fails for any
  issued while one is in flight, so the footer renders
  `Page 3 of 1 · pageSize 25 · vintages —` with Next disabled. Not
  paging-specific: any two working-query mutations inside one round trip take the
  same path. Neither page's specs release-then-requery twice, which is why the
  suite is green.
- **F-17** — the series tab's count assertion is `toContain('of ' + settledCount)`
  where `settledCount` is `'1'`, because 4 series fit one page. The defective
  footer also contains `of 1`, so that assertion cannot fail. The page *number*
  assertion in the same spec is a genuine guard and does fail; only the count
  assertion is dead.

## The fix

Extract the machine once into `ui/src/app/core/result-state.ts`, then fix F-16
in the extracted code so the repair exists in exactly one place.

A factory called from a field initializer, so it runs in an injection context and
can `inject(WorkingQueryStore)` itself:

```ts
createResultState<T>({ fetch, unavailable })
```

- `fetch` — the provider call, `(query) => this.macro.observations(query)`.
- `unavailable` — that tab's fallback wording.

It returns the shared primitives: `loading`, `invalid`, `unavailable`,
`unavailableMessage`, `ready`, `items`, `meta`, `totalCount`, `page`, `pageSize`,
`pageCount`, `vintageLabels`.

Each page keeps only what is genuinely its own: `rows`/`rowRange`/`empty` on
observations, `total`/`views`/`empty` on series, and each page's own
`resultSummary` wording.

**F-16's repair, made once:** capture the value the pager already derives rather
than the settled state, so the held `meta` chains through consecutive loading
states instead of being lost on the second.

### Must not break

- **The six behaviours feature 8 established.** `loading` reachable per request,
  the problem `detail` surfacing with `role="status"`, a `200` with empty `data`
  never treated as an error, the nullable `meta.page`/`pageSize` handling, plain
  `GET`s, and the envelope passing through untouched.
- **The `MacroDataProvider` seam.** This fix touches no transport, no contract
  type and nothing in `api/`.
- **Every existing assertion.** 300 `ui` specs pass today. This is a refactor:
  no spec should need rewriting except the F-17 assertion, which is being
  corrected because it is wrong.

### Out of scope

- **F-19**, the catalogue's first-load-only `loading`. It is the same *class* of
  defect but a different shape: `Loaded<T>`, three independent lists, no pager.
  Folding it in would make this a rewrite of a third page. It stays open.
- F-20, the DI deprecation warning.
- The four pre-existing `api/` findings.

## Build steps

- [x] **1. Extract the machine.** Add `ui/src/app/core/result-state.ts` with
  `createResultState<T>` and its own spec. Include F-16's repair: the loading
  state's held `meta` must chain through consecutive in-flight re-queries.
  **Done when** `result-state.spec.ts` proves, against a deferred double, that:
  a first load reports `loading` then `ready`; a re-query returns to `loading`;
  **two re-queries issued without releasing the first still report the last real
  page count, not 1**; an invalid query reports `invalid` and issues no request;
  a `MacroRequestError` with a `detail` surfaces that text and one without it
  falls back to the supplied wording; a `200` with empty `data` resolves; and
  `page`/`pageSize` fall back to the working query while `pageCount` holds.

- [x] **2. Adopt it on both pages.** Rewrite `observations.ts` and `series.ts`
  to delegate to the factory, keeping only their own derived members and
  wording. Delete the duplicated union, pipeline and pager computeds.
  **Done when** both pages' templates are unchanged, the full `ui` suite passes
  with no spec rewritten except F-17's assertion, and the net diff removes more
  lines than it adds.

- [x] **3. Correct the F-17 assertion.** Drop the degenerate
  `toContain('of ' + settledCount)` from the series spec and state plainly that
  the count is not exercisable on that tab, or seed a query that exceeds one
  page so it can fail.
  **Done when** no assertion remains that the F-13 defect satisfies, verified by
  reinstating that defect on `series.ts` alone and watching the spec fail.

## Verify

- `npm test` in `ui/` — 300 or more passing, none rewritten beyond F-17's.
- `npm run build` in `ui/` — clean.
- `npm test` in `api/` — 67 passing, proving `api/` is untouched.
- **Each repair verified by reintroducing its defect**, the practice that caught
  the weak guards in feature 8:
  - restore `previousMeta = ready()?.meta` → the new two-in-flight spec must fail
  - restore `page = ... ?? 1` → the series spec must fail
- Manually, with both servers running: on Observations, click Next twice quickly
  and confirm the footer never reads a page count of 1 or contradicts itself.
