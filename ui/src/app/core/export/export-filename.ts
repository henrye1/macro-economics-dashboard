import { type ExportFormat, exportFormatSpec } from './export-format';

/**
 * `cyte-macro-observations-2026-09-11.csv`.
 *
 * The date is sliced from the stamp, never parsed: `savedDate` in
 * `core/saved-query.ts` does the same, because constructing a `Date` to read
 * back a calendar day shifts it by a zone in either direction.
 */
export function exportFilename(format: ExportFormat, nowIso: string): string {
  return `cyte-macro-observations-${nowIso.slice(0, 10)}.${exportFormatSpec(format).extension}`;
}
