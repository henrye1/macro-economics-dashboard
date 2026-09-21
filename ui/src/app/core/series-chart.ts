import type { Series } from './macro-contracts';

/**
 * Chart geometry for the Series tab.
 *
 * Pure arithmetic over the series the tab already fetched: no DOM, no charting
 * library. The numbers below are the reference design's, not arbitrary. The
 * viewBox is 760x280 and the plot area is inset to leave room for the axis
 * labels the SVG draws outside it.
 */

export const CHART_WIDTH = 760;
export const CHART_HEIGHT = 280;

const PLOT_LEFT = 56;
const PLOT_RIGHT = 748;
const PLOT_TOP = 14;
const PLOT_BOTTOM = 214;
const PLOT_SPAN_X = PLOT_RIGHT - PLOT_LEFT;
const PLOT_SPAN_Y = PLOT_BOTTOM - PLOT_TOP;

/** Where the x axis labels sit, below the plot. */
export const X_LABEL_Y = 232;
/** Right edge of the y axis labels, which are anchored to their end. */
export const Y_LABEL_X = 48;

/** Breathing room above and below the data so lines never touch the frame. */
const RANGE_PADDING = 0.15;

const Y_TICK_COUNT = 4;

/** Above this many years the x axis thins out to about ten labels. */
const X_LABEL_BUDGET = 12;

/** One per country on a chart, walked in order. Matches --series-1..6. */
export const SERIES_COLORS = [
  '#0b188f',
  '#3faa24',
  '#ffba31',
  '#d20413',
  '#545db1',
  '#319a1b'
] as const;

export interface ChartTick {
  readonly position: number;
  readonly label: string;
}

export interface ChartLine {
  readonly country: string;
  readonly color: string;
  /** Empty when the series has no actual points in the window. */
  readonly actualPath: string;
  /**
   * Bridged from the last actual point so the two paths meet. Empty when the
   * series has no forecast points.
   */
  readonly forecastPath: string;
}

export interface ChartPoint {
  readonly key: string;
  readonly cx: number;
  readonly cy: number;
  readonly radius: number;
  readonly fill: string;
  readonly color: string;
  /** `ZAF · 2027 · forecast` */
  readonly head: string;
  readonly value: string;
  /** Percent of the viewBox, so the HTML tooltip can sit over the SVG. */
  readonly leftPercent: number;
  readonly topPercent: number;
}

/** One country's value in one year, or null where the source reports none. */
export interface ChartTableCell {
  readonly value: string;
  readonly forecast: boolean;
}

export interface ChartTableRow {
  readonly country: string;
  /** One per year in `ChartTable.years`, in the same order. */
  readonly cells: readonly (ChartTableCell | null)[];
}

/**
 * The plotted values as text.
 *
 * The SVG is `aria-hidden` and the tooltip only exists under a pointer, so
 * without this the numbers on the chart are unreachable to anyone not using a
 * mouse and a working pair of eyes. The strip this chart replaced printed every
 * year and value as text; this keeps that, visually hidden.
 */
export interface ChartTable {
  readonly years: readonly number[];
  readonly rows: readonly ChartTableRow[];
}

export interface ChartLegendEntry {
  readonly color: string;
  /** ISO3. The key the entry is tracked by, whatever it is labelled with. */
  readonly country: string;
  /** The country's name where the catalogue knows it, else its ISO3. */
  readonly label: string;
  readonly detail: string;
}

export interface SeriesChart {
  readonly indicator: string;
  readonly name: string;
  /** `Percent · ZAF, NGA · IMF_WEO · WEO 10.0.0` */
  readonly metaLabel: string;
  readonly yTicks: readonly ChartTick[];
  readonly xTicks: readonly ChartTick[];
  readonly lines: readonly ChartLine[];
  readonly points: readonly ChartPoint[];
  readonly legend: readonly ChartLegendEntry[];
  readonly hasForecast: boolean;
  /**
   * Whether the history and forecast boundary falls inside the window.
   *
   * False for a window that is all history or all forecast. The rule is only
   * drawn when this is true: against the frame it reads as the edge of the
   * data rather than the edge of the history, which is the opposite of what it
   * means. The band still shades a forecast-only window, and the metadata
   * table states `lastActualYear` either way, so the fact is never lost.
   */
  readonly boundaryInWindow: boolean;
  /** x of the dashed rule at the history and forecast boundary. */
  readonly boundaryX: number;
  readonly forecastBandX: number;
  readonly forecastBandWidth: number;
  /** Stated for screen readers, which cannot see any of the above. */
  readonly description: string;
  /** Every plotted value as text, for the same reason. */
  readonly table: ChartTable;
}

