import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of } from 'rxjs';

import type { Series } from '../core/macro-contracts';
import { MACRO_DATA } from '../core/macro-data.provider';
import { createResultState } from '../core/result-state';
import { buildCharts } from '../core/series-chart';
import { WorkingQueryStore } from '../core/working-query.store';
import { PagingFooter } from '../query/paging-footer';
import { WorkingQueryCard } from '../query/working-query-card';
import { SeriesChartCard } from './series-chart';

const UNAVAILABLE = 'Series are unavailable.';

interface SeriesRow {
  readonly series: Series;
  readonly years: string;
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
 * Charts are grouped one per indicator, not one per series, so several
 * countries share a value axis and can be read against each other. The geometry
 * is hand-rolled in `core/series-chart.ts`; no charting library is installed.
 */
@Component({
  selector: 'app-series',
  imports: [PagingFooter, SeriesChartCard, WorkingQueryCard],
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

  /**
   * ISO3 to name, from the catalogue. The series payload names a country by
   * code only, and the design labels the legend and the metadata table with the
   * name, so the tab resolves it here. A failed catalogue read is not a failed
   * tab: the map stays empty and every label falls back to its code.
   */
  private readonly countryNames = toSignal(
    this.macro.countries().pipe(
      map((envelope) => new Map(envelope.data.map(({ iso3, name }) => [iso3, name]))),
      catchError(() => of(new Map<string, string>()))
    ),
    { initialValue: new Map<string, string>() }
  );

  protected readonly charts = computed(() =>
    this.state.settled() ? buildCharts(this.state.items(), this.countryNames()) : []
  );

  /** `ZAF — South Africa`, or just the code where the catalogue is silent. */
  protected countryLabel(iso3: string): string {
    const name = this.countryNames().get(iso3);
    return name === undefined ? iso3 : `${iso3} — ${name}`;
  }

  /** The metadata table under the charts: one row per series on this page. */
  protected readonly rows = computed<readonly SeriesRow[]>(() =>
    this.state.settled()
      ? this.state.items().map((series) => ({ series, years: yearSpan(series) }))
      : []
  );

  /** The footer decides when a direction is available and only emits then. */
  protected prev(): void {
    this.state.prev();
  }

  protected next(): void {
    this.state.next();
  }
}

/** `2010 to 2031`, or the single year when the series has just one point. */
function yearSpan(series: Series): string {
  const years = series.points.map((point) => point.year);
  const first = years[0];
  const last = years[years.length - 1];

  if (first === undefined || last === undefined) {
    return 'no years';
  }

  return first === last ? String(first) : `${first} to ${last}`;
}
