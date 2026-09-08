import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';

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
} from './macro-contracts';

/**
 * The console's only route to macro data.
 *
 * One method per Core API read route, so the Express passthrough in feature 7
 * and the live wiring in feature 8 map onto it directly. Every method returns an
 * Observable even though the fixture implementation resolves synchronously:
 * swapping the fixture for the real HTTP service must be a provider change, not
 * a rewrite of every consumer.
 *
 * Implementations must not reshape, aggregate, or add business logic. The
 * console's models are the guide's models.
 */
export interface MacroDataProvider {
  countries(): Observable<Envelope<Country>>;
  indicators(query?: IndicatorsQuery): Observable<Envelope<Indicator>>;
  observations(query: ObservationsQuery): Observable<Envelope<Observation>>;
  series(query: SeriesQuery): Observable<Envelope<Series>>;
  vintages(query?: VintagesQuery): Observable<Envelope<Vintage>>;
  revisions(vintageId: number, query?: RevisionsQuery): Observable<Envelope<Revision>>;
}

/** Inject this, never a concrete implementation. */
export const MACRO_DATA = new InjectionToken<MacroDataProvider>('MACRO_DATA');
