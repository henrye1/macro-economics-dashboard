import type { EnvelopeMeta, Observation } from '../macro-contracts';

/**
 * The seven columns, in the `Observation` contract's own order.
 *
 * Deliberately the contract's field names rather than prettier headings: the
 * file is for a machine, and a consumer matching these against
 * `CONSUMER-GUIDE.md` should find the same words.
 */
export const EXPORT_COLUMNS = [
  'indicator',
  'country',
  'year',
  'value',
  'isForecast',
  'source',
  'vintageId'
] as const;

/** RFC 4180 says CRLF, and Excel reads a bare LF as one long field on import. */
const NEWLINE = '\r\n';

/** Comment lines are not part of RFC 4180; this is the convention readers skip. */
const COMMENT = '# ';

export interface CsvOptions {
  /** Writes the vintage ids into the header so the pull can be reproduced. */
  readonly pinVintages: boolean;
  /** ISO-8601 stamp for the header line. Sliced, never parsed. */
  readonly nowIso: string;
}

/**
 * The whole result as CSV.
 *
 * Values are written raw. `formatValue` exists for the screen: it groups
 * thousands, so `65,324.1` would split one value across two columns in the very
 * file that is supposed to be machine-readable.
 */
export function toCsv(
  observations: readonly Observation[],
  meta: EnvelopeMeta,
  options: CsvOptions
): string {
  const lines: string[] = [
    `${COMMENT}Cyte Macro Data export · ${options.nowIso.slice(0, 10)}`
  ];

  if (options.pinVintages) {
    lines.push(`${COMMENT}vintages: ${vintageHeader(meta)}`);
  }

  // Always written, pinned or not: the overview requires attribution wherever
  // numbers are rendered, and a file of numbers is no exception.
  for (const line of meta.attribution) {
    lines.push(`${COMMENT}${line}`);
  }

  lines.push(EXPORT_COLUMNS.join(','));

  for (const observation of observations) {
    lines.push(EXPORT_COLUMNS.map((column) => csvField(observation[column])).join(','));
  }

  return lines.join(NEWLINE) + NEWLINE;
}

/** `12 WEO 10.0.0 2026-04-14; 7 WDI 2026-03-27`, or a plain none. */
function vintageHeader(meta: EnvelopeMeta): string {
  if (meta.vintages.length === 0) {
    return 'none reported for this result';
  }

  return meta.vintages.map((vintage) => `${vintage.id} ${vintage.label}`).join('; ');
}

/**
 * RFC 4180 quoting: wrap in double quotes and double any embedded quote, but
 * only when the field needs it.
 *
 * Nothing in `Observation` is user-supplied, but indicator codes and vintage
 * labels come from a service this console does not control, so the rule is
 * applied rather than assumed away.
 */
function csvField(value: string | number | boolean): string {
  const text = String(value);

  if (!/[",\r\n]/.test(text)) {
    return text;
  }

  return `"${text.replace(/"/g, '""')}"`;
}
