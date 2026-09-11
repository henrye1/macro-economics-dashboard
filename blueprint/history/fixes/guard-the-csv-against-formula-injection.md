# Fix: Guard the CSV export against formula injection

**Type:** Fix
**Status:** verified
**Branch:** fix/guard-the-csv-against-formula-injection
**Fixes:** F-34

## The problem

`csvField` at `ui/src/app/core/export/export-csv.ts:88` implements RFC 4180
quoting correctly, which is a transport rule and not a safety one. A field whose
text begins with `=`, `+`, `-`, `@`, a tab or a carriage return is evaluated as a
formula by Excel, LibreOffice and Google Sheets when the file is opened, and
quoting does not prevent it.

The reachable path is `indicator` and `country`, and `source` behind them: all
three are supplied by the Core API, which is outside this console's control and
is already treated as untrusted everywhere else. `saved-query.store.ts`
structurally validates everything it reads back for exactly that reason.

Low likelihood — it needs a hostile or compromised upstream, and there is one
known data source. Worth doing because the mechanism is real, the mitigation is
small, and the export is the only artifact this project hands to another
application.

## The fix

In `csvField`, prefix a field with a single quote when it begins with one of the
dangerous characters, so the spreadsheet reads it as text.

**The guard applies only to string values, and that is the whole design.**
`csvField` takes `string | number | boolean`, and `value` is a number that is
very often negative: real GDP growth is negative for most countries in some
years. Guarding on `-` without checking the type would turn every negative
observation into `'-1.1` and break the numeric column for every consumer of
every export — a far worse regression than the problem being fixed. A number is
never a formula, so `typeof value === 'string'` is both the correct test and the
one that keeps the data intact.

**The cost, stated rather than waved past.** The prefix is a real byte in the
file: a guarded value reads `'=SUM(A1)` rather than `=SUM(A1)`, in Excel and in
a parser alike. This mitigation makes a dangerous value visibly different, which
is the accepted trade in the OWASP guidance it follows. It lands only on a
string that actually begins with an operator, and no legitimate value does
today: indicator codes are `[A-Z_]`, ISO3 codes are letters, and `source` is
`IMF_WEO` or `WB_WDI`.

Order matters: guard first, then apply the existing quoting rule to the guarded
text, so a value that is both dangerous and comma-bearing gets both treatments.

Two things it must not break:

- **Numbers and booleans pass through untouched**, negative values included.
  This is the regression the specs must pin hardest.
- **The existing quoting behaviour is unchanged** for every value that does not
  begin with a dangerous character.

Out of scope: the header comment lines. They are prefixed with a hash, so they
cannot begin with an operator, and a spreadsheet reading them as text is exactly
what already happens.

## Build steps

- [x] **1. Guard a dangerous leading character in a string field.**
      Add a `FORMULA_TRIGGERS` constant to `export-csv.ts` naming the characters
      and why they matter, and apply the prefix in `csvField` before the existing
      quoting test, only when `typeof value === 'string'`.

      Specs in `export-file.spec.ts`, under a new `describe`:

      - each of `=`, `+`, `-`, `@`, tab and carriage return at the start of an
        `indicator` gets the prefix
      - a **negative `value` does not**, and the field reads `-1.1` exactly
      - a negative year or vintage id is likewise untouched, so the rule is about
        the type and not about the column
      - an ordinary indicator is unchanged, with no stray quote
      - a value that is both dangerous and comma-bearing is guarded **and**
        quoted, and parses back through the existing `parseCsvLine` helper to the
        guarded text
      - a dangerous character anywhere other than the first position is left
        alone, because only a leading one starts a formula

      **Done when:** `ui` `npm test` passes with the new cases, and removing the
      `typeof` check fails the negative-value spec rather than passing quietly.

## Verify

1. `cd ui && npm test` — all specs pass, including the negative-value regression.
2. `cd ui && npm run build` — clean.
3. By hand, the regression rather than the fix: both servers up → Observations,
   run a query that returns a negative growth value → **Saved queries & export**
   → Download CSV → confirm the value column still reads `-1.1` and not `'-1.1`.

   The injection path itself cannot be exercised here: it needs an upstream that
   returns a hostile indicator code, and there is no way to make the real service
   do that. It is covered by spec only, and that is the honest limit.
