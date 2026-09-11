import { Injectable, computed, signal } from '@angular/core';

import type { ForecastFilter, SourceFilter, VintageSelector } from './macro-contracts';
import {
  DEFAULT_WORKING_QUERY,
  sameWorkingQuery,
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
    this.mutate((current) => ({ ...current, page: Math.max(1, Math.trunc(page)) }));
  }

  reset(): void {
    this.mutate(() => DEFAULT_WORKING_QUERY);
  }

  /**
   * Adding a code already present would append a **duplicate**, so this check is
   * a de-duplication rule rather than a no-op optimisation. `mutate` cannot
   * stand in for it: a second `GDP_GROWTH_REAL` genuinely changes the array, so
   * the guard would correctly report a change and the duplicate would reach the
   * query string as `indicators=GDP_GROWTH_REAL,GDP_GROWTH_REAL`.
   */
  private addTo(key: 'indicators' | 'countries', code: string): void {
    this.mutate((current) =>
      current[key].includes(code)
        ? current
        : { ...current, [key]: [...current[key], code], page: 1 }
    );
  }

  /**
   * No membership check needed: filtering for a code that is not there yields an
   * equal-content array, and `mutate` recognises that as no change.
   */
  private removeFrom(key: 'indicators' | 'countries', code: string): void {
    this.mutate((current) => ({
      ...current,
      [key]: current[key].filter((entry) => entry !== code),
      page: 1
    }));
  }

  /**
   * Any filter change returns to page 1. Narrowing a query while on page 3 must
   * not leave the user staring at a page that no longer exists.
   */
  private patch(changes: Partial<WorkingQuery>): void {
    this.mutate((current) => ({ ...current, ...changes, page: 1 }));
  }

  /**
   * The only write to `state`. Every mutator goes through here.
   *
   * Signals compare by identity, so handing back a structurally equal but new
   * object notifies every reader and, for a sendable query, costs a full round
   * trip for a query nobody changed. Keeping the comparison in one place makes
   * that a property of the store rather than something each method has to
   * remember: the previous shape had three different guards across four write
   * paths, and the one with none was how the defect got in.
   *
   * `next` builds the candidate before the comparison rather than describing the
   * change, because `patch` also forces `page: 1`. Patching an unchanged filter
   * while on page 3 really is a change, and building first makes that fall out
   * instead of needing a special case.
   */
  private mutate(next: (current: WorkingQuery) => WorkingQuery): void {
    this.state.update((current) => {
      const candidate = next(current);
      return sameWorkingQuery(current, candidate) ? current : candidate;
    });
  }
}
