import { Component, type Signal, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, switchMap } from 'rxjs';

import { macroErrorMessage } from '../core/http/macro-error';
import type { Revision, Vintage } from '../core/macro-contracts';
import { MACRO_DATA } from '../core/macro-data.provider';
import {
  SIGNIFICANCE_NOTE,
  type RevisionView,
  type SeriesSpan,
  appearedSeries,
  byNewestFirst,
  disappearedSeries,
  formatSeriesSpan,
  predecessorOf,
  toRevisionView
} from '../core/revision-view';
import { formatValue } from '../core/value-format';
import { PagingFooter } from '../query/paging-footer';

/** Shown when a request failed without the service explaining itself. */
const VINTAGES_UNAVAILABLE = 'The vintage list is unavailable.';
const REVISIONS_UNAVAILABLE = 'Revisions are unavailable.';

/** One page of revisions. The live route reported 2,830 rows for one vintage. */
const PAGE_SIZE = 25;

/**
 * How many spans each summary panel lists before it stops and counts the rest.
 *
 * Every sampled row of the live route had a null `previousValue`, so "appeared"
 * can be very large. An uncapped list would push the rest of the tab off screen.
 */
const SPAN_LIMIT = 5;

type ListState<T> =
  | { status: 'ready'; items: readonly T[]; totalCount: number }
  /**
   * A request is in flight.
   *
   * It carries the last settled total so the pager keeps reporting a real page
   * count while it waits. Deriving the count from the settled state instead
   * collapses it to 1 mid-flight, which reads as "Page 3 of 1" the moment the
   * footer is on screen at the same time. `core/result-state.ts` carries the
   * same value for the same reason on the other two result tabs.
   *
   * The vintages list passes null: it issues one request and has no pager.
   */
  | { status: 'loading'; previousTotal: number | null }
  | { status: 'unavailable'; message: string };

interface RevisionRequest {
  readonly vintageId: number;
  readonly page: number;
}

@Component({
  selector: 'app-vintages',
  imports: [PagingFooter],
  templateUrl: './vintages.html',
  styleUrl: './vintages.scss'
})
export class VintagesPage {
  private readonly macro = inject(MACRO_DATA);

  protected readonly significanceNote = SIGNIFICANCE_NOTE;

  // ---------- published vintages ----------

  private readonly vintagesState = toSignal<ListState<Vintage> | null>(
    this.macro.vintages().pipe(
      map(
        (envelope): ListState<Vintage> => ({
          status: 'ready',
          // Sorted here: the service does not document an order.
          items: byNewestFirst(envelope.data),
          totalCount: envelope.meta.totalCount
        })
      ),
      catchError((error: unknown) =>
        of<ListState<Vintage>>({
          status: 'unavailable',
          message: macroErrorMessage(error, VINTAGES_UNAVAILABLE)
        })
      ),
      startWith<ListState<Vintage>>({ status: 'loading', previousTotal: null })
    ),
    { initialValue: null }
  );

  protected readonly vintagesLoading = computed(() => {
    const state = this.vintagesState();
    return state === null || state.status === 'loading';
  });

  protected readonly vintagesUnavailable = computed(
    () => this.vintagesState()?.status === 'unavailable'
  );

  protected readonly vintagesMessage = computed(() => {
    const state = this.vintagesState();
    return state?.status === 'unavailable' ? state.message : VINTAGES_UNAVAILABLE;
  });

  protected readonly vintages = computed(() => {
    const state = this.vintagesState();
    return state?.status === 'ready' ? state.items : [];
  });

  protected readonly noVintages = computed(
    () => this.vintagesState()?.status === 'ready' && this.vintages().length === 0
  );

  // ---------- selection ----------

  private readonly selectedId = signal<number | null>(null);

  protected readonly selected = computed<Vintage | null>(() => {
    const id = this.selectedId();
    return id === null ? null : (this.vintages().find((v) => v.id === id) ?? null);
  });

  protected isSelected(vintage: Vintage): boolean {
    return this.selectedId() === vintage.id;
  }

  protected select(vintage: Vintage): void {
    if (this.selectedId() !== vintage.id) {
      this.selectedId.set(vintage.id);
      this.page.set(1);
    }
  }

  /** Null until a vintage is chosen, or when it is its source's earliest. */
  protected readonly predecessor = computed<Vintage | null>(() => {
    const selected = this.selected();
    return selected === null ? null : predecessorOf(this.vintages(), selected);
  });

  // ---------- revisions ----------

  private readonly page = signal(1);

  /** Null while nothing is selected, which keeps the request out of flight. */
  private readonly request = computed<RevisionRequest | null>(() => {
    const selected = this.selected();
    return selected === null ? null : { vintageId: selected.id, page: this.page() };
  });

