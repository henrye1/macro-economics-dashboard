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
  VintagesQuery,
} from '../macro-contracts';
import type { MacroDataProvider } from '../macro-data.provider';
import {
  FIXTURE_ATTRIBUTION,
  FIXTURE_COUNTRIES,
  FIXTURE_INDICATORS,
  FIXTURE_OBSERVATIONS,
  FIXTURE_REVISIONS,
  FIXTURE_SERIES,
  FIXTURE_VINTAGES,
  FIXTURE_VINTAGE_REFS,
} from './macro-fixtures';

const DEFAULT_PAGE_SIZE = 500;

/**
 * Fixture-backed provider. Replaced by the real HTTP client in feature 8.
 *
 * Emissions are synchronous, so a consumer's loading state is implemented but
 * never lingers visibly. That is deliberate: adding artificial latency here
 * would put a timing value in production code for the sake of a demo. Feature 8
 * introduces real latency and exercises those states for the first time.
 *
 * The indicator filters (`q`, `category`, `source`, `curated`) are implemented
 * exactly as the consumer guide documents them, so the catalogue's filtering is
 * real now and needs no change when feature 8 swaps in the live service. This is
 * not invented behaviour: the contract is written down.
 *
 * Paging and vintage pinning are still ignored. Nothing consumes them yet, and
 * guessing at them would invent behaviour the API owns.
 */
@Injectable()
export class FixtureMacroDataProvider implements MacroDataProvider {
  countries(): Observable<Envelope<Country>> {
    return of(this.envelope([...FIXTURE_COUNTRIES]));
  }

  indicators(query?: IndicatorsQuery): Observable<Envelope<Indicator>> {
    return of(this.envelope(filterIndicators(FIXTURE_INDICATORS, query)));
  }

  observations(_query: ObservationsQuery): Observable<Envelope<Observation>> {
    return of(this.envelope([...FIXTURE_OBSERVATIONS]));
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

  private envelope<T>(data: T[]): Envelope<T> {
    return {
      data,
      meta: {
        page: 1,
        pageSize: DEFAULT_PAGE_SIZE,
        totalCount: data.length,
        vintages: [...FIXTURE_VINTAGE_REFS],
        attribution: [...FIXTURE_ATTRIBUTION],
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
