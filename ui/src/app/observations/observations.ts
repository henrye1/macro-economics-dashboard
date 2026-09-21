import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { Observation } from '../core/macro-contracts';
import { MACRO_DATA } from '../core/macro-data.provider';
import { createResultState } from '../core/result-state';
import { formatValue } from '../core/value-format';
import { WorkingQueryStore } from '../core/working-query.store';
import { PagingFooter } from '../query/paging-footer';
import { WorkingQueryCard } from '../query/working-query-card';

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
 * The result state machine itself lives in `core/result-state.ts` and is shared
 * with the Series tab. What remains here is only what is genuinely this tab's:
 * the provider call, the wording, and the row-shaped views.
 *
 * Rows are rendered in the order the provider returns them. The live API does
 * not document an order, so sorting here would hide a difference feature 8
 * needs to see.
 */
@Component({
  selector: 'app-observations',
  imports: [PagingFooter, RouterLink, WorkingQueryCard],
  templateUrl: './observations.html',
  styleUrl: './observations.scss'
})
export class ObservationsPage {
  private readonly macro = inject(MACRO_DATA);
  private readonly store = inject(WorkingQueryStore);

  protected readonly query = this.store.query;

  private readonly state = createResultState<Observation>({
    fetch: (query) => this.macro.observations(query),
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

  protected readonly rows = this.state.items;

  protected readonly empty = computed(() => this.state.settled() && this.rows().length === 0);

  /**
   * The row range, from `meta` rather than `data.length`.
   *
   * `data.length` is the size of this page; the moment paging is real it would
   * under-report the result.
   */
  protected readonly rowRange = computed(() => {
    const rows = this.rows();
    if (!this.state.settled() || rows.length === 0) {
      return '';
    }

    // Through the null-safe signals: `page` and `pageSize` are nullable on the
    // routes that do not paginate, and fall back to the working query.
    const start = (this.page() - 1) * this.pageSize() + 1;

    return `Rows ${start}\u2013${start + rows.length - 1} of ${this.state.totalCount()}`;
  });

  /**
   * The phrase the shared query card appends. The card owns no noun, so the
   * plural rule for "observation" lives here with the tab that knows it.
   */
  protected readonly resultSummary = computed(() => {
    if (!this.state.settled()) {
      return null;
    }
    const count = this.state.totalCount();
    return `${count} ${count === 1 ? 'observation' : 'observations'}`;
  });

  /** The footer decides when a direction is available and only emits then. */
  protected prev(): void {
    this.state.prev();
  }

  protected next(): void {
    this.state.next();
  }

  protected value(row: Observation): string {
    return formatValue(row.value);
  }

  /** One row per (indicator, country, year, source), so this is unique. */
  protected rowKey(row: Observation): string {
    return `${row.indicator}|${row.country}|${row.year}|${row.source}`;
  }
}
