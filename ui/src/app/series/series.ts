import { Component, type Signal, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, switchMap } from 'rxjs';

import { macroErrorMessage } from '../core/http/macro-error';
import type { EnvelopeMeta, Series, SeriesQuery } from '../core/macro-contracts';
import { MACRO_DATA } from '../core/macro-data.provider';
import { formatValue } from '../core/value-format';
import { WorkingQueryStore } from '../core/working-query.store';
import { PagingFooter } from '../query/paging-footer';
import { WorkingQueryCard } from '../query/working-query-card';

type ResultState =
  | { status: 'ready'; series: readonly Series[]; meta: EnvelopeMeta }
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
const UNAVAILABLE = 'Series are unavailable.';

interface PointView {
  year: number;
  value: string;
  forecast: boolean;
}

interface SeriesView {
  series: Series;
  /** `series 2 of 4`, counted across the whole result rather than the page. */
  position: string;
  points: readonly PointView[];
  /**
   * Index of the point the boundary rule is drawn after, or `null` when
   * `lastActualYear` falls outside the visible window.
   */
  boundaryAfter: number | null;
  /** Announced to screen readers, which cannot see the tinting or the rule. */
  description: string;
}

/**
 * Series: the same working query grouped one object per indicator and country,
 * with the history and forecast boundary made visible.
 *
 * This is the tab that teaches the guide's recipe 5.1 - split each series at
 * `lastActualYear` to get history for fitting and the forecast path for
 * scenarios. It reads the same `WorkingQueryStore.apiQuery` as Observations, so
 * the two tabs cannot disagree about what was asked.
 *
 * There is deliberately no charting library. Points are tinted cells, which is
 * enough to show the boundary and keeps the bundle honest until the tab needs
 * more.
 */
@Component({
  selector: 'app-series',
  imports: [PagingFooter, WorkingQueryCard],
  templateUrl: './series.html',
  styleUrl: './series.scss'
})
export class SeriesPage {
  private readonly macro = inject(MACRO_DATA);
  private readonly store = inject(WorkingQueryStore);

  protected readonly query = this.store.query;

  /** `null` while the query is unsendable, which keeps the request out of flight. */
  private readonly request = computed<SeriesQuery | null>(() =>
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
          : this.macro.series(request).pipe(
              map(
                (envelope): ResultState => ({
                  status: 'ready',
                  series: envelope.data,
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

  protected readonly total = computed(() => this.ready()?.meta.totalCount ?? 0);

  protected readonly empty = computed(() => this.ready() !== null && this.total() === 0);

  /**
   * The phrase the shared query card appends. The card owns no noun: "series" is
   * its own plural, so only the host can get this right.
   */
  protected readonly resultSummary = computed(() => {
    const state = this.ready();
    return state === null ? null : `${state.meta.totalCount} series`;
  });

  protected readonly views = computed<readonly SeriesView[]>(() => {
    const state = this.ready();
    if (state === null) {
      return [];
    }

    // Through the null-safe computeds, not `state.meta`: `page` and `pageSize`
    // are nullable on the routes that do not paginate.
    const { totalCount } = state.meta;
    const offset = (this.page() - 1) * this.pageSize();

    return state.series.map((series, index) => toView(series, offset + index + 1, totalCount));
  });

  // ---------- paging ----------

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
}

function toView(series: Series, position: number, total: number): SeriesView {
  const points = series.points.map((point) => ({
    year: point.year,
    value: formatValue(point.value),
    forecast: point.isForecast
  }));

  return {
    series,
    position: `series ${position} of ${total}`,
    points,
    boundaryAfter: boundaryIndex(series),
    description: describe(series)
  };
}

/**
 * Where to draw the boundary rule, by year rather than by `isForecast`.
 *
 * Returns `null` when the rule would sit at either edge of the window: a
 * history-only or forecast-only view has no boundary to show, and drawing one
 * against the card's edge would imply the data stops there. The sub-strip still
 * states `lastActualYear` in both cases, so the fact is never lost.
 */
function boundaryIndex(series: Series): number | null {
  const last = series.points.reduce(
    (found, point, index) => (point.year <= series.lastActualYear ? index : found),
    -1
  );

  return last === -1 || last === series.points.length - 1 ? null : last;
}

function describe(series: Series): string {
  const years = series.points.map((point) => point.year);
  const first = years[0];
  const last = years[years.length - 1];

  const span = first === undefined || last === undefined ? 'no years' : `${first} to ${last}`;

  return `${series.name} for ${series.country}, ${series.unit}, ${span}, actual through ${series.lastActualYear}.`;
}
