# Fix: Steady the revisions pager and label its summary

**Type:** Fix

**Status:** verified

**Branch:** `fix/steady-the-revisions-pager-and-label-its-summary`

**Fixes:** F-26, F-27

## The problem

Two defects in the revisions panel, both found by the audit of feature 9.

### F-26 — the pager unmounts, and its count collapses behind it

`vintages.html:118` puts the table **and** `app-paging-footer` inside the final
`@else` of a chain whose first branch is `revisionsLoading()`. Clicking Next
therefore removes the pager for the whole round trip: the button vanishes from
under the pointer and the layout jumps. Observations and Series render their
footer unconditionally, so this tab is the only one of the three that does this.

Behind it sits the shape F-13 and F-16 already named twice. `pageCount` at
`vintages.ts:221` reads `readyRevisions()?.totalCount ?? 0`, and
`readyRevisions` is null while loading, so the count collapses to 1 while
`currentPage` still reports the page the user asked for.

**The two halves must be fixed together.** Rendering the footer unconditionally
— the obvious repair for the first half — would immediately surface
`Page 3 of 1` with Next disabled, which is the second half made visible. This is
the fourth appearance of this pattern (F-11, F-13, F-16, F-26); `result-state.ts`
already solved it for the other two tabs and this page did not carry the lesson
across.

### F-27 — the summary answers a different question from the table above it

`vintages.ts:243` derives `appeared` and `disappeared` from `views()`, the whole
page, while the table renders `rows()`, the page filtered by `Significant only`.
An appeared row can never be significant, because its change is null, so turning
the filter on empties those rows from the table while the panels keep listing the
same series.

## The fix

### F-26: hold the last settled total, then render the footer always

Mirror `result-state.ts` exactly, because that is the version of this fix that
has already survived a review:

```ts
| { status: 'loading'; previousTotal: number | null }
```

Evaluated where the inner pipe is built, so it captures the total that was last
settled. A `pagerTotal` computed reads the settled total when there is one and
the held total while a request is in flight; `pageCount` derives from that.

Then move `app-paging-footer` out of the `@else` so it renders whenever a vintage
is selected, matching Observations and Series.

`ListState` is shared with the vintages list, which issues one request and has no
pager. It passes `previousTotal: null`.

### F-27: label the panels rather than filter them

Keep the panels on `views()` and change the titles from
`Series that appeared · this page` to `Series that appeared · this page,
unfiltered`.

**Considered and rejected:** deriving the panels from `rows()` so the filter
reaches them. That would make `Significant only` hide every appeared and
disappeared series permanently, because a null change can never be significant —
the filter would silently delete the one category it can never surface.
Labelling keeps both regions truthful about what they are answering.

### Must not break

- Every state feature 9 established: nothing selected, loading, unavailable with
  the service's `detail`, a vintage that changed nothing, the filter emptying the
  table, and the cap with its overflow count.
- Selecting a different vintage still returns to page 1.
- The 429 existing specs pass, with no assertion edited except the two summary
  titles that this fix deliberately changes.

### Out of scope

- **F-19**, the catalogue's first-load-only `loading`. It is the last unrepaired
  instance of the F-11 shape but a different page and a different state type.
- Extracting a shared pager. Three tabs now hold the same held-total idea, which
  is worth revisiting — but as its own change, and not while a fourth consumer
  might arrive first.

## Build steps

- [x] **1. Hold the total and render the footer always.** Add `previousTotal` to
  the loading state, add `pagerTotal`, derive `pageCount` from it, and move the
  footer out of the `@else`.
  **Done when** a spec driving a **deferred** provider double proves: the footer
  is present during loading, during the unavailable state, and when a vintage
  changed nothing; mid-flight it reports the asked-for page and the last real
  count and never `Page N of 1`; and Prev stays reachable from page 2. Verified
  by reinstating the collapse (`readyRevisions()?.totalCount ?? 0`) and watching
  those specs fail.

- [x] **2. Label the summary panels.** Change both titles to say `unfiltered`.
  **Done when** a spec asserts the rendered titles, and asserts that turning
  `Significant only` on empties the table while the appeared panel still lists
  its entry — the behaviour the label now explains.

## Verify

- `npm test` in `ui/` — 429 plus the new cases; the only edited assertions are
  the two summary titles.
- `npm run build` and both `tsc --noEmit` projects in `ui/` — clean.
- `api/` untouched, provable from `git diff --name-only`.
- **Reintroduce the collapse to prove the guard**, as every repair in this family
  has.
- Manually, with both servers running: on **Vintages & revisions**, select a
  vintage with more than 25 revisions and click Next. The footer must stay on
  screen throughout, keep showing the real page count, and never read
  `Page 2 of 1`.

## Findings

Resolved findings, archived with this work item.

> Both were raised against the working-query store and repaired by the two fixes
> that preceded this one. They were still `fixed` when those completed, so they
> stayed in the live ledger; the `/audit full` pass that closed them ran
> afterwards. They archive here because this is the next completion, not because
> this fix resolved them. Each entry's **Found** line preserves where it came
> from.

### steady-the-revisions-pager/F-24 [P3] closed - sameWorkingQuery is not exhaustive by construction, so a new query field would be silently ignored

**File:** ui/src/app/core/working-query.ts:92
**Found:** 2026-09-11 by /audit (scope: full; lens: quality)
**Why it matters:** The comparison lists all nine fields of `WorkingQuery` by
hand. Adding a tenth field compiles cleanly: `DEFAULT_WORKING_QUERY` fails
typecheck until the field is given a default, which is the safety net people will
notice, but `sameWorkingQuery` does not, and neither does anything else. The
store would then treat a mutation of that field as a no-op and refuse it
outright. That is strictly worse than the wasted request F-22 removed: a swallowed
mutation is a control that does nothing, and the suite would stay green because
no spec can know about a field that does not exist yet.

