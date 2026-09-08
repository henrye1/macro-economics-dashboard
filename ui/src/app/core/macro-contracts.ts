/**
 * Types for the Core API `/api/macro` contract.
 *
 * Hand-written from CONSUMER-GUIDE.md for v1; feature 17 replaces them with
 * types generated from the Core API OpenAPI document. They must match the
 * service exactly, so check them against a real response when feature 8 wires
 * live data. Two shapes are called out inline as unconfirmed.
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
  page: number;
  pageSize: number;
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
   * `source` is not in the consumer guide's field list for this route, but the
   * design at blueprint/references/5-vintages-and-revisions.png shows a Source
   * column, and `/vintages?source=` filters by it. Confirm at feature 8.
   */
  source: SourceCode;
  sourceVersion: string;
  /** ISO-8601 UTC instant. */
  retrievedAtUtc: string;
  isLatest: boolean;
}

/**
 * One changed value between a vintage and its predecessor.
 *
 * Field names are unconfirmed: the guide describes "previous vs new value per
 * (indicator, country, year)" without naming the properties. Confirm at
 * feature 8. `significant` is server-side, flagged at more than 10% relative or
 * 0.5 absolute, so it is read rather than recomputed. The change delta is
 * derived in the UI from these two values.
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
  significant: boolean;
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
