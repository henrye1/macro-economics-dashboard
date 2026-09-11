/**
 * The formats the Export card offers.
 *
 * The design shows a third, XLSX, and it was dropped from the build plan on
 * 2026-09-11: writing one needs a spreadsheet dependency, and the UTF-8
 * byte-order mark `export-csv.ts` writes makes the CSV open correctly in Excel,
 * which was that format's main reason to exist. The reference PNG still shows
 * the button; the build plan and the overview record why it is gone.
 */
export type ExportFormat = 'csv' | 'json';

export interface ExportFormatSpec {
  readonly format: ExportFormat;
  /** As the segmented control renders it. */
  readonly label: string;
  /** Without the dot. */
  readonly extension: string;
  readonly mimeType: string;
}

export const EXPORT_FORMATS: readonly ExportFormatSpec[] = [
  {
    format: 'csv',
    label: 'CSV',
    extension: 'csv',
    mimeType: 'text/csv;charset=utf-8'
  },
  {
    format: 'json',
    label: 'JSON',
    extension: 'json',
    mimeType: 'application/json'
  }
];

export const DEFAULT_EXPORT_FORMAT: ExportFormat = 'csv';

export function exportFormatSpec(format: ExportFormat): ExportFormatSpec {
  const spec = EXPORT_FORMATS.find((candidate) => candidate.format === format);

  if (spec === undefined) {
    // Unreachable through the union, but a missing entry would otherwise
    // surface as an undefined MIME type inside a Blob.
    throw new Error(`No export format spec for ${format}`);
  }

  return spec;
}
