import { type Signal, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { type Observable, catchError, map, of, startWith, switchMap, tap } from 'rxjs';

import { macroErrorMessage } from './http/macro-error';
import { LastResultVintages } from './last-result-vintages';
import type { Envelope, EnvelopeMeta, ObservationsQuery } from './macro-contracts';
import { WorkingQueryStore } from './working-query.store';

/**
 * The result of the working query, in every state a page has to render.
 *
 * Kept private to this module: pages read the derived signals below, never the
 * union. That is deliberate. Both result tabs used to own a copy of this union
 * and its pipeline, and three consecutive repairs each had to be applied twice,
 * with the second and third each introducing a defect the other copy did not
 * have. One owner is the fix.
 */
type ResultStatus<T> =
  | { status: 'ready'; items: readonly T[]; meta: EnvelopeMeta }
  /**
   * A request is in flight.
   *
   * Emitted at the head of every inner request, not only the first, so a
   * re-query returns to loading instead of leaving the previous answer on
   * screen describing a query that is no longer the one being asked.
   *
   * It carries the last settled `meta` so the pager can keep reporting a real
   * page count rather than collapsing to "Page 2 of 1".
   */
  | { status: 'loading'; previousMeta: EnvelopeMeta | null }
  /** The query cannot be sent: it would be a documented 400. */
  | { status: 'invalid' }
  | { status: 'unavailable'; message: string };

/** What a result page reads. Everything here is derived from one pipeline. */
export interface ResultSignals<T> {
  /** True before the first answer and for every in-flight request after it. */
  readonly loading: Signal<boolean>;
  /** The query is unsendable, so no request was issued. */
  readonly invalid: Signal<boolean>;
  readonly unavailable: Signal<boolean>;
  /** The service's own explanation when it gave one, else the tab's wording. */
  readonly unavailableMessage: Signal<string>;
  /** True only in the settled state, which is what `empty` must be derived from. */
  readonly settled: Signal<boolean>;
  /** This page of the answer. Empty in every unsettled state. */
  readonly items: Signal<readonly T[]>;
  /** The whole result, not this page. Never `data.length`. */
  readonly totalCount: Signal<number>;
  readonly page: Signal<number>;
  readonly pageSize: Signal<number>;
  readonly pageCount: Signal<number>;
  readonly vintageLabels: Signal<string>;
  readonly prev: () => void;
  readonly next: () => void;
}

export interface ResultSignalsConfig<T> {
  /** The provider call for this tab. The seam that keeps transport out of here. */
  readonly fetch: (query: ObservationsQuery) => Observable<Envelope<T>>;
  /** Shown when the request failed without the service explaining itself. */
  readonly unavailable: string;
}

/**
 * Builds the shared result state machine for a tab that answers the working
 * query.
 *
 * Call it from a field initializer: it injects `WorkingQueryStore` itself, so it
 * needs an injection context.
 *
 * The pipeline is the whole point. `switchMap` drops the previous request when
 * the query changes but emits nothing until the new answer lands, so without the
 * `startWith` the page would keep asserting the old result for a full round
 * trip. With it, the page returns to loading, and the held `meta` keeps the
 * pager honest while it waits.
 */
export function createResultState<T>({
  fetch,
  unavailable
}: ResultSignalsConfig<T>): ResultSignals<T> {
  const store = inject(WorkingQueryStore);
  const observedVintages = inject(LastResultVintages);

  /** `null` while the query is unsendable, which keeps the request out of flight. */
  const request = computed<ObservationsQuery | null>(() =>
    store.validation().valid ? store.apiQuery() : null
  );

  /**
   * The last `meta` that actually settled, held outside the stream.
   *
   * This is what makes the pager survive consecutive re-queries. Deriving it
   * from the current state instead fails the moment a second request is issued
   * while the first is still in flight: the state is then `loading`, not
   * `ready`, so there is nothing to read and the count collapses. Two clicks
   * inside one round trip is an ordinary thing to do, and over real HTTP that
   * window is the whole round trip.
   */
  let heldMeta: EnvelopeMeta | null = null;

  const result = toSignal<ResultStatus<T> | null>(
    toObservable(request).pipe(
      switchMap((query) => {
        // Captured where the request is built, not where it settles. Reading
        // the store in the `tap` would attribute this answer to whatever the
        // query had become by the time it arrived.
        const asked = store.query();

        return query === null
          ? of<ResultStatus<T>>({ status: 'invalid' })
          : fetch(query).pipe(
              tap((envelope) => {
                heldMeta = envelope.meta;
                // Published from here rather than from the two result pages:
                // this is the one place they share, and it already holds the
                // settled envelope. The vintages tab has its own pipeline and
                // must not publish — its result is a revision list, not the
                // working query's answer.
                observedVintages.record(asked, envelope.meta.vintages);
              }),
              map(
                (envelope): ResultStatus<T> => ({
                  status: 'ready',
                  items: envelope.data,
                  meta: envelope.meta
                })
              ),
              // A failure does not clear the held meta: the last real answer is
              // still the best thing the pager knows.
              catchError((error: unknown) =>
                of<ResultStatus<T>>({
                  status: 'unavailable',
                  message: macroErrorMessage(error, unavailable)
                })
              ),
              // Evaluated when the inner pipe is built, which is exactly when
              // the previous answer is still the held one.
              startWith<ResultStatus<T>>({ status: 'loading', previousMeta: heldMeta })
            );
      })
    ),
    { initialValue: null }
  );

  const ready = computed(() => {
    const state = result();
    return state?.status === 'ready' ? state : null;
  });

  /**
   * The meta the pager describes: the settled answer, or the last one that
   * settled while a request is in flight. Never the working query's own
   * numbers, which say what was asked for rather than what exists.
   */
  const pagerMeta = computed<EnvelopeMeta | null>(() => {
    const state = result();
    if (state === null) {
      return null;
    }
    if (state.status === 'ready') {
      return state.meta;
    }
    return state.status === 'loading' ? state.previousMeta : null;
  });

  const pageSize = computed(() => ready()?.meta.pageSize ?? store.query().pageSize);

  // Falls back to the working query, as `pageSize` does: during a re-query the
  // page the user asked for is the honest answer, and `1` is not.
  const page = computed(() => ready()?.meta.page ?? store.query().page);

  return {
    loading: computed(() => {
      const state = result();
      // `null` is first render before the pipeline emits; `loading` is every
      // in-flight request after that.
      return state === null || state.status === 'loading';
    }),
    invalid: computed(() => result()?.status === 'invalid'),
    unavailable: computed(() => result()?.status === 'unavailable'),
    unavailableMessage: computed(() => {
      const state = result();
      return state?.status === 'unavailable' ? state.message : unavailable;
    }),
    settled: computed(() => ready() !== null),
    items: computed(() => ready()?.items ?? []),
    totalCount: computed(() => ready()?.meta.totalCount ?? 0),

    page,
    pageSize,
    pageCount: computed(() => {
      const meta = pagerMeta();
      if (meta === null) {
        return 1;
      }
      return Math.max(1, Math.ceil(meta.totalCount / pageSize()));
    }),

    /** The vintages the values came from, or an em dash when there are none. */
    vintageLabels: computed(() => {
      const vintages = ready()?.meta.vintages ?? [];
      return vintages.length ? vintages.map((vintage) => vintage.label).join(' · ') : '—';
    }),

    // The footer decides when a direction is available and only emits then.
    prev: () => store.setPage(page() - 1),
    next: () => store.setPage(page() + 1)
  };
}
