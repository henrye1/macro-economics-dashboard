# Feature: Saved queries

**From build-plan:** feature 10

**Branch:** `feature/saved-queries`

**Status:** verified

## Goal

Name the working query, keep it in this browser, and get it back — either as it
was written (**Load**) or pinned to the exact vintages its result came from
(**Reproduce**). This is where the console's vintage discipline stops being
advice and becomes a button.

## Design reference

`blueprint/references/6-saved-queries-and-export.png`, the **left card only**.
The Export card on the right is feature 11 and must not be built here.

Saved queries card: a table of `Name · Scope · Vintage · Saved` with `LOAD` and
`REPRODUCE` per row, then a `Name this query` input and a
`SAVE CURRENT QUERY` button. The card header reads
"Vintage ids recorded with every save".

## In scope

- **`SavedQuery`, the locked shape** from the overview: `name`, `query`
  (a `WorkingQuery`), `vintageIds` (`number[]`), `savedAt` (ISO string).
  Feature 16 migrates this to Supabase as a copy, not a redesign, so the shape
  does not change here.
- **Browser `localStorage`**, per browser and anonymous, which is honest for a
  console with no users yet.
- **Recording the vintage ids.** Observations and Series publish their settled
  `meta.vintages` to a small shared service; saving reads it. The ids therefore
  come from a result the user actually saw.
- **Load** — apply the saved query verbatim, including its own `vintage`
  selector.
- **Reproduce** — apply the saved query with `vintage` pinned to the single
  recorded id. Offered only when exactly one id was recorded; otherwise disabled
  with a visible reason.
- **The four columns**, derived from the saved query, plus an empty state and a
  storage-unavailable state.

## Out of scope

- **Export.** The whole right-hand card is feature 11. No format buttons, no
  download, no `Pin vintage ids in the export` checkbox.
- **Delete and rename.** The design offers neither. Saving under an existing
  name replaces that entry, which is the only way to revise one. See Notes.
- **Navigation on load.** The design shows no navigation, and the Export card
  shares this tab, so applying a query and staying put is what the layout
  implies. Load and Reproduce apply the query and confirm; they do not route.
- Accounts, sync, or migration (feature 16). Request builder (12).
- Any change to `api/`, the provider interface, or the macro contracts.

## Build loop

`workflow.stepReview: "feature"` and `workflow.checkpointCommits: "disabled"`.
Build all four steps, then present one review packet. `/complete` makes the
single feature commit.

Verification per step: `npm test` and `npm run build` in `ui/`. No `Verify`
command is declared. `api/` is untouched, so run its suite once at the end only
to prove that claim.

## Build steps

- [x] **1. The type and its labels.** Add `ui/src/app/core/saved-query.ts`:
  the `SavedQuery` interface and pure functions for the three derived columns
  and the reproduce target. No Angular.
  **Done when** `saved-query.spec.ts` proves: the scope label reads
  `3 ind × 2 ctry · 2018–2030`, and handles an unbounded range as `all years`,
  a one-sided range as `from 2018` and `to 2030`, and no countries as
  `all ctry`; the vintage label reads `latest`, `pinned id 12`, or the label
  string when the selector is one; the saved date renders the `YYYY-MM-DD`
  prefix of `savedAt`; and `reproduceTarget` returns the single id when exactly
  one was recorded and `null` for zero or more than one.

- [x] **2. Publish the observed vintages.** Add
  `ui/src/app/core/last-result-vintages.ts`, a root service holding the last
  settled result's `WorkingQuery` and its `meta.vintages`. `createResultState`
  publishes to it when an answer settles — one place, so both result tabs feed
  it and the vintages page, which answers a different question, does not.
  **Done when** `last-result-vintages.spec.ts` and an addition to
  `result-state.spec.ts` prove: a settled result publishes its query and vintage
  ids; a failed or in-flight request publishes nothing; and
  `idsFor(query)` returns the recorded ids only when `sameWorkingQuery` matches
  the query that produced them, and an empty array otherwise. **That guard is
  the point:** editing the query and saving before the new result lands must not
  record the previous query's vintages.

- [x] **3. The store.** Add `ui/src/app/core/saved-query.store.ts`: a root
  service reading and writing `localStorage`, exposing a signal of entries and a
  `save(name, query, vintageIds)`.
  **Done when** `saved-query.store.spec.ts` proves, against a fake storage:
  entries round-trip through JSON; a save with a name that already exists
  **replaces** that entry and updates its `savedAt`, rather than appending a
  second; entries are ordered newest first; `savedAt` comes from an **injected
  clock** so the test is deterministic; a missing key reads as an empty list;
  **unparseable JSON, a non-array, and an array holding entries of the wrong
  shape all read as an empty list rather than throwing**; and a write that
  throws (quota, private mode) is reported rather than crashing the page.

- [x] **4. The page.** Replace the `SavedQueriesPage` placeholder with the card:
  table, name input, save button, Load and Reproduce.
  **Done when** its spec proves: the four columns render from the saved entries;
  `Load` applies the saved query verbatim and `Reproduce` applies it with
  `vintage` set to the recorded id; `Reproduce` is disabled with a visible
  reason when zero or more than one id was recorded; saving is disabled with a
  visible reason when the name is blank **or** the working query is invalid;
  saving records the ids for the current query and clears the name input; an
  empty list shows a message rather than an empty table; a storage failure shows
  a message and leaves the rest of the card usable; and every message sits in a
  `role="status"` slot.

