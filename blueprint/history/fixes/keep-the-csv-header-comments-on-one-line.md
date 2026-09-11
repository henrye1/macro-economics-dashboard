# Fix: Keep the CSV header comments on one line each

**Type:** Fix
**Status:** verified
**Branch:** fix/keep-the-csv-header-comments-on-one-line
**Fixes:** F-36

## The problem

Every data field in the CSV goes through `csvField`, which quotes it and, since
F-34, guards a leading formula character. The header comment lines do not:

- `toCsv` interpolates each `meta.attribution` entry straight into
  `` `${COMMENT}${line}` `` at `ui/src/app/core/export/export-csv.ts:74`
- `vintageHeader` joins `vintage.label` the same way at `:92`, and that string is
  then interpolated into a comment line at `:69`

Both values come from the Core API. A newline in either ends the comment and
starts a new physical line with no `# ` prefix, above the column header. A reader
is then handed a line it cannot classify: too few columns to be a row, not marked
as a comment, sitting exactly where the header is expected. A carriage return
does the same, and an embedded CR is read as a line break by a parser splitting
on CRLF.

Unlike F-34 this needs no hostile intent — a multi-line attribution string is an
ordinary thing for an upstream to send. F-34 ruled these lines out of scope on
the grounds that a `# ` prefix means they can never *begin* with a formula
character. That is true, and it covers formula injection only; line injection is
a different failure of the same untrusted text.

## The fix

One small helper beside `csvField` that collapses CR and LF to a single space,
used by every value interpolated into a comment line.

Collapse rather than strip: `Source: IMF\nWorld Economic Outlook` should read
`Source: IMF World Economic Outlook`, not `Source: IMFWorld Economic Outlook`.
Collapse a CRLF pair and any run of line breaks to one space, and trim the ends,
so a value that begins or ends with a break does not leave a stray gap after the
`# `.

Applied at the three places a value reaches a comment line:

- each `meta.attribution` entry
- each `vintage.label` inside `vintageHeader`
- `options.nowIso`, for consistency rather than need — it is sliced to ten
  characters first, so it cannot carry a break, and passing it through the same
  helper means no reader has to work out which of the three is the exception

Two things it must not break:

- **Data fields keep going through `csvField` only.** A newline inside a data
  value is already handled correctly by RFC 4180 quoting, which preserves it.
  The comment lines have no such mechanism, which is the whole difference, and
  this helper must not be applied to data.
- **Ordinary single-line values pass through unchanged**, including the middle
  dot in the stamp line and the semicolons in the vintage list.

Out of scope: JSON, which `JSON.stringify` escapes correctly, and the column
header row, which is built from a constant.

## Build steps

- [x] **1. Collapse line breaks in every value written to a comment line.**
      Add a `commentSafe` helper to `export-csv.ts` with a comment explaining
      that comment lines have no quoting mechanism, so a break in an upstream
      string has to be removed rather than escaped. Apply it to the attribution
      entries, to each `vintage.label` in `vintageHeader`, and to the stamp.

      Specs in `export-file.spec.ts`, under a new `describe`:

      - an attribution line containing a newline produces one comment line, and
        every line before the column header still starts with `# `
      - the same for a carriage return and for a CRLF pair, which must collapse
        to one space rather than two
      - a vintage label containing a break is likewise collapsed, and the
        `# vintages:` line stays single
      - a leading or trailing break does not leave a stray space after `# ` or at
        the end of the line
      - an ordinary attribution line is byte-for-byte unchanged
      - the column header is still the first non-comment line when attribution
        carries breaks, which is the property the finding is actually about

      **Done when:** `ui` `npm test` passes with the new cases, and reverting
      `commentSafe` to the identity function fails the header-position spec
      rather than passing quietly.

## Verify

1. `cd ui && npm test` — all specs pass, including the header-position case.
2. `cd ui && npm run build` — clean.
3. By hand, the regression rather than the fix: both servers up → Observations,
   run a query → **Saved queries & export** → Download CSV with pinning on →
   confirm the four header lines each still start with `# ` and read as before,
   and the column header is the first uncommented line.

   The defect itself cannot be triggered by hand: it needs an upstream that
   returns a multi-line attribution string, and the live service returns
   single-line values. Spec-only by necessity, as F-34 was.

## Findings

Resolved and archived with this fix. IDs are prefixed with this archive
name, which is their permanent form.

### keep-the-csv-header-comments-on-one-line/F-33 [P3] closed - The CSV carries no byte-order mark, so Excel mangles the one character its header always contains

