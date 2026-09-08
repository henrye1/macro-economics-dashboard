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
 * Query arguments are accepted and ignored. Filtering, paging and vintage
 * pinning are the real service's job, and pretending to implement them here
 * would invent behaviour the API owns.
 */
@Injectable()
export class FixtureMacroDataProvider implements MacroDataProvider {
  countries(): Observable<Envelope<Country>> {
    return of(this.envelope([...FIXTURE_COUNTRIES]));
  }

  indicators(_query?: IndicatorsQuery): Observable<Envelope<Indicator>> {
    return of(this.envelope([...FIXTURE_INDICATORS]));
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
