import { Injectable, type Signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';

import { MacroRequestError } from './http/macro-error';
import type { Envelope, Observation, ObservationsQuery } from './macro-contracts';
import { type ResultState$, createResultState } from './result-state';
import { WorkingQueryStore } from './working-query.store';

const UNAVAILABLE = 'Observations are unavailable.';

function envelope(
  rows: readonly Observation[],
  meta: Partial<Envelope<Observation>['meta']> = {}
): Envelope<Observation> {
  return {
    data: [...rows],
    meta: {
      page: 1,
      pageSize: 25,
      totalCount: rows.length,
      vintages: [],
      attribution: [],
      ...meta
    }
  };
}

function row(year: number): Observation {
  return {
    indicator: 'GDP_GROWTH_REAL',
    country: 'ZAF',
    year,
    value: 1.5,
    isForecast: false,
    source: 'IMF_WEO',
    vintageId: 2
  };
}

/**
 * A provider double that holds every request until released, so the in-flight
 * window is observable. Under a synchronous double it is zero-width, which is
 * exactly why the defects this state machine has carried went unnoticed.
 */
@Injectable()
class DeferredSource {
  private pending: (() => void)[] = [];
  calls: ObservationsQuery[] = [];
  answer: Envelope<Observation> = envelope([row(2020)]);
  failWith: unknown = null;

  fetch = (query: ObservationsQuery): Observable<Envelope<Observation>> => {
    this.calls.push(query);

    return new Observable<Envelope<Observation>>((subscriber) => {
      const settle = () => {
        if (this.failWith !== null) {
          subscriber.error(this.failWith);
          return;
        }
        subscriber.next(this.answer);
        subscriber.complete();
      };
      this.pending.push(settle);
    });
  };

  /** Settles the most recent request only, leaving earlier ones abandoned. */
  releaseLatest(): void {
    const settle = this.pending.pop();
    this.pending = [];
    settle?.();
  }
}

describe('createResultState', () => {
  let store: WorkingQueryStore;
  let source: DeferredSource;
  let state: ResultState$<Observation>;

  function build(): void {
    TestBed.configureTestingModule({ providers: [WorkingQueryStore, DeferredSource] });

    store = TestBed.inject(WorkingQueryStore);
    store.reset();
    source = TestBed.inject(DeferredSource);

    state = TestBed.runInInjectionContext(() =>
      createResultState<Observation>({ fetch: source.fetch, unavailable: UNAVAILABLE })
    );
  }

  /** `toObservable` is effect-backed, so the query change needs a flush. */
  function flush(): void {
    TestBed.tick();
  }

  function sendableQuery(): void {
    store.addIndicator('GDP_GROWTH_REAL');
    store.addCountry('ZAF');
  }

  beforeEach(build);
  afterEach(() => TestBed.resetTestingModule());

  describe('the request gate', () => {
    it('issues no request and reports invalid while the query is unsendable', () => {
      flush();

      expect(state.invalid()).toBeTrue();
      expect(source.calls.length).toBe(0);
      expect(state.items()).toEqual([]);
    });

    it('reports loading once the query becomes sendable', () => {
      sendableQuery();
      flush();

      expect(state.loading()).toBeTrue();
      expect(state.invalid()).toBeFalse();
      expect(source.calls.length).toBe(1);
    });

    it('settles into the answer', () => {
      sendableQuery();
      flush();
      source.releaseLatest();

      expect(state.loading()).toBeFalse();
      expect(state.settled()).toBeTrue();
      expect(state.items().length).toBe(1);
    });
  });

  describe('the in-flight window', () => {
    beforeEach(() => {
      source.answer = envelope([row(2020)], { totalCount: 61, page: 1, pageSize: 25 });
      sendableQuery();
      flush();
      source.releaseLatest();
    });

    it('returns to loading on a re-query instead of holding the previous answer', () => {
      expect(state.settled()).toBeTrue();

      store.setPage(2);
      flush();

      expect(state.loading()).toBeTrue();
      expect(state.settled()).toBeFalse();
      expect(state.items()).toEqual([]);
    });

    it('keeps reporting the asked-for page and the last real count', () => {
      expect(state.pageCount()).toBe(3);

      store.setPage(2);
      flush();

      expect(state.page()).toBe(2);
      expect(state.pageCount()).toBe(3);
    });

    it('holds the count across a SECOND re-query issued before the first settles', () => {
      // The defect this extraction exists to fix once. Deriving the held meta
      // from the settled state works for one re-query and loses it on the next,
      // because by then the state is `loading` and there is nothing to read:
      // the footer then renders "Page 3 of 1" with Next disabled.
      store.setPage(2);
      flush();
      expect(state.pageCount()).toBe(3);

      store.setPage(3);
      flush();

      expect(state.loading()).toBeTrue();
      expect(state.page()).toBe(3);
      expect(state.pageCount()).toBe(3);
    });

    it('survives an arbitrary run of re-queries without settling', () => {
      for (const page of [2, 3, 2, 3, 2]) {
        store.setPage(page);
        flush();
        expect(state.pageCount()).withContext(`after page ${page}`).toBe(3);
      }
    });

    it('holds the count through a query edit, not only a paging click', () => {
      // Not paging-specific: any two working-query mutations inside one round
      // trip take the same path.
      store.addCountry('NAM');
      flush();
      store.setYearRange(2000, 2020);
      flush();

      expect(state.loading()).toBeTrue();
      expect(state.pageCount()).toBe(3);
    });
  });

  describe('failure', () => {
    beforeEach(() => {
      sendableQuery();
      flush();
    });

    it('surfaces the problem detail when the service supplied one', () => {
      source.failWith = new MacroRequestError(400, 'Unknown indicator code(s): NOPE.');
      source.releaseLatest();

      expect(state.unavailable()).toBeTrue();
      expect(state.unavailableMessage()).toBe('Unknown indicator code(s): NOPE.');
    });

    it('falls back to the tab wording when the error carries no detail', () => {
      source.failWith = new MacroRequestError(500, null);
      source.releaseLatest();

      expect(state.unavailableMessage()).toBe(UNAVAILABLE);
    });

    it('reports the fallback wording when nothing has failed', () => {
      expect(state.unavailableMessage()).toBe(UNAVAILABLE);
    });

    it('is not settled, so a failure never reads as an empty result', () => {
      source.failWith = new MacroRequestError(500, null);
      source.releaseLatest();

      expect(state.settled()).toBeFalse();
      expect(state.pageCount()).toBe(1);
    });
  });

  describe('the empty answer', () => {
    it('treats a 200 with empty data as settled, not as an error', () => {
      source.answer = envelope([]);
      sendableQuery();
      flush();
      source.releaseLatest();

      expect(state.settled()).toBeTrue();
      expect(state.unavailable()).toBeFalse();
      expect(state.items()).toEqual([]);
      expect(state.totalCount()).toBe(0);
    });
  });

  describe('the unpaginated routes', () => {
    it('falls back to the working query when meta carries null paging', () => {
      source.answer = envelope([row(2020)], { page: null, pageSize: null, totalCount: 214 });
      sendableQuery();
      flush();
      source.releaseLatest();

      expect(state.page()).toBe(store.query().page);
      expect(state.pageSize()).toBe(store.query().pageSize);
      expect(Number.isNaN(state.pageCount())).toBeFalse();
    });
  });

  describe('provenance', () => {
    it('joins the vintage labels the values came from', () => {
      source.answer = envelope([row(2020)], {
        vintages: [
          { id: 2, source: 'IMF_WEO', label: 'WEO 9.0.0' },
          { id: 12, source: 'WB_WDI', label: 'WDI 2026-07-13' }
        ]
      });
      sendableQuery();
      flush();
      source.releaseLatest();

      expect(state.vintageLabels()).toBe('WEO 9.0.0 · WDI 2026-07-13');
    });

    it('reports an em dash when the result carries no vintages', () => {
      sendableQuery();
      flush();
      source.releaseLatest();

      expect(state.vintageLabels()).toBe('—');
    });
  });

  describe('paging intent', () => {
    it('moves the store, which is what re-issues the request', () => {
      source.answer = envelope([row(2020)], { totalCount: 61 });
      sendableQuery();
      flush();
      source.releaseLatest();

      state.next();
      expect(store.query().page).toBe(2);

      state.prev();
      expect(store.query().page).toBe(1);
    });
  });
});
