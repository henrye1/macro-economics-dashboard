import type { Revision, Vintage } from './macro-contracts';

/**
 * Derivations for the Vintages & revisions tab.
 *
 * Every value here is computed in the browser. The service sends exactly
 * `indicator, country, year, previousValue, newValue` and nothing else, settled
 * live at feature 8 across 500 sampled rows: no significance flag, no statement
 * of what the vintage was compared against, and no appeared or disappeared
 * summary. The design shows all four, so the tab derives them and says so.
 */

/** Flagged above this absolute difference, whatever the magnitude. */
export const SIGNIFICANT_ABSOLUTE = 0.5;

/** Or above this relative difference. 0.1 is ten percent. */
export const SIGNIFICANT_RELATIVE = 0.1;

/**
 * The sentence the panel renders beside the toggle.
 *
 * Kept next to the constants it describes so the two cannot drift: a threshold
 * shown on screen that does not match the one applied would be worse than
 * showing none.
 */
export const SIGNIFICANCE_NOTE =
  'Only significant changes are flagged: more than 10% relative or 0.5 absolute.';

export interface RevisionView {
  readonly revision: Revision;
  /** `newValue - previousValue`, or null when either side is missing. */
  readonly change: number | null;
  /** Derived here, never read from the service. */
  readonly significant: boolean;
}

/** One indicator and country, over the span of years it covers. */
export interface SeriesSpan {
  readonly indicator: string;
  readonly country: string;
  readonly fromYear: number;
  readonly toYear: number;
}

/**
 * The difference a vintage made to one cell.
 *
 * Null when either side is missing, which is not a zero change: a cell the
 * vintage added has no previous value to differ from, and rendering that as
 * `0` would claim the value did not move.
 */
export function revisionChange(revision: Revision): number | null {
  const { previousValue, newValue } = revision;

  return previousValue === null || newValue === null ? null : newValue - previousValue;
}

/**
 * Whether a revision clears either threshold.
 *
 * Strictly greater on both, matching the design's "more than". A row with a
 * missing side is never significant: there is no change to measure.
 *
 * A `previousValue` of exactly zero makes the relative test undefined, so only
 * the absolute test applies. Dividing anyway would yield `Infinity` and flag
 * every such row, which reads as a service judgement rather than the arithmetic
 * accident it is.
 */
export function isSignificantRevision(revision: Revision): boolean {
  const change = revisionChange(revision);

  if (change === null) {
    return false;
  }

  if (Math.abs(change) > SIGNIFICANT_ABSOLUTE) {
    return true;
  }

  const { previousValue } = revision;
  if (previousValue === null || previousValue === 0) {
    return false;
  }

  return Math.abs(change / previousValue) > SIGNIFICANT_RELATIVE;
}

export function toRevisionView(revision: Revision): RevisionView {
  return {
    revision,
    change: revisionChange(revision),
    significant: isSignificantRevision(revision)
  };
}

/** Groups rows the predicate selects into one span per indicator and country. */
function spansOf(
  rows: readonly Revision[],
  selects: (revision: Revision) => boolean
): SeriesSpan[] {
  const spans = new Map<string, { indicator: string; country: string; from: number; to: number }>();

  for (const row of rows) {
    if (!selects(row)) {
      continue;
    }

    const key = `${row.indicator}|${row.country}`;
    const held = spans.get(key);

    if (held === undefined) {
      spans.set(key, {
        indicator: row.indicator,
        country: row.country,
        from: row.year,
        to: row.year
      });
      continue;
    }

    held.from = Math.min(held.from, row.year);
    held.to = Math.max(held.to, row.year);
  }

  return [...spans.values()]
    .map(({ indicator, country, from, to }) => ({
      indicator,
      country,
      fromYear: from,
      toYear: to
    }))
    .sort(
      (a, b) => a.indicator.localeCompare(b.indicator) || a.country.localeCompare(b.country)
    );
}

/** Series the vintage added: a cell with no previous value. */
export function appearedSeries(rows: readonly Revision[]): SeriesSpan[] {
  return spansOf(rows, (row) => row.previousValue === null && row.newValue !== null);
}

/** Series the vintage dropped: a cell with no new value. */
export function disappearedSeries(rows: readonly Revision[]): SeriesSpan[] {
  return spansOf(rows, (row) => row.newValue === null && row.previousValue !== null);
}

/** `GDP_GROWTH_REAL · ZAF · 2010–2024`, or a single year when the span is one. */
export function formatSeriesSpan(span: SeriesSpan): string {
  const years =
    span.fromYear === span.toYear ? `${span.fromYear}` : `${span.fromYear}–${span.toYear}`;

  return `${span.indicator} · ${span.country} · ${years}`;
}

/**
 * The vintage a selected vintage was published against.
 *
 * The revisions response never says what it was compared to, so the tab derives
 * it: the greatest id below the selected one **from the same source**. The
 * design confirms the rule by skipping a WEO vintage to pair WDI 13 with WDI 11.
 *
 * Null when the selected vintage is its source's earliest, which the UI must
 * report rather than rendering an absent label.
 */
export function predecessorOf(
  vintages: readonly Vintage[],
  selected: Vintage
): Vintage | null {
  const earlier = vintages
    .filter((vintage) => vintage.source === selected.source && vintage.id < selected.id)
    .sort((a, b) => b.id - a.id);

  return earlier[0] ?? null;
}

/** Published vintages newest first. The service does not document an order. */
export function byNewestFirst(vintages: readonly Vintage[]): Vintage[] {
  return [...vintages].sort((a, b) => b.id - a.id);
}

/** The newest year a vintage covers, on either side of the comparison. */
export interface YearHorizon {
  readonly previous: number | null;
  readonly current: number | null;
}

/**
 * How far forward the data now runs, against its predecessor.
 *
 * The design labels this panel "Last actual year moved", but `lastActualYear`
 * cannot be derived from a revisions response: the rows carry
 * `indicator, country, year, previousValue, newValue` and no forecast flag, so
 * nothing here distinguishes an actual from a forecast. What the rows do show
 * is the newest year each side of the comparison carries a value for, which is
 * the horizon movement a new release is actually read for. The panel is titled
 * for that instead of claiming a boundary it cannot see.
 *
 * Scoped to the rows it is handed, which is one page: the service paginates
 * revisions, so this is a statement about the page, not the whole vintage.
 */
export function yearHorizon(rows: readonly Revision[]): YearHorizon {
  let previous: number | null = null;
  let current: number | null = null;

  for (const row of rows) {
    if (row.previousValue !== null && (previous === null || row.year > previous)) {
      previous = row.year;
    }

    if (row.newValue !== null && (current === null || row.year > current)) {
      current = row.year;
    }
  }

  return { previous, current };
}

/** `2024 → 2025`, or a plain statement when there is no movement to report. */
export function formatYearHorizon(horizon: YearHorizon): string {
  const { previous, current } = horizon;

  if (previous === null && current === null) {
    return 'None';
  }

  if (previous === null) {
    return `New through ${current}`;
  }

  if (current === null) {
    return `Nothing new past ${previous}`;
  }

  return previous === current ? `Unchanged at ${current}` : `${previous} → ${current}`;
}