**File:** ui/src/app/core/export/export-csv.ts:46
**Found:** 2026-09-11 by /audit (scope: full; lens: quality)
**Why it matters:** The first line is always
`# Cyte Macro Data export · <date>`, and `·` is not ASCII. The Blob is declared
`text/csv;charset=utf-8`, but Excel on Windows ignores the MIME type for a file
opened from disk and falls back to the system codepage unless a UTF-8 BOM is
present. The stamp line therefore renders as mojibake in the application this
format exists to feed. Vintage labels and attribution can carry non-ASCII too.
No data value is affected today, because every `Observation` field is ASCII.
**Suggested fix:** prefix the CSV contents with a UTF-8 byte-order mark. It costs one
character, every other reader tolerates it, and it is the only thing that makes
Excel read the file as UTF-8. JSON needs no BOM and must not get one.
**Resolution:** Fixed on 2026-09-11 as suggested. `UTF8_BOM` at
`export-csv.ts:43`, returned ahead of the joined lines by `toCsv`; `toJson` is
untouched and a spec pins that it still starts with a brace. Written as the
escape `'\ufeff'` rather than the character itself, which an editor renders as
nothing and a reviewer cannot see. This ledger entry had the same problem and was
corrected in the same pass.

The code comment records the cost this finding did not: a reader that does not
strip the mark sees one invisible character exactly where a `#` comment line
begins, so a strict `comment='#'` parser could stop treating that first line as
a comment. Kept anyway, because without the mark Excel is wrong for every export.

Six specs. The suite surfaced that same hazard immediately: `dataLines` filters on
a leading `#`, the marked first line stopped matching, and two existing header
cases failed until `lines()` learned to strip the mark. That is the trade-off
reproduced in miniature, and it is why the strip lives in one helper rather than
in each assertion.

Probed by removing the prefix, which failed five specs across the writer and the
service, including the one proving JSON stays unmarked. Restored and re-run green.

Closed at 1c0d172 by this pass. Re-examined `export-csv.ts:43` and `:84`: the mark
is a named constant written as an escape, applied once at the head of the returned
document, and `toJson` is untouched. The comment carries the trade-off rather than
hiding it. No new defect in the repaired region.

### keep-the-csv-header-comments-on-one-line/F-34 [P3] closed - A CSV field beginning with an operator is a live formula when the export is opened in a spreadsheet

**File:** ui/src/app/core/export/export-csv.ts:88
**Found:** 2026-09-11 by /audit (scope: full; lens: security)
**Why it matters:** `csvField` implements RFC 4180 quoting correctly, which is a
transport rule and not a safety one. A field whose text begins with `=`, `+`, `-`
or `@` is evaluated as a formula by Excel, LibreOffice and Sheets, and quoting
does not prevent it. The reachable path is `indicator` and `country`, supplied by
the Core API — outside this console's control and explicitly treated as untrusted
everywhere else in the codebase, which is why `saved-query.store.ts` structurally
validates everything it reads back.

Low likelihood: it needs a hostile or compromised upstream, and this is an
internal console with one known data source. Recorded because the mechanism is
real, the mitigation is one line, and the export is the only artifact this project
hands to another application.
**Suggested fix:** prefix a field with a single quote when its first character is
one of `=+-@`. Do it inside `csvField` so every column is covered; `value` is a
number and never reaches that branch as text.
**Resolution:** Fixed on 2026-09-11 as suggested, with one correction to that
last clause. `value` arrives as a number and `csvField` stringifies it, so it
very much does reach the trigger test as text: real growth is negative somewhere
in almost every series, and a guard on `-` alone would have written `'-1.1` into
the value column of every export. The guard is therefore conditioned on
`typeof value === 'string'`, which is both the correct test and the one that
leaves the numbers intact.

`FORMULA_TRIGGERS` at `export-csv.ts:103` covers `= + - @` plus tab and carriage
return, per the OWASP list. The guard runs before the existing quoting test, so a
value that is both dangerous and comma-bearing gets both treatments.

Nine specs. Probed by removing the `typeof` check, which failed exactly the two
regression cases that exist for it — the negative value, and the negative year
and vintage id — while the nine guard cases kept passing. Restored and re-run
green at 596.

Not covered: the injection itself. Exercising it needs an upstream that returns a
hostile indicator code, and there is no way to make the real service do that, so
this is spec-only by necessity rather than by choice.

Closed at 1c0d172 by this pass. Re-examined `csvField` at `export-csv.ts:123-133`:
the guard is gated on `typeof value === 'string'`, runs before the RFC 4180 test so
a dangerous comma-bearing value gets both treatments, and `raw[0]` on an empty
string yields `undefined`, which `includes` answers false. Numbers and booleans
reach the writer untouched. No new defect in the repaired region.

One boundary this repair does not cover came out of the same reading and is
recorded separately as F-36: the guard protects data fields, and the header
comment lines are still interpolated raw.
