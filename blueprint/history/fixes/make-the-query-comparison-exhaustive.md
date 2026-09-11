# Fix: Make the query comparison exhaustive

**Type:** Fix

**Status:** verified

**Branch:** `fix/make-the-query-comparison-exhaustive`

**Fixes:** F-24

## The problem

`ui/src/app/core/working-query.ts:92` — `sameWorkingQuery` lists all nine fields
of `WorkingQuery` by hand:

```ts
sameCodes(a.indicators, b.indicators) &&
a.yearFrom === b.yearFrom &&
…
```

Adding a tenth field compiles cleanly. `DEFAULT_WORKING_QUERY` fails typecheck
until the field gets a default, which is the safety net a reader notices, but
nothing checks the comparison. The store would then treat a mutation of that
field as a no-op and **refuse it outright**.

That is worse than the wasted request F-22 removed. A swallowed mutation is a
control that silently does nothing, and the suite stays green because no spec can
know about a field that does not exist yet. The function's own doc comment warns
the reader to keep the list in step — an admission that nothing enforces it.

**Feature 10 is the likely trigger.** A saved query wants a name or an identifier
on the working query, and both are fields a user can change.

## The fix

Make the field list checkable by the compiler.

```ts
const COMPARED = {
  indicators: true,
  countries: true,
  …
} satisfies Record<keyof WorkingQuery, true>;
```

`satisfies` fails the build in two directions: a missing key when `WorkingQuery`
gains a field, and a stray key when one is removed or renamed. `sameWorkingQuery`
then iterates `COMPARED` rather than naming fields inline.

Per field: arrays compare by content **and order** through the existing
`sameCodes`, everything else with `===`. Dispatch on `Array.isArray` at runtime,
so a future array field gets content comparison by default rather than the
identity comparison that would be silently wrong.

**Not the destructuring approach.** The finding offered
"destructure so an unhandled field is an unused binding" as an alternative.
`ui/tsconfig.json` does not set `noUnusedLocals`, so an unused binding is not an
error and that approach would enforce nothing. Checked before choosing.

### Must not break

- **Behaviour is identical.** Every existing `sameWorkingQuery` spec must pass
  **unchanged**. This is a restructuring of how the fields are enumerated, not a
  change to what counts as equal.
- `===` stays, rather than `Object.is`. They differ on `-0`, and matching the
  current semantics exactly is the point of a no-behaviour change.
- The F-22 guarantee holds: `patch` and `setPage` still refuse no-op mutations,
  and every real change still emits.

### Out of scope

- **F-25**, the store's four mutation paths and three guard idioms. It is the
  natural companion to this fix and touches the same area, but it changes which
  mutations are guarded, and that is behaviour. It gets its own verified change.
- Adding a field to `WorkingQuery`. This fix only makes the next one safe.

## Build steps

- [x] **1. Enumerate the compared fields once, under `satisfies`.** Replace the
  inline conjunction in `sameWorkingQuery` with iteration over a `COMPARED` key
  map, keeping `sameCodes` for arrays and `===` for the rest.
  **Done when** all three of these hold:
  - every existing `sameWorkingQuery` spec passes with **no existing assertion
    edited**, proving behaviour did not move;
  - a new spec asserts at runtime that the compared keys exactly match the keys
    of `DEFAULT_WORKING_QUERY`, so the list cannot drift from the real shape even
    within one compile;
  - **temporarily adding a field to `WorkingQuery` makes `npx tsc -p
    tsconfig.app.json --noEmit` fail at `COMPARED`**, and removing it again
    restores a clean typecheck. Record the exact error in the review packet, then
    revert the probe.

## Verify

- `npm test` in `ui/` — 418 passing plus the new runtime check, with
  `git diff --name-only` showing `working-query.ts` and its spec as the only
  changed source files.
- `npm run build` and both `tsc --noEmit` projects in `ui/` — clean.
- `api/` untouched, provable from `git diff --name-only`.
- **The compile-error probe is the real proof.** A green suite cannot demonstrate
  this fix, because the defect is about a field nobody has added yet. Run the
  probe and record its output.
- Nothing to click. The change has no runtime behaviour.
