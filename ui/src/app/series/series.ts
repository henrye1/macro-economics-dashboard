import { Component, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, switchMap } from 'rxjs';

import type { EnvelopeMeta, Series, SeriesQuery } from '../core/macro-contracts';
import { MACRO_DATA } from '../core/macro-data.provider';
import { formatValue } from '../core/value-format';
import { WorkingQueryStore } from '../core/working-query.store';
import { PagingFooter } from '../query/paging-footer';
import { WorkingQueryCard } from '../query/working-query-card';

type ResultState =
  | { status: 'ready'; series: readonly Series[]; meta: EnvelopeMeta }
  /** The query cannot be sent: it would be a documented 400. */
  | { status: 'invalid' }
  | { status: 'unavailable' };

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

  private readonly result = toSignal<ResultState | null>(
    toObservable(this.request).pipe(
      switchMap((request) =>
        request === null
          ? of<ResultState>({ status: 'invalid' })
          : this.macro.series(request).pipe(
              map(
                (envelope): ResultState => ({
                  status: 'ready',
                  series: envelope.data,
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

    const { page, pageSize, totalCount } = state.meta;
    const offset = (page - 1) * pageSize;

    return state.series.map((series, index) => toView(series, offset + index + 1, totalCount));
  });

  // ---------- paging ----------

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
