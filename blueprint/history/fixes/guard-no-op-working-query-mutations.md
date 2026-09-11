# Fix: Guard no-op working-query mutations

**Type:** Fix

**Status:** verified

**Branch:** `fix/guard-no-op-working-query-mutations`

**Fixes:** F-22

## The problem

`working-query.store.ts:95` — `patch()` always spreads into a new object, so
`setSource('preferred')` on a query already set to `preferred` produces a new
`WorkingQuery` identity. `apiQuery` recomputes, `request` returns a fresh object,
`toObservable` emits, and a full HTTP round trip goes out for a query that did
not change. `setPage` at line 66 has the same shape.

`addTo` and `removeFrom` are already guarded and return `current` unchanged on a
no-op. That asymmetry is what makes the gap look accidental rather than
considered.

**Not reachable from the UI today.** Every caller is a `<select>` or number
`(change)` handler, and those fire only on a real change. That is why the finding
is P3 and why this fix is cheap now and awkward later: feature 10 reloads a saved
query by writing a whole `WorkingQuery` back through these setters, and reloading
the query already on screen is the ordinary case, not the edge one.

## The fix

Compare before updating, in the one place that owns mutation.

Add a pure `sameWorkingQuery(a, b)` to `core/working-query.ts`, beside
`validateWorkingQuery` and `toObservationsQuery`, which already own this type's
logic. Then `patch` and `setPage` build the next state, compare, and return
`current` when nothing changed — so the signal never notifies and no request is
issued.

**Build-then-compare, not compare-the-changes.** Comparing only the incoming
keys would miss that `patch` also forces `page: 1`: patching an unchanged
`source` while on page 3 *is* a real change. Building the candidate first makes
that fall out correctly instead of needing a special case.

**The comparison must handle the arrays.** `indicators` and `countries` are
compared by content, not identity. Nothing routes them through `patch` today, so
a scalar-only compare would pass its tests and then be silently wrong the first
time a future setter does. The equality function owns the whole type or it is not
worth having.

### Must not break

- **Every real change still emits.** The risk of this fix is the opposite of the
  bug: an over-eager guard that swallows a genuine mutation is far worse than the
  wasted request it replaces. Each field needs a test proving a real change still
  produces a new identity.
- `reset()` is untouched. It assigns `DEFAULT_WORKING_QUERY` by reference, so
  resetting an already-default store is already a no-op through signal equality.
- The 317 existing specs pass unchanged.

### Out of scope

- **F-21**, the held page count after a filter change. Adjacent and tempting,
  but it changes pager behaviour and wants its own verified change.
- Memoising `apiQuery`. The guarantee belongs in the store that owns mutation,
  not in a computed downstream of it.

## Build steps

- [x] **1. Add the equality function.** Export `sameWorkingQuery(a, b)` from
  `core/working-query.ts`, comparing every field of `WorkingQuery` with arrays by
  content.
  **Done when** `working-query.spec.ts` proves it: identical queries match;
  a difference in **each** of the nine fields is detected, one case per field;
  arrays with equal contents but different identities match; arrays differing
  only in order do **not** match, because a reordered query is a different
  request string.

- [x] **2. Guard `patch` and `setPage`.** Both build the candidate state, compare
  with `sameWorkingQuery`, and return `current` when equal.
  **Done when** `working-query.store.spec.ts` proves that a no-op
  `setSource`, `setForecast`, `setVintage`, `setYearRange` and `setPage` each
  leave `store.query()` **reference-identical**, that the same calls with a real
  value produce a new reference, and that patching an unchanged filter while on
  page 3 still resets to page 1 and therefore still counts as a change.

- [x] **3. Prove the request is not re-issued.** The finding is about a wasted
  round trip, so assert that rather than only the reference.
  **Done when** a spec drives `createResultState` through a counting double and
  shows the call count unchanged across a no-op mutation, and incremented across
  a real one.

## Verify

- `npm test` in `ui/` — 317 existing plus the new specs, none rewritten.
- `npm run build` and both `tsc --noEmit` projects in `ui/` — clean.
- `api/` untouched, provable from `git diff --name-only`.
- **Reintroduce the defect to prove the guards**, as with every repair in this
  area: drop the comparison from `patch` and confirm the step 2 and step 3 specs
  fail.
- Manually, with both servers running: on Observations, re-select the Source
  value that is already selected. The network tab should show **no** new
  `/api/macro/observations` request, and the table must not flash its loading
  state.