## Files / areas

| Path | Change |
| --- | --- |
| `ui/src/app/core/saved-query.ts` | new — type and the derived labels |
| `ui/src/app/core/saved-query.spec.ts` | new |
| `ui/src/app/core/last-result-vintages.ts` | new — the shared observed-vintages service |
| `ui/src/app/core/last-result-vintages.spec.ts` | new |
| `ui/src/app/core/saved-query.store.ts` | new — localStorage |
| `ui/src/app/core/saved-query.store.spec.ts` | new |
| `ui/src/app/core/result-state.ts` | publish the settled result's vintages |
| `ui/src/app/core/result-state.spec.ts` | cover that publication |
| `ui/src/app/saved-queries/saved-queries.ts` | replace the placeholder |
| `ui/src/app/saved-queries/saved-queries.html` | new |
| `ui/src/app/saved-queries/saved-queries.scss` | new |
| `ui/src/app/saved-queries/saved-queries.spec.ts` | new |
| `ui/src/app/app.spec.ts` | the placeholder-tab case drops to one tab |

Untouched: `macro-contracts.ts`, both providers, `working-query.ts` and its
store, every other page, and all of `api/`.

## Data / contracts

**`SavedQuery` — locked.**

```ts
interface SavedQuery {
  name: string;
  query: WorkingQuery;
  /** `meta.vintages` ids observed at save time. Empty when none were. */
  vintageIds: number[];
  /** ISO-8601, generated here, so it carries a `Z`. */
  savedAt: string;
}
```

**Storage key:** `cyte.macro.saved-queries.v1`. Namespaced so it cannot collide
on a shared origin, and versioned so feature 16's migration has something to
read. The value is a JSON array.

**Everything read from storage is untrusted.** A user can edit `localStorage` by
hand and a future version can write a different shape. The read path validates
each entry and drops the ones that do not conform; it never throws and never
renders a partial object. A wholly unreadable value reads as an empty list.

**`savedAt` uses an injected clock.** `() => new Date().toISOString()` by
default, replaced in tests. A wall-clock call inside the store would make its
spec either non-deterministic or a mock of the platform.

**Replace, do not append, on a repeated name.** Names are the only handle a user
has and the design offers no delete, so re-saving `Q4 2025 ECL` means "update
it". Comparison is exact, after trimming.

**The observed vintages are matched to their query.** `LastResultVintages` holds
both the ids and the `WorkingQuery` that produced them, and hands the ids back
only when `sameWorkingQuery` says the current query is the same one. Editing a
filter and saving before the new result arrives records **no** ids rather than
the previous query's.

**Reproduce needs exactly one id.** `WorkingQuery.vintage` is a single selector
and, per the guide, pinning implies its source. A result that drew on two
vintages cannot be re-asked as one pinned query: pinning the WEO id would drop
the WDI rows and return a subset while claiming to reproduce. So Reproduce is
offered only for a single recorded id and disabled, with that reason visible,
otherwise.

**Load and Reproduce both reset `page` to 1.** A saved page number describes a
result that no longer exists.

**The name is user text rendered in the UI.** Angular interpolation only, which
escapes. No `innerHTML`, no `bypassSecurityTrust*` — the rule feature 8 set.

**Authorization:** unchanged. No token, cookie or credential in the client, and
`localStorage` holds nothing but the user's own query text.

## Testing

`ui/` uses Karma and Jasmine (`npm test`). Tests gate every logic-bearing step.

- `saved-query.spec.ts` — the label functions and `reproduceTarget`, including
  the zero-id and multi-id cases.
- `last-result-vintages.spec.ts` — publication and the query-match guard.
- `saved-query.store.spec.ts` — round-trip, replace-by-name, ordering, the
  injected clock, and every malformed-storage case.
- `saved-queries.spec.ts` — the table, both actions, both disabled reasons, the
  empty state and the storage-failure state.
- The store spec uses a **fake `Storage`**, not the real `localStorage`: a spec
  that writes to the browser's own storage leaks between runs.

No browser-test command exists, so no browser coverage is added. `localStorage`
is synchronous, so this tab has no loading state — the only async thing it reads
is the vintages another tab already settled.

## Notes for the AI

- **Publish from `createResultState`, not from the two pages.** It is the one
  place both result tabs share, and it already holds the settled envelope.
  The vintages tab has its own pipeline and must not publish: its result is a
  revision list, not the working query's answer.
- **The query-match guard is the subtle part.** Without it, "edit the years,
  press Save" quietly records the vintages of the query you just left, and the
  saved entry claims a provenance it never had. The comparison is
  `sameWorkingQuery`, which the two fixes before this feature made exhaustive.
- **No delete is a real gap, and it is the design's.** Replace-by-name is the
  only way to revise an entry and there is no way to remove one. Build what the
  design shows; if that proves wrong in use it is a plan change, not a bug.
- The `/saved-queries` route already exists and points at the placeholder, so
  the page is reachable as soon as it is written.
- Keep the Export card out even though the mock shows it. Half-building
  feature 11 would leave a download button that downloads nothing.

## Open questions

> **None blocking.** The two that were blocking are decided and recorded above:
> the vintage ids come from a shared last-result service fed by the two result
> tabs, and Reproduce is offered only when exactly one id was recorded.
