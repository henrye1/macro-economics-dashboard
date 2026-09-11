import type {
  ForecastFilter,
  ObservationsQuery,
  SourceFilter,
  VintageSelector
} from './macro-contracts';

/**
 * The one query every result tab reads.
 *
 * Client state, not part of the API contract. `toObservationsQuery` is the only
 * sanctioned way to turn it into a request, so features 5, 6, 8, 11 and 12 all
 * produce identical query strings.
 */
export interface WorkingQuery {
  /** Canonical indicator codes. Required and non-empty before any request. */
  indicators: readonly string[];
  /** ISO3 codes. Empty means all countries. */
  countries: readonly string[];
  /** Inclusive; null is unbounded. */
  yearFrom: number | null;
  yearTo: number | null;
  source: SourceFilter;
  forecast: ForecastFilter;
  vintage: VintageSelector;
  /** 1-based. */
  page: number;
  pageSize: number;
}

/**
 * `pageSize` is 25, the console's own choice, not the API's default of 500.
 * The designs are explicit: the observations footer reads "pageSize 25" and the
 * request builder renders `&pageSize=25` in the URL a consumer is told to copy.
 */
export const DEFAULT_WORKING_QUERY: WorkingQuery = {
  indicators: [],
  countries: [],
  yearFrom: null,
  yearTo: null,
  source: 'preferred',
  forecast: 'all',
  vintage: 'latest',
  page: 1,
  pageSize: 25
};

export type QueryProblem = 'no-indicators' | 'inverted-year-range';

export interface QueryValidation {
  valid: boolean;
  problems: readonly QueryProblem[];
}

/** Both cases the consumer guide documents as `400`, caught before a request. */
export function validateWorkingQuery(query: WorkingQuery): QueryValidation {
  const problems: QueryProblem[] = [];

  if (query.indicators.length === 0) {
    problems.push('no-indicators');
  }

  if (query.yearFrom !== null && query.yearTo !== null && query.yearFrom > query.yearTo) {
    problems.push('inverted-year-range');
  }

  return { valid: problems.length === 0, problems };
}

/** Same codes in the same order. Order is part of the request string. */
function sameCodes(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((code, index) => code === b[index]);
}

/**
 * Every field a working query is compared on.
 *
 * `satisfies` is the whole point: it fails the build in both directions. Add a
 * field to `WorkingQuery` and this map is missing a key; remove or rename one
 * and it has a stray key. Either is a compile error here rather than a control
 * that silently stops working.
 *
 * That matters because the failure mode is invisible at runtime. `sameWorkingQuery`
 * decides whether `WorkingQueryStore` accepts a mutation, so a field left out
 * would make its setter a no-op: the value would never change, no request would
 * be issued, and no existing spec could catch it, because no spec knows about a
 * field that does not exist yet.
 */
const COMPARED = {
  indicators: true,
  countries: true,
  yearFrom: true,
  yearTo: true,
  source: true,
  forecast: true,
  vintage: true,
  page: true,
  pageSize: true
} satisfies Record<keyof WorkingQuery, true>;

/** The compared keys, typed so indexing a `WorkingQuery` with them is safe. */
const COMPARED_KEYS = Object.keys(COMPARED) as (keyof WorkingQuery)[];

/**
 * Whether two working queries would produce the same request.
 *
 * Compared by value, not identity, so a query rebuilt from equal parts is
 * recognised as unchanged. `WorkingQueryStore` uses this to refuse a mutation
 * that changes nothing: without it, re-selecting the source already selected
 * mints a new object, every downstream computed recomputes, and a full round
 * trip goes out for a query nobody changed.
 *
 * Arrays compare by content **and order**. `['GDP','CPI']` and `['CPI','GDP']`
 * serialise to different query strings, so they are different queries even
 * though they are the same set. Dispatching on `Array.isArray` rather than on
 * the key name means a future array field gets content comparison by default,
 * instead of the identity comparison that would be quietly wrong.
 *
 * `===` rather than `Object.is`: the two differ on `-0`, and this function has
 * always used `===`.
 */
export function sameWorkingQuery(a: WorkingQuery, b: WorkingQuery): boolean {
  return COMPARED_KEYS.every((key) => {
    const left: unknown = a[key];
    const right: unknown = b[key];

    if (Array.isArray(left) && Array.isArray(right)) {
      return sameCodes(left, right);
    }

    return left === right;
  });
}

/** True when the query pins a specific vintage rather than tracking `latest`. */
export function hasPinnedVintage(query: WorkingQuery): boolean {
  return query.vintage !== 'latest';
}

/**
 * Turn the working query into an API query, omitting everything sitting at its
 * default. The request builder shows this URL to a human, so a query cluttered
 * with defaults would teach noise instead of the real contract.
 *
 * `source` is dropped whenever a vintage is pinned: the guide states that
 * pinning a vintage implies its source, so sending both invites a contradiction.
 */
export function toObservationsQuery(query: WorkingQuery): ObservationsQuery {
  const pinned = hasPinnedVintage(query);

  const result: ObservationsQuery = {
    indicators: [...query.indicators],
    pageSize: query.pageSize
  };

  if (query.countries.length > 0) {
    result.countries = [...query.countries];
  }

  if (query.yearFrom !== null) {
    result.yearFrom = query.yearFrom;
  }

  if (query.yearTo !== null) {
    result.yearTo = query.yearTo;
  }

  if (query.source !== 'preferred' && !pinned) {
    result.source = query.source;
  }

  if (query.forecast !== 'all') {
    result.forecast = query.forecast;
  }

  if (pinned) {
    result.vintage = query.vintage;
  }

  if (query.page !== 1) {
    result.page = query.page;
  }

  return result;
}
