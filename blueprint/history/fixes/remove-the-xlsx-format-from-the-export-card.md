# Fix: Remove the XLSX format from the Export card

**Type:** Fix
**Status:** verified
**Branch:** fix/remove-the-xlsx-format-from-the-export-card

## The problem

XLSX was dropped from the plans on 2026-09-11, but the console still offers it.
The Export card renders a third, disabled format button whose tooltip and
screen-reader text read *"XLSX export needs a spreadsheet writer and lands in a
later feature."* There is no later feature. The card now promises something the
build plan does not have, which is the one thing that disabled button was put
there to avoid.

The surface is small and entirely in the export module:

- `core/export/export-format.ts:10` — `ExportFormat` includes `'xlsx'`
- `:43-49` — the `EXPORT_FORMATS` entry, with `available: false` and the reason
- `:20-22` — `available` and `unavailableReason` on `ExportFormatSpec`
- `core/export/export.service.ts:83-86` — the guard that throws for an
  unavailable format
- `export/export-card.html:14-24` — `disabled`, `title`, `aria-describedby` and
  the visually-hidden reason span
- specs in all three files that assert the XLSX entry and its reason

## The fix

Remove the format, then remove what existed only to describe it.

**`available` and `unavailableReason` go too.** They were the 11b seam: a flag
recording that one declared format could not yet be written. With XLSX gone every
format is available, so the flag has one possible value and the reason is always
null — a field that can only say one thing is noise, and the next reader would
have to work out what it was ever for.

**The service guard goes with them.** `export.service.ts:83` throws for an
unavailable format, and it exists because the writer branch is
`format === 'json' ? toJson : toCsv`, which would otherwise hand back XLSX bytes
that are really a CSV. With the union reduced to `'csv' | 'json'` that ternary is
exhaustive and the guard is unreachable. Its spec goes with it.

That is the honest ordering: the guard protected against a case the type system
will now prevent, so deleting the case and keeping the guard would leave dead
code claiming to protect something.

Three things it must not break:

- **CSV and JSON behave identically.** Every existing spec for the two surviving
  formats must pass unchanged, including the BOM, the formula guard and the
  comment-line collapse.
- **The card still renders a format control.** Two buttons, `aria-pressed` on the
  selected one, exactly as now. This removes a format, not the selector.
- **`exportFormatSpec` still throws for an unknown format.** It is unreachable
  through the union and exists so a missing entry surfaces loudly rather than as
  an undefined MIME type inside a Blob. Keep it and its reasoning.

Out of scope: the design reference still shows three buttons. It is a mockup of
the original plan and is not edited; the build plan and the overview already
record why the third is gone.

## Build steps

- [x] **1. Remove the XLSX format and the flags that described it.**
      In `export-format.ts`: drop `'xlsx'` from `ExportFormat`, drop its
      `EXPORT_FORMATS` entry, and drop `available` and `unavailableReason` from
      `ExportFormatSpec` and both remaining entries. Replace the file's leading
      doc comment, which currently explains why XLSX is declared but unwritable,
      with one recording that it was dropped on 2026-09-11 and why.

      In `export.service.ts`: remove the availability guard and its now-unused
      `exportFormatSpec` call at the top of `download`.

      In `export-card.html`: remove `disabled`, `title`, `aria-describedby` and
      the visually-hidden reason span from the format button. In
      `export-card.ts`, `selectFormat` no longer needs its `available` early
      return.

      Specs to remove, because they assert behaviour that no longer exists:
      `export-file.spec.ts` — "declares all three the design offers", "marks xlsx
      unavailable with a reason", "gives every available format a reason of null";
      `export-card.spec.ts` — "offers all three the design shows", "disables XLSX
      and says why", "names the XLSX reason to assistive technology", "stays on
      the current format when the disabled one is clicked";
      `export.service.spec.ts` — "refuses a format it cannot write".

      Replace the two that still have a subject: `EXPORT_FORMATS` declares
      exactly `csv` and `json` with their extensions and MIME types, and the card
      renders exactly two format buttons.

      **Done when:** `ui` `npm test` passes with no XLSX reference left in
      `ui/src` (`rg -i xlsx ui/src` returns nothing), `ui` `npm run build` is
      clean, and the CSV and JSON specs are untouched and still passing.

## Verify

1. `cd ui && npm test` — all specs pass; the suite shrinks by the removed cases.
2. `cd ui && npm run build` — clean.
3. By hand: both servers up → Observations, run a query → **Saved queries &
   export**. The Format control shows **two** buttons, CSV and JSON, with no
   disabled third. Download one of each and confirm the files are unchanged.
