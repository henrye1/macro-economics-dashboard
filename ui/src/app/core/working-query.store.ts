import { Injectable, computed, signal } from '@angular/core';

import type { ForecastFilter, SourceFilter, VintageSelector } from './macro-contracts';
import {
  DEFAULT_WORKING_QUERY,
  toObservationsQuery,
  validateWorkingQuery,
  type WorkingQuery
} from './working-query';

/**
 * Holds the single working query for the whole console.
 *
 * Root-provided, so Observations, Series, Saved queries, Export and the Request
 * builder all read the same state and it survives tab navigation. It is
 * deliberately in memory only: a reload starts fresh, and making a query durable
 * is feature 10's job through `SavedQuery`.
 *
 * The query is exposed read-only. Every mutation goes through a named method, so
 * no consumer can leave it in a shape the rest of the console does not expect.
 */
@Injectable({ providedIn: 'root' })
export class WorkingQueryStore {
  private readonly state = signal<WorkingQuery>(DEFAULT_WORKING_QUERY);

  readonly query = this.state.asReadonly();

  readonly validation = computed(() => validateWorkingQuery(this.state()));

  /** The API query for the current state. Only meaningful while `validation().valid`. */
  readonly apiQuery = computed(() => toObservationsQuery(this.state()));

  addIndicator(code: string): void {
    this.addTo('indicators', code);
  }

  removeIndicator(code: string): void {
    this.removeFrom('indicators', code);
  }

  addCountry(iso3: string): void {
    this.addTo('countries', iso3);
  }

  removeCountry(iso3: string): void {
    this.removeFrom('countries', iso3);
  }

  setYearRange(yearFrom: number | null, yearTo: number | null): void {
    this.patch({ yearFrom, yearTo });
  }

  setSource(source: SourceFilter): void {
    this.patch({ source });
  }

  setForecast(forecast: ForecastFilter): void {
    this.patch({ forecast });
  }

  setVintage(vintage: VintageSelector): void {
    this.patch({ vintage });
  }

  /** The one mutation that does not reset paging. */
  setPage(page: number): void {
    this.state.update((current) => ({ ...current, page: Math.max(1, Math.trunc(page)) }));
  }

  reset(): void {
    this.state.set(DEFAULT_WORKING_QUERY);
  }

  /** Adding a code already present is a no-op, so repeated catalogue clicks are safe. */
  private addTo(key: 'indicators' | 'countries', code: string): void {
    this.state.update((current) =>
      current[key].includes(code)
        ? current
        : { ...current, [key]: [...current[key], code], page: 1 }
    );
  }

  private removeFrom(key: 'indicators' | 'countries', code: string): void {
    this.state.update((current) =>
      current[key].includes(code)
        ? { ...current, [key]: current[key].filter((entry) => entry !== code), page: 1 }
        : current
    );
  }

  /**
   * Any filter change returns to page 1. Narrowing a query while on page 3 must
   * not leave the user staring at a page that no longer exists.
   */
  private patch(changes: Partial<WorkingQuery>): void {
    this.state.update((current) => ({ ...current, ...changes, page: 1 }));
  }
}
