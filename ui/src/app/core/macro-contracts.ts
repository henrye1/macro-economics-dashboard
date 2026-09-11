/**
 * Types for the Core API `/api/macro` contract.
 *
 * Hand-written from CONSUMER-GUIDE.md for v1; feature 17 replaces them with
 * types generated from the Core API OpenAPI document.
 *
 * Reconciled against the live service at feature 8. Four corrections came out
 * of that: `meta.page` and `meta.pageSize` are nullable, `Series` carries
 * `scale`, `Revision` has no `significant`, and `Vintage.source` is real. Each
 * is annotated below with the response that justified it.
 */

export type SourceCode = 'IMF_WEO' | 'WB_WDI';

/** WEO wins wherever it exists, because it extends into forecast years. */
export type SourceFilter = SourceCode | 'preferred';

export type ForecastFilter = 'all' | 'actual' | 'forecast';

/** `latest` per source, or a vintage id or label to pin. Pinning implies the source. */
export type VintageSelector = 'latest' | number | string;

export interface VintageRef {
  id: number;
  source: SourceCode;
  label: string;
}

export interface EnvelopeMeta {
  /**
   * `null` on the routes that do not paginate.
   *
   * Observed at feature 8: `/countries` and `/vintages` answer
   * `page: null, pageSize: null` and ignore a `pageSize` parameter entirely
   * (`/countries?pageSize=2` returned all 214 rows). `/indicators`,
   * `/observations`, `/series` and `/vintages/{id}/revisions` all return real
   * numbers. `totalCount` is always a number, which is why the counts on the
   * overview read it and never `page`.
   */
  page: number | null;
  pageSize: number | null;
  totalCount: number;
  /** Record these ids alongside any result that must be reproducible. */
  vintages: VintageRef[];
  /** Rendered verbatim wherever numbers are shown. WDI is CC BY 4.0. */
  attribution: string[];
}

/** Every `/api/macro` response shares this envelope. */
export interface Envelope<T> {
  /** An empty array with a `200` is a valid answer, not an error. */
  data: T[];
  meta: EnvelopeMeta;
}

export interface Country {
  /** ISO 3166-1 alpha-3. */
  iso3: string;
  name: string;
  sources: SourceCode[];
}

export interface IndicatorSource {
  source: SourceCode;
  /** The upstream code, for example `NGDP_RPCH`. Never used for querying. */
  sourceCode: string;
  preferred: boolean;
}

export interface Indicator {
  /** Canonical code, for example `GDP_GROWTH_REAL`. */
  code: string;
  name: string;
  /** Percent, index values and US dollars all occur. Never assume. */
  unit: string;
  scale: string | null;
  category: string;
  curated: boolean;
  sources: IndicatorSource[];
}

export interface Observation {
  /** Refs `Indicator.code`. */
  indicator: string;
  /** Refs `Country.iso3`. */
  country: string;
  year: number;
  value: number;
  isForecast: boolean;
  source: SourceCode;
  vintageId: number;
}

export interface SeriesPoint {
  year: number;
  value: number;
  isForecast: boolean;
}

export interface Series {
  indicator: string;
  name: string;
  unit: string;
  /** Observed at feature 8: `/series` returns this alongside `unit`. */
  scale: string | null;
  country: string;
  source: SourceCode;
  /** Vintage label, not the id. `meta.vintages[].id` carries the id. */
  vintage: string;
  /** The history and forecast boundary year. */
  lastActualYear: number;
  points: SeriesPoint[];
}

export interface Vintage {
  id: number;
  label: string;
  /**
   * Confirmed at feature 8: `/vintages` does return `source`, even though the
   * consumer guide omits it from this route's field list. The design's Source
   * column was right.
   */
  source: SourceCode;
  sourceVersion: string;
  /**
   * UTC instant, but observed with no zone designator and sub-millisecond
   * precision: `"2026-09-08T01:00:31.5083586"`. `new Date(...)` therefore reads
   * it as local time. Parse it as UTC explicitly wherever it is rendered.
   */
  retrievedAtUtc: string;
  isLatest: boolean;
}

/**
 * One changed value between a vintage and its predecessor.
 *
 * Confirmed at feature 8 against `/vintages/12/revisions`: `previousValue` and
 * `newValue` are the real property names, and both are nullable (a row added by
 * a vintage has `previousValue: null`; 500 sampled rows were all of that shape).
 *
 * **`significant` does not exist.** The guide describes a server-side
 * significance flag at more than 10% relative or 0.5 absolute, but no observed
 * row carried the field: 500 rows returned exactly
 * `indicator, country, year, previousValue, newValue`. Feature 9 owns revisions
 * rendering and must decide whether to derive significance in the UI or ask for
 * the field upstream; typing it here would promise data the service does not
 * send. Nothing consumes `Revision` yet, so removing it breaks no caller.
 *
 * The appeared, disappeared and last-actual-year-moved summary the design shows
 * below this table has no documented shape yet, so it is deliberately not typed
 * here. Feature 9 owns it.
 */
export interface Revision {
  indicator: string;
  country: string;
  year: number;
  previousValue: number | null;
  newValue: number | null;
}

/** RFC 7807 `application/problem+json`. `detail` carries the human explanation. */
export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
}

export interface PageQuery {
  page?: number;
  /** Default 500, max 5000. */
  pageSize?: number;
}

export interface IndicatorsQuery extends PageQuery {
  /** Defaults to true; false also returns the auto-registered `WEO_` factors. */
  curated?: boolean;
  category?: string;
  source?: SourceCode;
  /** Substring search on code or name. */
  q?: string;
}

export interface ObservationsQuery extends PageQuery {
  /** Required and non-empty. */
  indicators: string[];
  /** Empty or omitted means all countries. */
  countries?: string[];
  /** Inclusive; null or omitted is unbounded. */
  yearFrom?: number | null;
  yearTo?: number | null;
  source?: SourceFilter;
  vintage?: VintageSelector;
  forecast?: ForecastFilter;
}

/** `/series` takes the same filters as `/observations` but paginates series. */
export type SeriesQuery = ObservationsQuery;

export interface VintagesQuery extends PageQuery {
  source?: SourceCode;
}

export interface RevisionsQuery extends PageQuery {
  countries?: string[];
  indicators?: string[];
}
