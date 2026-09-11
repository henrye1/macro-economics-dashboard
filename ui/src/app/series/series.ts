import { Component, computed, inject } from '@angular/core';

import type { Series } from '../core/macro-contracts';
import { MACRO_DATA } from '../core/macro-data.provider';
import { createResultState } from '../core/result-state';
import { formatValue } from '../core/value-format';
import { WorkingQueryStore } from '../core/working-query.store';
import { PagingFooter } from '../query/paging-footer';
import { WorkingQueryCard } from '../query/working-query-card';

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

  private readonly state = createResultState<Series>({
    fetch: (query) => this.macro.series(query),
    unavailable: UNAVAILABLE
  });

  protected readonly loading = this.state.loading;
  protected readonly invalid = this.state.invalid;
  protected readonly unavailable = this.state.unavailable;
  protected readonly unavailableMessage = this.state.unavailableMessage;
  protected readonly page = this.state.page;
  protected readonly pageSize = this.state.pageSize;
  protected readonly pageCount = this.state.pageCount;
  protected readonly vintageLabels = this.state.vintageLabels;

  /** Series, not rows. This is the one place the two result tabs differ. */
  protected readonly total = this.state.totalCount;

  protected readonly empty = computed(() => this.state.settled() && this.total() === 0);

  /**
   * The phrase the shared query card appends. The card owns no noun: "series" is
   * its own plural, so only the host can get this right.
   */
  protected readonly resultSummary = computed(() =>
    this.state.settled() ? `${this.total()} series` : null
  );

  protected readonly views = computed<readonly SeriesView[]>(() => {
    if (!this.state.settled()) {
      return [];
    }

    // Through the null-safe signals: `page` and `pageSize` are nullable on the
    // routes that do not paginate, and fall back to the working query.
    const totalCount = this.total();
    const offset = (this.page() - 1) * this.pageSize();

    return this.state
      .items()
      .map((series, index) => toView(series, offset + index + 1, totalCount));
  });

  /** The footer decides when a direction is available and only emits then. */
  protected prev(): void {
    this.state.prev();
  }

  protected next(): void {
    this.state.next();
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
