# Fix: Route every query mutation through one guard

**Type:** Fix

**Status:** verified

**Branch:** `fix/route-every-query-mutation-through-one-guard`

**Fixes:** F-25

## The problem

`ui/src/app/core/working-query.store.ts` guards no-op mutations three different
ways:

| Path | Guard |
| --- | --- |
| `patch`, `setPage` | compare through `settle` |
| `addTo`, `removeFrom` | their own inline `includes` check |
| `reset` | **none** |

`reset()` assigns `DEFAULT_WORKING_QUERY` by reference, so resetting a query that
is structurally default but a different object — what "add an indicator, remove
it, press Reset" produces — mints a new identity and notifies every reader.

Nothing breaks today: that path ends with an empty `indicators`, so
`validation()` is invalid, `request` is null, and no HTTP goes out. The cost is
recomputation, not a round trip.

**The concern is structural.** F-22 existed because one mutator was written
without the guarantee the others had, and its repair left the surface in exactly
the shape that allowed it. Feature 10 adds the mutator most likely to repeat it,
because loading a saved query writes the whole object at once.

## The fix

One private `mutate` that every public method must go through, so
`this.state.update` has exactly one call site:

```ts
private mutate(next: (current: WorkingQuery) => WorkingQuery): void {
  this.state.update((current) => {
    const candidate = next(current);
    return sameWorkingQuery(current, candidate) ? current : candidate;
  });
}
```

`patch`, `setPage`, `reset`, `addTo` and `removeFrom` all become one-line callers.
`settle` folds into `mutate` and disappears. The guarantee stops being a habit
each method has to remember and becomes the only way to write to the signal.

### One correction to the finding

F-25 says the inline `includes` checks "become redundant and can go". That is
true for `removeFrom` and **false for `addTo`**:

- `removeFrom` — filtering for a code that is not present yields an
  equal-content array, so the guard sees no change and returns `current`. The
  check is genuinely redundant and goes.
- `addTo` — appending a code that is already present **adds a duplicate**. The
  array genuinely differs, so the guard correctly reports a change and the
  duplicate lands in the query string. Its check is a de-duplication rule, not a
  no-op optimisation, and **must stay**. Its comment should say so, because the
  next reader will make the same mistake this finding did.

### Must not break

- **Every real change still emits.** As with F-22, the risk is the inverse of the
  bug: a guard that swallows a genuine mutation is worse than the recomputation
  it saves.
- `addIndicator` with a code already present must not duplicate it.
- The F-22 and F-24 guarantees hold unchanged.
- All 419 existing specs pass **unedited**.

### Out of scope

- Adding new mutators. This fix only makes the next one safe.
- Any change to `sameWorkingQuery` itself, which F-24 just settled.

## Build steps

- [x] **1. One write path.** Add `mutate`, route all five mutators through it,
  delete `settle`, drop `removeFrom`'s redundant check, and keep `addTo`'s with a
  comment explaining that it prevents duplicates rather than emissions.
  **Done when** all of these hold:
  - `this.state.update(` and `this.state.set(` appear **once in total** in the
    file, inside `mutate` — the structural claim, checkable with a search;
  - a spec proves reference identity survives a no-op for **every** mutator,
    including `reset()` on a state that is structurally default but a different
    object;
  - a spec proves `addIndicator` with a code already present neither duplicates
    it nor changes identity;
  - every real change still produces a new reference, one case per mutator;
  - the 419 existing specs pass with no assertion edited.

## Verify

- `npm test` in `ui/` — 419 plus the new cases, none rewritten.
- `npm run build` and both `tsc --noEmit` projects in `ui/` — clean.
- `api/` untouched, provable from `git diff --name-only`.
- **Reintroduce the defect to prove the guards**, as every repair in this area
  has: drop the comparison from `mutate` and confirm the new no-op specs fail.
- Manually, with both servers running: on Observations, add an indicator, remove
  it, then press **Reset** twice. Neither press should change anything on screen
  or issue a request.
