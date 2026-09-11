# Fix: Unlatch the save button after a refused write

**Type:** Fix
**Status:** verified
**Branch:** fix/unlatch-the-save-button
**Fixes:** F-28

## The problem

`SavedQueryStore.save` sets `failure` when `storage.setItem` throws
(`ui/src/app/core/saved-query.store.ts:90-95`) and clears it only after a later
write succeeds (`:97`). But the page gates on that flag first:

- `saveBlockedReason` returns `storageProblem()` before any other check
  (`ui/src/app/saved-queries/saved-queries.ts:46-57`)
- `canSave` is therefore false, and the button is `[disabled]`
  (`ui/src/app/saved-queries/saved-queries.html:76`)

The only write that could clear the flag is the one the flag prevents. A single
`QuotaExceededError` latches the card for the rest of the session: the user
cannot retry after freeing space, and only a reload recovers it, because the
store re-reads storage in its constructor. `setName` clears the confirmation
(`saved-queries.ts:34-37`) but not the failure.

The spec that covers this path asserts only that the name survives, and its
comment states a behaviour the code does not have:

    // The name survives, so the user can retry rather than retype.
    expect(nameInput()?.value).toBe('Rejected');

That is `saved-queries.spec.ts:347-348`, and it is the F-17 shape again: a test
whose stated intent and whose assertion disagree.

## The fix

Give the store a way to drop a **write** failure, and call it when the user edits
the name — the same gesture that already clears the confirmation. The next Save
then reaches storage and either succeeds or re-sets the flag with a current
answer.

Two things it must not break:

- **The unusable-storage state stays latched.** When `storage === null` the
  browser has no storage at all, so clearing the message would enable a Save that
  can never work. The new method returns early in that case, and the existing
  "not allowing saved queries to be stored" spec must keep passing.
- **The one-write-path discipline.** The store keeps sole ownership of `failure`;
  the component calls a named method and never writes the signal itself. This is
  the same rule F-25 established for `WorkingQueryStore.mutate`.

Deliberately not doing: a retry button, a toast, or a quota estimate. The gesture
that means "I want to try again" is already there — the user retypes or edits the
name — and the design has no room for another control.

## Build steps

- [x] **1. Clear a refused write when the name is edited.**
      Add `clearWriteProblem()` to `SavedQueryStore`: return immediately when
      `this.storage === null`, otherwise `this.failure.set(null)`. Call it from
      `SavedQueriesPage.setName` alongside the existing
      `this.confirmation.set(null)`.

      Then fix the two tests that encode the wrong behaviour:

      - Extend `saved-queries.spec.ts:338` ("reports a write that is refused")
        so it stops at the refusal, and add a sibling that continues: fail the
        write, then set `failWrites = false`, retype, click Save, and assert the
        entry lands and the message is gone. This is the assertion the existing
        comment claimed.
      - Add a store-level spec in `saved-query.store.spec.ts`: a refused write
        leaves `storageProblem()` set, `clearWriteProblem()` clears it, and the
        same call against a null-storage store leaves the message in place.

      **Done when:** `ui` `npm test` passes with the two new specs, the
      "not allowing saved queries to be stored" spec still passes unchanged, and
      reverting the `setName` call fails the new retry spec.

## Verify

1. `cd ui && npm test` — all specs pass, including the new retry cases.
2. `cd ui && npm run build` — clean.
3. In the browser, on **Saved queries & export**: there is no supported way to
   force a quota error by hand, so the retry path is proven by the specs rather
   than by clicking. What is worth checking by hand is that nothing else moved —
   name, Save, the confirmation line, and the "no result has been seen" hint all
   behave as before.

## Findings

Resolved and archived with this fix. IDs are prefixed with this
archive name, which is their permanent form.

### unlatch-the-save-button/F-26 [P2] closed - The revisions pager disappears on every page change, and its count collapses behind it

**File:** ui/src/app/vintages/vintages.html:118
**Found:** 2026-09-11 by /audit (scope: full; lens: quality)
**Why it matters:** The revisions table and `app-paging-footer` sit inside the
final `@else` of a chain whose first branch is `revisionsLoading()`. Clicking
Next therefore unmounts the pager for the whole round trip: the button vanishes
from under the pointer, the layout jumps, and the control the user is operating
is missing until the answer lands. Observations and Series render their footer
unconditionally for exactly this reason, so this tab is the only one of the three
that behaves this way.

