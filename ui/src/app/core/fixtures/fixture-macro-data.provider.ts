import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';

import type {
  Country,
  Envelope,
  Indicator,
  IndicatorsQuery,
  Observation,
  ObservationsQuery,
  Revision,
  RevisionsQuery,
  Series,
  SeriesQuery,
  Vintage,
  VintageRef,
  VintagesQuery,
} from '../macro-contracts';
import type { MacroDataProvider } from '../macro-data.provider';
import {
  FIXTURE_ATTRIBUTION,
  FIXTURE_COUNTRIES,
  FIXTURE_INDICATORS,
  FIXTURE_REVISIONS,
  FIXTURE_SERIES,
  FIXTURE_VINTAGES,
  FIXTURE_VINTAGE_REFS,
} from './macro-fixtures';
import { FIXTURE_OBSERVATIONS } from './observation-fixtures';

const DEFAULT_PAGE_SIZE = 500;

/**
 * Fixture-backed provider. Replaced by the real HTTP client in feature 8.
 *
 * Emissions are synchronous, so a consumer's loading state is implemented but
 * never lingers visibly. That is deliberate: adding artificial latency here
 * would put a timing value in production code for the sake of a demo. Feature 8
 * introduces real latency and exercises those states for the first time.
 *
 * The indicator filters (`q`, `category`, `source`, `curated`) and the whole of
 * `/observations` - filters, vintage pinning, ordering and paging - are
 * implemented exactly as the consumer guide documents them, so those tabs need
 * no change when feature 8 swaps in the live service. This is not invented
 * behaviour: the contract is written down in CONSUMER-GUIDE.md sections 4.2
 * and 4.3.
 *
 * `series()` and `revisions()` still ignore their queries. Nothing consumes
 * them yet, and guessing would invent behaviour the API owns.
 */
@Injectable()
export class FixtureMacroDataProvider implements MacroDataProvider {
  countries(): Observable<Envelope<Country>> {
    return of(this.envelope([...FIXTURE_COUNTRIES]));
  }

  indicators(query?: IndicatorsQuery): Observable<Envelope<Indicator>> {
    return of(this.envelope(filterIndicators(FIXTURE_INDICATORS, query)));
  }

  observations(query: ObservationsQuery): Observable<Envelope<Observation>> {
    const matched = filterObservations(FIXTURE_OBSERVATIONS, query);

    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const page = Math.max(1, Math.trunc(query.page ?? 1));
    const start = (page - 1) * pageSize;

    return of(
      this.envelope(matched.slice(start, start + pageSize), {
        page,
        pageSize,
        // The count is the whole result, not this page. A consumer paging
        // through needs to know how far it goes.
        totalCount: matched.length,
        // Provenance of the result, not of the page: an empty result carries no
        // vintages at all, which is what the design's `vintages -` footer says.
        vintages: vintageRefsFor(matched),
      }),
    );
  }

  series(_query: SeriesQuery): Observable<Envelope<Series>> {
    return of(this.envelope([...FIXTURE_SERIES]));
  }

  vintages(_query?: VintagesQuery): Observable<Envelope<Vintage>> {
    return of(this.envelope([...FIXTURE_VINTAGES]));
  }

  revisions(_vintageId: number, _query?: RevisionsQuery): Observable<Envelope<Revision>> {
    return of(this.envelope([...FIXTURE_REVISIONS]));
  }

  private envelope<T>(data: T[], meta?: Partial<Envelope<T>['meta']>): Envelope<T> {
    return {
      data,
      meta: {
        page: 1,
        pageSize: DEFAULT_PAGE_SIZE,
        totalCount: data.length,
        vintages: [...FIXTURE_VINTAGE_REFS],
        attribution: [...FIXTURE_ATTRIBUTION],
        ...meta,
      },
    };
  }
}

/**
 * Applies the documented `/api/macro/indicators` filters. Exported so the
 * catalogue's expectations can be asserted directly against the same rules the
 * real service implements.
 *
 * `curated` defaults to true. Filters combine with AND. `q` is a
 * case-insensitive substring match against the code or the name.
 */
export function filterIndicators(
  indicators: readonly Indicator[],
  query?: IndicatorsQuery
): Indicator[] {
  const curated = query?.curated ?? true;
  const category = query?.category;
  const source = query?.source;
  const term = query?.q?.trim().toLowerCase();

  return indicators.filter((indicator) => {
    if (curated && !indicator.curated) {
      return false;
    }

    if (category !== undefined && indicator.category !== category) {
      return false;
    }

    if (source !== undefined && !indicator.sources.some((entry) => entry.source === source)) {
      return false;
    }

    if (term) {
      const haystack = `${indicator.code} ${indicator.name}`.toLowerCase();
      if (!haystack.includes(term)) {
        return false;
      }
    }

    return true;
  });
}

