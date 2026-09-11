/**
 * The three formats the design's Export card offers.
 *
 * `xlsx` is declared here in full — label, extension, MIME type — even though
 * this feature cannot write one. Feature 11b flips `available` and supplies the
 * writer; nothing else about the card has to change. Declaring it now also
 * keeps the design's third button on screen rather than pretending the format
 * was never promised.
 */
export type ExportFormat = 'csv' | 'json' | 'xlsx';

export interface ExportFormatSpec {
  readonly format: ExportFormat;
  /** As the segmented control renders it. */
  readonly label: string;
  /** Without the dot. */
  readonly extension: string;
  readonly mimeType: string;
  /** False while the format is promised but not yet buildable. */
  readonly available: boolean;
  /** Why it cannot be chosen. Null when it can. */
  readonly unavailableReason: string | null;
}

export const EXPORT_FORMATS: readonly ExportFormatSpec[] = [
  {
    format: 'csv',
    label: 'CSV',
    extension: 'csv',
    mimeType: 'text/csv;charset=utf-8',
    available: true,
    unavailableReason: null
  },
  {
    format: 'json',
    label: 'JSON',
    extension: 'json',
    mimeType: 'application/json',
    available: true,
    unavailableReason: null
  },
  {
    format: 'xlsx',
    label: 'XLSX',
    extension: 'xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    available: false,
    unavailableReason: 'XLSX export needs a spreadsheet writer and lands in a later feature.'
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