  private readonly revisionsState: Signal<ListState<Revision> | null> = toSignal<
    ListState<Revision> | null
  >(
    toObservable(this.request).pipe(
      switchMap((request) => {
        // Read where the inner pipe is built, which is while the previous
        // answer is still the settled one.
        const previousTotal = this.readyRevisions()?.totalCount ?? null;

        return request === null
          ? of<ListState<Revision> | null>(null)
          : this.macro
              .revisions(request.vintageId, { page: request.page, pageSize: PAGE_SIZE })
              .pipe(
                map(
                  (envelope): ListState<Revision> => ({
                    status: 'ready',
                    items: envelope.data,
                    totalCount: envelope.meta.totalCount
                  })
                ),
                catchError((error: unknown) =>
                  of<ListState<Revision>>({
                    status: 'unavailable',
                    message: macroErrorMessage(error, REVISIONS_UNAVAILABLE)
                  })
                ),
                // Per request, so paging returns to loading rather than holding
                // the previous page's rows.
                startWith<ListState<Revision>>({ status: 'loading', previousTotal })
              );
      })
    ),
    { initialValue: null }
  );

  protected readonly nothingSelected = computed(() => this.selected() === null);

  protected readonly revisionsLoading = computed(
    () => this.revisionsState()?.status === 'loading'
  );

  protected readonly revisionsUnavailable = computed(
    () => this.revisionsState()?.status === 'unavailable'
  );

  protected readonly revisionsMessage = computed(() => {
    const state = this.revisionsState();
    return state?.status === 'unavailable' ? state.message : REVISIONS_UNAVAILABLE;
  });

  private readonly readyRevisions = computed(() => {
    const state = this.revisionsState();
    return state?.status === 'ready' ? state : null;
  });

  /** Every row on this page, with its derived change and flag. */
  private readonly views = computed<readonly RevisionView[]>(() =>
    (this.readyRevisions()?.items ?? []).map(toRevisionView)
  );

  protected readonly significantOnly = signal(false);

  protected toggleSignificantOnly(): void {
    this.significantOnly.update((on) => !on);
  }

  protected readonly rows = computed(() =>
    this.significantOnly() ? this.views().filter((view) => view.significant) : this.views()
  );

  protected readonly unchanged = computed(
    () => this.readyRevisions() !== null && this.views().length === 0
  );

  /** The filter hid everything, which is not the same as a vintage changing nothing. */
  protected readonly filteredToNothing = computed(
    () => this.views().length > 0 && this.rows().length === 0
  );

  // ---------- paging ----------

  protected readonly currentPage = computed(() => this.page());
  protected readonly pageSize = PAGE_SIZE;

  /**
   * The total the pager describes: the settled answer, or the last one that
   * settled while a request is in flight. Never zero just because nothing has
   * arrived yet, which would claim a single page.
   */
  private readonly pagerTotal = computed<number | null>(() => {
    const state = this.revisionsState();
    if (state === null) {
      return null;
    }
    if (state.status === 'ready') {
      return state.totalCount;
    }
    return state.status === 'loading' ? state.previousTotal : null;
  });

  protected readonly pageCount = computed(() =>
    Math.max(1, Math.ceil((this.pagerTotal() ?? 0) / PAGE_SIZE))
  );

  protected prev(): void {
    this.page.update((page) => Math.max(1, page - 1));
  }

  protected next(): void {
    this.page.update((page) => Math.min(this.pageCount(), page + 1));
  }

  /** The footer's provenance slot: the vintage being examined. */
  protected readonly pagerVintage = computed(() => this.selected()?.label ?? '—');

  // ---------- summary strip ----------

  protected readonly appeared = computed(() => appearedSeries(this.views().map((v) => v.revision)));
  protected readonly disappeared = computed(() =>
    disappearedSeries(this.views().map((v) => v.revision))
  );

  protected readonly appearedShown = computed(() => this.appeared().slice(0, SPAN_LIMIT));
  protected readonly disappearedShown = computed(() => this.disappeared().slice(0, SPAN_LIMIT));

  protected readonly appearedOverflow = computed(() =>
    Math.max(0, this.appeared().length - SPAN_LIMIT)
  );
  protected readonly disappearedOverflow = computed(() =>
    Math.max(0, this.disappeared().length - SPAN_LIMIT)
  );

  protected span(span: SeriesSpan): string {
    return formatSeriesSpan(span);
  }

  // ---------- rendering ----------

  protected value(value: number | null): string {
    return value === null ? '—' : formatValue(value);
  }

  /** Signed, so a revision reads as a movement rather than a replacement. */
  protected change(view: RevisionView): string {
    if (view.change === null) {
      return '—';
    }
    return view.change > 0 ? `+${formatValue(view.change)}` : formatValue(view.change);
  }

  protected changeClass(view: RevisionView): string {
    if (view.change === null || view.change === 0) {
      return '';
    }
    return view.change > 0 ? 'up' : 'down';
  }

  protected rowKey(view: RevisionView): string {
    const { indicator, country, year } = view.revision;
    return `${indicator}|${country}|${year}`;
  }
}