Its own doc comment already warns a reader to keep the list in step, which is an
admission that nothing enforces it. Feature 10 is the likely trigger: a saved
query wants an identifier or a name on the working query, and both are fields a
user can change.
**Suggested fix:** make the key list checkable by the compiler, for example
`const COMPARED = { indicators: true, ... } satisfies Record<keyof WorkingQuery, true>`
and iterate it, or destructure the parameter so an unhandled field is an unused
binding. Either turns the next added field into a compile error instead of a
silently dead control.
**Resolution:** Fixed on 2026-09-11 with the first suggestion. `COMPARED` in
`working-query.ts` lists the nine keys under
`satisfies Record<keyof WorkingQuery, true>`, and `sameWorkingQuery` iterates it,
dispatching on `Array.isArray` so a future array field gets content comparison
rather than identity by default. `===` was kept over `Object.is`; they differ on
`-0` and this was a no-behaviour change.

The second suggestion does not work here and should not be retried:
`ui/tsconfig.json` does not set `noUnusedLocals`, so an unhandled destructured
field is not an error and would enforce nothing.

Verified by probe, since no test can observe a field nobody has added. Adding
`savedQueryName: string` to `WorkingQuery` fails with
`TS1360 ... 'savedQueryName' is missing in type ... Record<keyof WorkingQuery, true>`
at `COMPARED`; misspelling a key as `pageSizze` fails with `TS2561`, so the guard
holds in both directions. A runtime companion spec drives a sentinel value
through every key of `DEFAULT_WORKING_QUERY` and asserts each is compared, which
catches drift within a single compile. No existing assertion was edited: `ui`
419 tests, up from 418 by exactly the one added.


**Re-review 2026-09-11 (/audit full):** Closed. `working-query.ts` declares
`COMPARED` under `satisfies Record<keyof WorkingQuery, true>` and
`sameWorkingQuery` iterates `COMPARED_KEYS`, dispatching on `Array.isArray` so a
future array field gets content comparison by default. The `satisfies` clause is
present and the nine keys match the interface exactly. `===` was kept, so the
`-0` semantics are unchanged. No new defect: the runtime companion spec drives a
sentinel through every key of `DEFAULT_WORKING_QUERY`, and no existing assertion
in that file was edited.

### steady-the-revisions-pager/F-25 [P3] closed - The store has four mutation paths and three different no-op guards

**File:** ui/src/app/core/working-query.store.ts:74
**Found:** 2026-09-11 by /audit (scope: full; lens: quality)
**Why it matters:** After the F-22 repair the store guards no-op mutations three
different ways. `patch` and `setPage` compare through `settle`. `addTo` and
`removeFrom` keep their own inline `includes` check, which is equivalent but
separate. `reset()` at line 74 has no guard at all: it assigns
`DEFAULT_WORKING_QUERY` by reference, so resetting a query that is structurally
default but a different object, which is what "add an indicator, remove it,
press Reset" produces, mints a new identity and notifies every reader.

Nothing breaks today. That reset case ends with an empty `indicators`, so
`validation()` is invalid, `request` is null and no HTTP goes out; the cost is
recomputation, not a round trip. The concern is structural rather than current:
F-22 existed because one mutator was written without the guarantee the others
had, and the repair left the surface in the same shape it was in when that
happened. Feature 10 adds the mutator most likely to repeat it, because loading a
saved query writes the whole object at once.
**Suggested fix:** route every mutation through `settle`, including `reset`
(`settle(current, DEFAULT_WORKING_QUERY)`) and the two array helpers, so the
guarantee is a property of the store rather than a habit each method has to
remember. The inline `includes` checks then become redundant and can go.
**Resolution:** Fixed on 2026-09-11. `settle` became `mutate`, a private method
taking a `(current) => candidate` function and performing the only write to
`state` in the file; `patch`, `setPage`, `reset`, `addTo` and `removeFrom` are
all one-line callers. The structural claim is checkable rather than visual:
`this.state.update(` and `this.state.set(` now appear once in total, so a future
mutator cannot bypass the guarantee without deliberately reaching past it.

**One part of this finding was wrong and following it literally would have
introduced a bug.** It says both inline `includes` checks become redundant. That
holds for `removeFrom`, whose filter yields an equal-content array that the
comparison recognises, and the check was removed. It does not hold for `addTo`:
appending a code already present produces a genuinely different array, so the
comparison would correctly report a change and `indicators=GDP,GDP` would reach
the query string. That check is a de-duplication rule rather than a no-op
optimisation; it stayed, and its comment now says why.

Verified by removing the comparison from `mutate`: 13 specs fail, including one
pre-existing case that now depends on `mutate` rather than `removeFrom`'s own
check, which is the consolidation working. No existing assertion was edited.
`ui` 429 tests, up from 419.


**Re-review 2026-09-11 (/audit full):** Closed. `this.state.update(` appears
exactly once in `working-query.store.ts`, inside `mutate`, and all five mutators
route through it: `setPage`, `reset`, `addTo`, `removeFrom` and `patch`. The
structural claim the finding asked for therefore holds by construction rather
than by consistency. The repair also correctly declined this finding's advice to
drop both inline `includes` checks: `addTo` keeps its membership check, because
appending a code already present would produce a genuinely different array and
put `indicators=GDP,GDP` on the wire. That correction is recorded in the fix
archive and covered by a spec. No new defect in this file.
