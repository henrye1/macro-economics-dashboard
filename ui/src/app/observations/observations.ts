import { Component, type Signal, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, switchMap } from 'rxjs';

import { macroErrorMessage } from '../core/http/macro-error';
import type { EnvelopeMeta, Observation, ObservationsQuery } from '../core/macro-contracts';
import { MACRO_DATA } from '../core/macro-data.provider';
import { formatValue } from '../core/value-format';
import { WorkingQueryStore } from '../core/working-query.store';
import { PagingFooter } from '../query/paging-footer';
import { WorkingQueryCard } from '../query/working-query-card';

type ResultState =
  | { status: 'ready'; rows: readonly Observation[]; meta: EnvelopeMeta }
  /**
   * A request is in flight.
   *
   * Emitted at the head of every inner request, not only the first. Without it
   * `switchMap` leaves the previous `ready` state on screen for the whole round
   * trip after a paging click or a query edit, so the page describes a query
   * that is no longer the one being asked.
   *
   * It carries the last settled `meta` so the pager can keep reporting a real
   * page count. Without it the footer collapses to "Page 1 of 1" with both
   * controls disabled, which is not a stale answer but a false one: the user
   * asked for page 2 and the strip claims there is only one page.
   */
  | { status: 'loading'; previousMeta: EnvelopeMeta | null }
  /** The query cannot be sent: it would be a documented 400. */
  | { status: 'invalid' }
  | { status: 'unavailable'; message: string };

/**
 * Shown when the request failed without explaining itself. A live `400` usually
 * names the offending code instead, which is what makes it diagnosable.
 */
const UNAVAILABLE = 'Observations are unavailable.';

/**
 * Observations: the working query answered as flat rows.
 *
 * The query itself lives in the shared `WorkingQueryCard` above the table, so
 * this page owns only the result. Requests are built exclusively by
 * `WorkingQueryStore.apiQuery`, which is `toObservationsQuery` applied to the
 * shared state: features 6, 11 and 12 read the same function, so every tab
 * produces an identical query string for identical state.
 *
 * Rows are rendered in the order the provider returns them. The live API does
 * not document an order, so sorting here would hide a difference feature 8
 * needs to see.
 */
@Component({
  selector: 'app-observations',
  imports: [PagingFooter, WorkingQueryCard],
  templateUrl: './observations.html',
  styleUrl: './observations.scss'
})
export class ObservationsPage {
  private readonly macro = inject(MACRO_DATA);
  private readonly store = inject(WorkingQueryStore);

  protected readonly query = this.store.query;

  /** `null` while the query is unsendable, which keeps the request out of flight. */
  private readonly request = computed<ObservationsQuery | null>(() =>
    this.store.validation().valid ? this.store.apiQuery() : null
  );

  // Explicitly typed: the pipeline reads the previous settled meta back out
  // of this signal, so inference would otherwise be circular.
  private readonly result: Signal<ResultState | null> = toSignal<ResultState | null>(
    toObservable(this.request).pipe(
      switchMap((request) => {
        // Read before the new request replaces it: the meta of the last answer
        // that actually settled, or null on first load.
        const previousMeta = this.ready()?.meta ?? null;

        return request === null
          ? of<ResultState>({ status: 'invalid' })
          : this.macro.observations(request).pipe(
              map(
                (envelope): ResultState => ({
                  status: 'ready',
                  rows: envelope.data,
                  meta: envelope.meta
                })
              ),
              catchError((error: unknown) =>
                of<ResultState>({
                  status: 'unavailable',
                  message: macroErrorMessage(error, UNAVAILABLE)
                })
              ),
              // Per request, so re-querying returns to the loading state
              // instead of holding the previous answer.
              startWith<ResultState>({ status: 'loading', previousMeta })
            );
      })
    ),
    { initialValue: null }
  );

  /**
   * The meta the pager should describe: the settled answer when there is one,
   * otherwise the last one that settled. Never the working query's own numbers,
   * which say what was asked for rather than what exists.
   */
  private readonly pagerMeta = computed<EnvelopeMeta | null>(() => {
    const state = this.result();
    if (state === null) {
      return null;
    }
    if (state.status === 'ready') {
      return state.meta;
    }
    return state.status === 'loading' ? state.previousMeta : null;
  });

  protected readonly loading = computed(() => {
    const state = this.result();
    // `null` is first render before the pipeline emits; `loading` is every
    // in-flight request after that.
    return state === null || state.status === 'loading';
  });
  protected readonly invalid = computed(() => this.result()?.status === 'invalid');
  protected readonly unavailable = computed(() => this.result()?.status === 'unavailable');

  protected readonly unavailableMessage = computed(() => {
    const state = this.result();
    return state?.status === 'unavailable' ? state.message : UNAVAILABLE;
  });

  private readonly ready = computed(() => {
    const state = this.result();
    return state?.status === 'ready' ? state : null;
  });

  protected readonly rows = computed(() => this.ready()?.rows ?? []);

  protected readonly empty = computed(() => this.ready() !== null && this.rows().length === 0);

  /**
   * The row range, from `meta` rather than `data.length`.
   *
   * `data.length` is the size of this page; the moment paging is real it would
   * under-report the result.
   */
  protected readonly rowRange = computed(() => {
    const state = this.ready();
    if (state === null || state.rows.length === 0) {
      return '';
    }

    // Through the null-safe computeds, not `state.meta`: `page` and `pageSize`
    // are nullable on the routes that do not paginate.
    const start = (this.page() - 1) * this.pageSize() + 1;
    const { totalCount } = state.meta;

    return `Rows ${start}–${start + state.rows.length - 1} of ${totalCount}`;
  });

  /**
   * The phrase the shared query card appends. The card owns no noun, so the
   * plural rule for "observation" lives here with the tab that knows it.
   */
  protected readonly resultSummary = computed(() => {
    const state = this.ready();
    if (state === null) {
      return null;
    }
    const count = state.meta.totalCount;
    return `${count} ${count === 1 ? 'observation' : 'observations'}`;
  });

  // ---------- paging ----------

  /**
   * Footer numbers fall back to the working query when there is no result, so
   * the strip still reads `Page 1 of 1 - pageSize 25` in the empty, invalid and
   * unavailable states, exactly as the empty-state design shows.
   */
  // Falls back to the working query, the way `pageSize` already does: during a
  // re-query the page the user asked for is the honest answer, and `1` is not.
  protected readonly page = computed(() => this.ready()?.meta.page ?? this.query().page);

  protected readonly pageSize = computed(
    () => this.ready()?.meta.pageSize ?? this.query().pageSize
  );

  /** Held across an in-flight re-query so the count does not collapse to 1. */

  protected readonly pageCount = computed(() => {
    const meta = this.pagerMeta();
    if (meta === null) {
      return 1;
    }
    return Math.max(1, Math.ceil(meta.totalCount / this.pageSize()));
  });

  /** The vintages the values came from, or an em dash when there are none. */
  protected readonly vintageLabels = computed(() => {
    const vintages = this.ready()?.meta.vintages ?? [];
    return vintages.length ? vintages.map((vintage) => vintage.label).join(' · ') : '—';
  });

  /** The footer decides when a direction is available and only emits then. */
  protected prev(): void {
    this.store.setPage(this.page() - 1);
  }

  protected next(): void {
    this.store.setPage(this.page() + 1);
  }

  protected value(row: Observation): string {
    return formatValue(row.value);
  }

  /** One row per (indicator, country, year, source), so this is unique. */
  protected rowKey(row: Observation): string {
    return `${row.indicator}|${row.country}|${row.year}|${row.source}`;
  }
}
