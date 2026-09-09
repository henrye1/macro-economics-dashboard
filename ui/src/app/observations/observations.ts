import { Component, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, switchMap } from 'rxjs';

import type { EnvelopeMeta, Observation, ObservationsQuery } from '../core/macro-contracts';
import { MACRO_DATA } from '../core/macro-data.provider';
import { formatValue } from '../core/value-format';
import { WorkingQueryStore } from '../core/working-query.store';
import { PagingFooter } from '../query/paging-footer';
import { WorkingQueryCard } from '../query/working-query-card';

type ResultState =
  | { status: 'ready'; rows: readonly Observation[]; meta: EnvelopeMeta }
  /** The query cannot be sent: it would be a documented 400. */
  | { status: 'invalid' }
  | { status: 'unavailable' };

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

  private readonly result = toSignal<ResultState | null>(
    toObservable(this.request).pipe(
      switchMap((request) =>
        request === null
          ? of<ResultState>({ status: 'invalid' })
          : this.macro.observations(request).pipe(
              map(
                (envelope): ResultState => ({
                  status: 'ready',
                  rows: envelope.data,
                  meta: envelope.meta
                })
              ),
              catchError(() => of<ResultState>({ status: 'unavailable' }))
            )
      )
    ),
    { initialValue: null }
  );

  protected readonly loading = computed(() => this.result() === null);
  protected readonly invalid = computed(() => this.result()?.status === 'invalid');
  protected readonly unavailable = computed(() => this.result()?.status === 'unavailable');

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

    const { page, pageSize, totalCount } = state.meta;
    const start = (page - 1) * pageSize + 1;

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
  protected readonly page = computed(() => this.ready()?.meta.page ?? 1);

  protected readonly pageSize = computed(
    () => this.ready()?.meta.pageSize ?? this.query().pageSize
  );

  protected readonly pageCount = computed(() => {
    const state = this.ready();
    if (state === null) {
      return 1;
    }
    return Math.max(1, Math.ceil(state.meta.totalCount / state.meta.pageSize));
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