/**
 * The `meta.vintages` refs for a result: every vintage the returned rows
 * actually came from, newest id first.
 *
 * Derived from the rows rather than from a constant, so pinning an old vintage
 * reports that old vintage and an empty result honestly reports none.
 */
export function vintageRefsFor(rows: readonly Observation[]): VintageRef[] {
  const ids = new Set(rows.map((row) => row.vintageId));

  return FIXTURE_VINTAGES.filter((vintage) => ids.has(vintage.id))
    .map(({ id, source, label }) => ({ id, source, label }))
    .sort((a, b) => b.id - a.id);
}

/** Resolves a `vintage` selector to a fixture vintage id, by id or by label. */
function resolveVintageId(selector: number | string): number | null {
  const match = FIXTURE_VINTAGES.find(
    (vintage) => vintage.id === selector || vintage.label === selector,
  );
  return match?.id ?? null;
}

/**
 * One row per (indicator, country, year), resolving `source=preferred`.
 *
 * The guide's rule is that WEO wins wherever it exists, because it extends into
 * forecast years. Where only WDI reports a cell, the WDI row is the answer.
 */
function resolvePreferred(rows: readonly Observation[]): Observation[] {
  const best = new Map<string, Observation>();

  for (const row of rows) {
    const key = `${row.indicator}|${row.country}|${row.year}`;
    const held = best.get(key);

    if (held === undefined || (held.source !== 'IMF_WEO' && row.source === 'IMF_WEO')) {
      best.set(key, row);
    }
  }

  return [...best.values()];
}

/**
 * Applies the documented `/api/macro/observations` filters, then orders the
 * result.
 *
 * Filters combine with AND, exactly as CONSUMER-GUIDE.md section 4.3 lists them.
 * Two behaviours are worth spelling out because they are contract, not choice:
 *
 * - Without a pinned vintage, `latest` means the latest vintage **per source**,
 *   so historical vintages never leak into a default query.
 * - A pinned vintage implies its source, so `source` is not applied on top of a
 *   pin. `toObservationsQuery` already omits `source` in that case; this is the
 *   matching server-side half.
 *
 * Ordering is indicator, then country, then year, all ascending, matching
 * blueprint/references/4-observations.png. The live API does not document an
 * order; confirm it at feature 8 rather than sorting in the component.
 */
export function filterObservations(
  observations: readonly Observation[],
  query: ObservationsQuery,
): Observation[] {
  // An empty `indicators` is a 400 at the real service. The console validates
  // before it asks, so this is only a guard against a caller that skipped it.
  if (query.indicators.length === 0) {
    return [];
  }

  const indicators = new Set(query.indicators);
  const countries = query.countries?.length ? new Set(query.countries) : null;
  const selector = query.vintage;
  const pinned = selector !== undefined && selector !== 'latest';
  const pinnedId = pinned ? resolveVintageId(selector) : null;

  // An unknown vintage is a 404 at the real service; here it simply matches
  // nothing, which keeps the fixture from inventing a value for it.
  if (pinned && pinnedId === null) {
    return [];
  }

  const latestIds = new Set(
    FIXTURE_VINTAGES.filter((vintage) => vintage.isLatest).map((vintage) => vintage.id),
  );

  let rows = observations.filter((row) => {
    if (!indicators.has(row.indicator)) {
      return false;
    }

    if (countries !== null && !countries.has(row.country)) {
      return false;
    }

    if (pinnedId !== null ? row.vintageId !== pinnedId : !latestIds.has(row.vintageId)) {
      return false;
    }

    if (query.yearFrom != null && row.year < query.yearFrom) {
      return false;
    }

    if (query.yearTo != null && row.year > query.yearTo) {
      return false;
    }

    return true;
  });

  if (!pinned) {
    const source = query.source ?? 'preferred';
    rows = source === 'preferred' ? resolvePreferred(rows) : rows.filter((row) => row.source === source);
  }

  const forecast = query.forecast ?? 'all';
  if (forecast !== 'all') {
    rows = rows.filter((row) => row.isForecast === (forecast === 'forecast'));
  }

  return rows.sort(
    (a, b) =>
      a.indicator.localeCompare(b.indicator) ||
      a.country.localeCompare(b.country) ||
      a.year - b.year,
  );
}