Behind it is the shape F-13 and F-16 named. `pageCount` at
`vintages.ts:221` reads `readyRevisions()?.totalCount ?? 0`, and `readyRevisions`
is null in the loading state, so the count collapses to 1 while `currentPage`
still reports the page the user asked for. That is invisible today only because
the pager is unmounted at the same moment. Moving the footer out of the `@else`
to match the other two tabs, which is the obvious repair for the first half,
would immediately render `Page 3 of 1` with Next disabled. The two halves have to
be fixed together.

`createResultState` solved this for the other tabs by carrying the last settled
`meta` on the loading state. This page has its own pipeline, correctly so, but it
did not carry that lesson across.
**Suggested fix:** hold the last settled `totalCount` the way `result-state.ts`
holds `meta` — a value kept outside the stream, updated when an answer settles,
read while one is in flight — then render the footer unconditionally like the
other two result tabs. Add a spec that pages and asserts the footer text
mid-flight, as `observations.spec.ts` already does.
**Resolution:** Fixed on 2026-09-11 as suggested. The loading state carries
`previousTotal`, captured where the inner pipe is built, and a `pagerTotal`
computed feeds `pageCount`; `app-paging-footer` now sits outside the state chain
like the other two result tabs. `ListState` is shared with the vintages list,
which passes `previousTotal: null` because it issues one request and has no pager.

Both halves were probed separately, because they fail in different ways.
Reinstating the collapse produced
`Expected 'Page 2 of 1 · pageSize 25 · vintages WDI 2026-03-27' to contain
'Page 2 of 4'` — the finding's predicted string, from one spec. Moving the footer
back inside the `@else` failed four specs on a missing element. One correction
to the done-when: the "Prev stays reachable" case does **not** guard the collapse.
With `pageCount` at 1 and `page` at 2, `canPrev` is still `page > 1`, so Prev
stays enabled either way; it failed only in the unmount probe. It is kept as a
guard against a neighbouring regression, not claimed as evidence for this one.

The specs needed a deferred provider double, which `vintages.spec.ts` did not
have: `CountingProvider` resolves synchronously, so the in-flight window was
zero-width. That is the same reason this defect, and F-11, F-13 and F-16 before
it, reached a green suite.

Closed at 1b47282 by this pass. Re-examined `vintages.ts:151-185, 241-254` and
`vintages.html:145-152`: the `loading` member carries `previousTotal`, captured
where the inner pipe is built; `pagerTotal` returns it while a request is in
flight; `app-paging-footer` sits outside the state chain. The original defect is
gone and the repair introduced none in this file. The narrower staleness the
repair leaves behind is recorded separately as F-29 rather than keeping this one
open.

### unlatch-the-save-button/F-27 [P3] closed - The summary strip ignores the Significant only filter it sits beneath

**File:** ui/src/app/vintages/vintages.ts:243
**Found:** 2026-09-11 by /audit (scope: full; lens: quality)
**Why it matters:** `appeared` and `disappeared` derive from `views()`, the whole
page, while the table above them renders `rows()`, the page filtered by the
`Significant only` toggle. An appeared or disappeared row can never be
significant, because its change is null, so switching the filter on empties those
rows from the table while the panels beneath keep listing the same series. The
reading is then "no significant changes on this page" directly above "series that
appeared: LENDING_RATE · MUS · 2010–2024", which invites the conclusion that the
appeared series was filtered out for being insignificant rather than being a
different kind of thing entirely.

Defensible as designed — the panels summarise the page, not the filtered view,
and the titles do say "this page" — which is why this is P3 rather than a
correctness bug. But the two regions currently answer different questions from
the same toggle with no visible cue.
**Suggested fix:** either derive the panels from `rows()` so the filter reaches
them consistently, or leave them on `views()` and say so in the panel titles, for
example "this page · unfiltered". The second is likely the better product answer
because appeared and disappeared series are the one thing the significance filter
can never surface.
**Resolution:** Fixed on 2026-09-11 with the second option, and the first was
rejected on the reasoning this finding itself raised: an appeared row's change is
null, so it can never be significant, and routing the filter through the panels
would make `Significant only` permanently delete the one category it can never
surface. The titles now read `Series that appeared · this page, unfiltered` and
the same for disappeared. A spec asserts both titles and the behaviour the label
explains: with the filter on, every table row carries a Significant pill while the
appeared panel still lists its entry.

Closed at 1b47282 by this pass. `vintages.html:161` and `:175` read
`Series that appeared · this page, unfiltered` and the disappeared equivalent,
and `vintages.ts:269-272` still derives both panels from `views()`. Label and
behaviour now agree; no new defect in the repaired region.
