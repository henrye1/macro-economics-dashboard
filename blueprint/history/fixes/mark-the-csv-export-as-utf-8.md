# Fix: Mark the CSV export as UTF-8

**Type:** Fix
**Status:** verified
**Branch:** fix/mark-the-csv-export-as-utf-8
**Fixes:** F-33

## The problem

Every CSV export begins with

    # Cyte Macro Data export · 2026-09-11

built at `ui/src/app/core/export/export-csv.ts:46`, and `·` is not ASCII. The
Blob is declared `text/csv;charset=utf-8` in `export.service.ts`, but Excel on
Windows ignores the MIME type for a file opened from disk and falls back to the
system codepage unless a UTF-8 byte-order mark is present. The stamp line
therefore renders as mojibake in the application this format exists to feed.

Vintage labels and attribution lines reach the header too and can carry
non-ASCII of their own. No data value is affected today: every `Observation`
field is ASCII.

## The fix

Prefix the CSV document with a UTF-8 byte-order mark, written as a named
`UTF8_BOM` constant in `export-csv.ts` so the rule lives with the format that
needs it.

`toCsv` rather than the service, deliberately: the mark is part of what "a CSV
document" is here, and feature 11b's XLSX writer and the existing JSON writer
must not inherit it. Putting it in the service would mean a format switch in two
places.

**The trade-off, stated rather than waved past.** A BOM is not free. Excel, R
with `encoding="UTF-8-BOM"`, and pandas' default parser all strip it. A reader
that does not strip it sees one invisible character at the very start of the
file — and because that position is already a `#` comment line, a strict
`comment='#'` reader could stop recognising that first line as a comment.

It is still the right trade: without the mark Excel is *definitely* wrong for
every export, and with it a naive reader gets one stray character on a line it
was already being asked to skip. Worth a line in the code saying so.

Two things it must not break:

- **JSON must not get a mark.** `toJson` is untouched, and a spec pins that.
- **The comment lines keep their order and content.** Only the very first bytes
  of the document change; `# Cyte Macro Data export` must still be the first
  thing after the mark.

Out of scope: F-34, the formula-injection guard in `csvField`. It is a
neighbouring one-line change in the same file and the audit recommended pairing
them, but it is its own finding and is not being smuggled in here.

## Build steps

- [x] **1. Write the byte-order mark at the head of the CSV document.**
      Add a `UTF8_BOM` constant to `export-csv.ts` with a comment naming Excel
      as the reason and the stray-character trade-off as the cost, and return it
      ahead of the joined lines from `toCsv`.

      Then repair the specs that describe the first line. In
      `export-file.spec.ts`, `lines(csv)[0]` currently asserts
      `'# Cyte Macro Data export · 2026-09-11'` and will now see the mark
      attached; assert the mark separately and strip it before that comparison
      rather than folding it into the expected string, so both facts stay
      readable.

      Add: the document starts with exactly one mark; the character after it is
      `#`; `toJson` output has none; and the file the service hands the
      downloader carries it for CSV and not for JSON.

      **Done when:** `ui` `npm test` passes with the new cases, and removing the
      prefix from `toCsv` fails the mark assertions rather than passing quietly.

## Verify

1. `cd ui && npm test` — all specs pass, including the new mark cases.
2. `cd ui && npm run build` — clean.
3. By hand, if Excel is available: both servers up → Observations, run a query →
   **Saved queries & export** → Download CSV → open the file in Excel and confirm
   the first line reads `# Cyte Macro Data export · <date>` with the `·` intact
   rather than as `Â·`. Opening it in a text editor should look unchanged.

   This is the check the specs cannot make: they assert the bytes, and the whole
   finding is about what an application outside the browser does with them.

## Findings

Resolved and archived with this fix. IDs are prefixed with this archive
name, which is their permanent form.

### mark-the-csv-export-as-utf-8/F-28 [P2] closed - One refused write disables saving for the rest of the session, with no way back

**File:** ui/src/app/saved-queries/saved-queries.ts:47
**Found:** 2026-09-11 by /audit (scope: full; lens: quality)
**Why it matters:** `SavedQueryStore.save` sets `failure` when `setItem` throws,
and clears it only after a later write succeeds
(`saved-query.store.ts:93, 97`). But `saveBlockedReason` returns
`storageProblem()` first, so `canSave` is false and the Save button is
`[disabled]` at `saved-queries.html:76` from that moment on. The only write that
could clear the flag is the one the flag prevents, so the page is latched: the
user cannot retry even after freeing space, and only a reload recovers it,
because the store re-reads storage in its constructor. `setName` clears the
confirmation but not the failure.

The spec that covers this path asserts only that the name survives, and its
comment - "The name survives, so the user can retry rather than retype"
(`saved-queries.spec.ts:347`) - states a behaviour the code does not have. That
is the same shape as F-17: a test whose stated intent and assertion disagree.
**Suggested fix:** clear `failure` when the user edits the name, so the next
attempt is allowed to reach storage and either succeed or re-set the flag. A
one-line change in `setName`, plus a spec that fails a write, retypes, succeeds,
and asserts the entry lands.
**Resolution:** Fixed on 2026-09-11 as suggested. `SavedQueryStore.clearWriteProblem()`
drops the message and returns early when `storage === null`, so an unusable
browser stays latched on purpose; `SavedQueriesPage.setName` calls it beside the
existing `confirmation.set(null)`, which keeps the store the sole writer of
`failure`.

Probed by reverting the `setName` call: `lets the next attempt through once the
name is edited` failed on `Expected true to be false` (the button stayed
disabled) and `Expected 0 to be 1` (no row landed). Restored and re-run green.

Six specs added, not two. The extra three cover what clearing on edit could
break rather than what it fixes: a second refusal is re-reported instead of
being hidden by the edit that preceded it, the saved list is untouched by the
clear, and the null-storage card stays disabled however much the user types. The
existing test's misleading comment was corrected rather than kept.

Closed at 2893d21 by this pass. Re-examined `saved-query.store.ts:114-120` and
`saved-queries.ts:37-49`: `clearWriteProblem` returns early on null storage and
is called from `setName`, so the latch is gone and the unusable-storage state
still latches on purpose. The store remains the only writer of `failure`. No new
defect in the repaired region.
