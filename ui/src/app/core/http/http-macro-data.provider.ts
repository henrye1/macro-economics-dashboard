import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';

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
import { toMacroRequestError } from './macro-error';
import { toMacroParams } from './macro-params';

/**
 * Relative on purpose. The console is served from the same origin as the
 * Express passthrough in development (through `ui/proxy.conf.json`) and in the
 * container. A configurable production base URL is feature 13's open TODO, and
 * inventing one here would be a second source of truth to unpick later.
 */
const BASE = '/api/macro';

/**
 * The real `MacroDataProvider`, one method per Core API read route.
 *
 * Two things this class deliberately does not do:
 *
 * - **It does not touch the HTTP cache.** Every request is a plain `GET` with no
 *   `Cache-Control`, no `If-None-Match`, and no cache-busting parameter. The API
 *   relays `ETag` and `Cache-Control: private, max-age=3600`, and the browser's
 *   own cache does the revalidation. Setting any of those three would defeat it
 *   silently. Feature 12 demonstrates the mechanics; this class stays out of the
 *   way.
 * - **It does not reshape a payload.** The envelope passes through untouched, so
 *   a `200` with an empty `data` array reaches the consumer as the valid answer
 *   the guide says it is, not as an error.
 *
 * The only transformation is on the failure path, where `HttpErrorResponse`
 * becomes a `MacroRequestError` carrying the status and the problem `detail`.
 */
@Injectable()
export class HttpMacroDataProvider implements MacroDataProvider {
  private readonly http = inject(HttpClient);

  countries(): Observable<Envelope<Country>> {
    return this.get<Country>('/countries', toMacroParams());
  }

  indicators(query?: IndicatorsQuery): Observable<Envelope<Indicator>> {
    return this.get<Indicator>('/indicators', toMacroParams(query));
  }

  observations(query: ObservationsQuery): Observable<Envelope<Observation>> {
    return this.get<Observation>('/observations', toMacroParams(query));
  }

  series(query: SeriesQuery): Observable<Envelope<Series>> {
    return this.get<Series>('/series', toMacroParams(query));
  }

  vintages(query?: VintagesQuery): Observable<Envelope<Vintage>> {
    return this.get<Vintage>('/vintages', toMacroParams(query));
  }

  revisions(vintageId: number, query?: RevisionsQuery): Observable<Envelope<Revision>> {
    // The id is service data read back from `meta.vintages` or `/vintages`,
    // never a fixture constant, which is why it is an argument at all.
    return this.get<Revision>(`/vintages/${vintageId}/revisions`, toMacroParams(query));
  }

  /**
   * Callers serialise their own query, so `toMacroParams` sees each concrete
   * query type and its "every property must be serialisable" constraint is
   * actually enforced per route. Threading the raw object through here would
   * widen it to the constraint and check nothing.
   */
  private get<T>(path: string, params: HttpParams): Observable<Envelope<T>> {
    return this.http.get<Envelope<T>>(`${BASE}${path}`, { params }).pipe(
      catchError((error: unknown) =>
        throwError(() =>
          // Only an HTTP failure is ours to reclassify. A bug thrown from an
          // interceptor or from this pipeline must reach the unexpected-error
          // path unchanged rather than be dressed up as a service problem.
          error instanceof HttpErrorResponse ? toMacroRequestError(error) : error
        )
      )
    );
  }
}