const WHOLE_NUMBER_FORMAT = new Intl.NumberFormat('en-GB', {
  maximumFractionDigits: 0
});

const ONE_DECIMAL_FORMAT = new Intl.NumberFormat('en-GB', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
});

/**
 * Axis labels at the precision the magnitude deserves.
 *
 * The reference reads a per-indicator decimal count from its own catalogue. The
 * service's `Indicator` carries no such field, so the span stands in for it:
 * percent and index ranges are small and want a decimal, `GDP_PER_CAPITA_USD`
 * runs to five figures and `6,431.0` only adds noise.
 */
function formatTick(value: number, span: number): string {
  return span >= 1000
    ? WHOLE_NUMBER_FORMAT.format(value)
    : ONE_DECIMAL_FORMAT.format(value);
}

/**
 * One chart per indicator, one line per country.
 *
 * Grouping this way is what makes the tab comparative: the same indicator for
 * several countries shares one value axis, which is the only way the lines can
 * be read against each other.
 */
export function buildCharts(
  series: readonly Series[],
  /**
   * ISO3 to country name, from the catalogue. The series payload carries only
   * the code, and the design labels the legend with the name, so the caller
   * supplies what it knows. An unknown code falls back to itself rather than
   * blanking the entry.
   */
  countryNames: ReadonlyMap<string, string> = new Map()
): SeriesChart[] {
  const groups = new Map<string, Series[]>();

  for (const item of series) {
    const held = groups.get(item.indicator);

    if (held === undefined) {
      groups.set(item.indicator, [item]);
    } else {
      held.push(item);
    }
  }

  return [...groups.entries()]
    .map(([indicator, group]) => buildChart(indicator, group, countryNames))
    .filter((chart): chart is SeriesChart => chart !== null);
}

function buildChart(
  indicator: string,
  group: readonly Series[],
  countryNames: ReadonlyMap<string, string>
): SeriesChart | null {
  const years = [...new Set(group.flatMap((s) => s.points.map((p) => p.year)))].sort(
    (a, b) => a - b
  );
  const values = group.flatMap((s) => s.points.map((p) => p.value));

  const firstYear = years[0];
  const lastYear = years[years.length - 1];

  // A group whose every series came back with no points has nothing to plot,
  // and the scales below would divide by an empty range.
  if (firstYear === undefined || lastYear === undefined || values.length === 0) {
    return null;
  }

  const { low, high } = paddedRange(values);
  const head = group[0];

  if (head === undefined) {
    return null;
  }

  const x = (year: number): number =>
    lastYear === firstYear
      ? PLOT_LEFT + PLOT_SPAN_X / 2
      : PLOT_LEFT + ((year - firstYear) / (lastYear - firstYear)) * PLOT_SPAN_X;

  const y = (value: number): number =>
    PLOT_BOTTOM - ((value - low) / (high - low)) * PLOT_SPAN_Y;

  // The boundary is the earliest of the group's, so the shaded band never
  // claims a year is a forecast for a country where it is an actual.
  const lastActualYear = Math.min(...group.map((s) => s.lastActualYear));
  const hasForecast = group.some((s) => s.points.some((p) => p.isForecast));
  const boundaryInWindow =
    hasForecast && lastActualYear >= firstYear && lastActualYear < lastYear;
  const boundaryX = hasForecast ? x(Math.max(firstYear, lastActualYear)) : 0;

  const lines: ChartLine[] = [];
  const points: ChartPoint[] = [];
  const legend: ChartLegendEntry[] = [];

  group.forEach((item, index) => {
    const color = SERIES_COLORS[index % SERIES_COLORS.length] ?? SERIES_COLORS[0];
    const actual = item.points.filter((p) => !p.isForecast);
    const forecast = item.points.filter((p) => p.isForecast);
    const lastActual = actual[actual.length - 1];

    // The forecast path restarts at the last actual point, otherwise the two
    // paths leave a gap exactly where the eye is looking.
    const bridged =
      lastActual !== undefined && forecast.length > 0 ? [lastActual, ...forecast] : forecast;

    lines.push({
      country: item.country,
      color,
      actualPath: toPath(actual, x, y),
      forecastPath: toPath(bridged, x, y)
    });

    for (const point of item.points) {
      const cx = x(point.year);
      const cy = y(point.value);

      points.push({
        key: `${indicator}|${item.country}|${point.year}`,
        cx,
        cy,
        radius: point.isForecast ? 2.6 : 3.2,
        fill: point.isForecast ? '#ffffff' : color,
        color,
        head: `${item.country} · ${point.year} · ${point.isForecast ? 'forecast' : 'actual'}`,
        value: `${ONE_DECIMAL_FORMAT.format(point.value)} ${item.unit}`,
        leftPercent: (cx / CHART_WIDTH) * 100,
        topPercent: (cy / CHART_HEIGHT) * 100
      });
    }

    legend.push({
      color,
      country: item.country,
      label: countryNames.get(item.country) ?? item.country,
      detail: `last actual ${item.lastActualYear} · ${item.source}`
    });
  });

  const span = high - low;

  return {
    indicator,
    name: head.name,
    metaLabel: [
      head.unit,
      group.map((s) => s.country).join(', '),
      head.source,
      head.vintage
    ].join(' · '),
    yTicks: buildYTicks(low, high, y),
    xTicks: buildXTicks(years, x),
    lines,
    points,
    legend,
    hasForecast,
    boundaryInWindow,
    boundaryX,
    forecastBandX: hasForecast ? boundaryX : 0,
    forecastBandWidth: hasForecast ? PLOT_RIGHT - boundaryX : 0,
    description: describe(head, group, firstYear, lastYear, lastActualYear, span),
    table: buildTable(years, group)
  };
}

/**
 * The chart's values as a country-by-year table.
 *
 * Years come from the chart's own axis, so the table and the drawing always
 * cover the same window. A country that does not report a year gets a null
 * rather than a gap, because the template has to say so out loud.
 */
function buildTable(years: readonly number[], group: readonly Series[]): ChartTable {
  return {
    years,
    rows: group.map((item) => {
      const byYear = new Map(item.points.map((point) => [point.year, point]));

      return {
        country: item.country,
        cells: years.map((year) => {
          const point = byYear.get(year);

          return point === undefined
            ? null
            : {
                value: `${ONE_DECIMAL_FORMAT.format(point.value)} ${item.unit}`,
                forecast: point.isForecast
              };
        })
      };
    })
  };
}

/**
 * The value range the axis covers.
 *
 * A flat series has no range at all, which would make every scaled value
 * `NaN`, so it gets an arbitrary unit either side and plots as the straight
 * line it is.
 */
function paddedRange(values: readonly number[]): { low: number; high: number } {
  let low = Math.min(...values);
  let high = Math.max(...values);

  if (high === low) {
    return { low: low - 1, high: high + 1 };
  }

  const padding = (high - low) * RANGE_PADDING;
  low -= padding;
  high += padding;

  return { low, high };
}

function toPath(
  points: readonly { year: number; value: number }[],
  x: (year: number) => number,
  y: (value: number) => number
): string {
  return points
    .map((p, index) => `${index === 0 ? 'M' : 'L'}${round(x(p.year))} ${round(y(p.value))}`)
    .join(' ');
}

function buildYTicks(low: number, high: number, y: (value: number) => number): ChartTick[] {
  const span = high - low;

  return Array.from({ length: Y_TICK_COUNT + 1 }, (_, index) => {
    const value = low + (span * index) / Y_TICK_COUNT;

    return { position: round(y(value)), label: formatTick(value, span) };
  });
}

/** Thins dense axes to roughly ten labels, always keeping the last year. */
function buildXTicks(years: readonly number[], x: (year: number) => number): ChartTick[] {
  const step = years.length > X_LABEL_BUDGET ? Math.ceil(years.length / 10) : 1;

  return years
    .filter((_, index) => index % step === 0 || index === years.length - 1)
    .map((year) => ({ position: round(x(year)), label: String(year) }));
}

function describe(
  head: Series,
  group: readonly Series[],
  firstYear: number,
  lastYear: number,
  lastActualYear: number,
  span: number
): string {
  const countries = group.map((s) => s.country).join(', ');
  const values = group.flatMap((s) => s.points.map((p) => p.value));
  const low = formatTick(Math.min(...values), span);
  const high = formatTick(Math.max(...values), span);

  return (
    `Line chart of ${head.name} in ${head.unit} for ${countries}, ` +
    `${firstYear} to ${lastYear}, ranging ${low} to ${high}, ` +
    `actual through ${lastActualYear} and forecast after it.`
  );
}

/** One decimal is the most an SVG coordinate in this viewBox can show. */
function round(value: number): number {
  return Math.round(value * 10) / 10;
}
