import { TestBed } from '@angular/core/testing';

import { DEFAULT_WORKING_QUERY } from './working-query';
import { WorkingQueryStore } from './working-query.store';

describe('WorkingQueryStore', () => {
  let store: WorkingQueryStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = TestBed.inject(WorkingQueryStore);
  });

  it('starts at the defaults', () => {
    expect(store.query()).toEqual(DEFAULT_WORKING_QUERY);
  });

  it('is shared, so two injections see the same query', () => {
    store.addIndicator('GDP_GROWTH_REAL');

    expect(TestBed.inject(WorkingQueryStore).query().indicators).toEqual(['GDP_GROWTH_REAL']);
  });

  describe('indicators and countries', () => {
    it('appends in the order chosen', () => {
      store.addIndicator('GDP_GROWTH_REAL');
      store.addIndicator('CPI_INFLATION_AVG');

      expect(store.query().indicators).toEqual(['GDP_GROWTH_REAL', 'CPI_INFLATION_AVG']);
    });

    it('ignores a repeated add, so clicking a catalogue row twice is safe', () => {
      store.addIndicator('GDP_GROWTH_REAL');
      store.addIndicator('GDP_GROWTH_REAL');

      expect(store.query().indicators).toEqual(['GDP_GROWTH_REAL']);
    });

    it('removes only the named entry', () => {
      store.addIndicator('A');
      store.addIndicator('B');
      store.removeIndicator('A');

      expect(store.query().indicators).toEqual(['B']);
    });

    it('ignores removing something absent', () => {
      store.addIndicator('A');
      const before = store.query();
      store.removeIndicator('NOPE');

      expect(store.query()).toBe(before);
    });

    it('keeps countries independent of indicators', () => {
      store.addIndicator('A');
      store.addCountry('ZAF');
      store.addCountry('ZAF');
      store.removeCountry('ZAF');
      store.addCountry('NAM');

      expect(store.query().indicators).toEqual(['A']);
      expect(store.query().countries).toEqual(['NAM']);
    });
  });

  describe('paging', () => {
    it('setPage keeps the page', () => {
      store.setPage(3);

      expect(store.query().page).toBe(3);
    });

    it('never goes below page 1', () => {
      store.setPage(0);
      expect(store.query().page).toBe(1);

      store.setPage(-5);
      expect(store.query().page).toBe(1);
    });

    it('resets to page 1 on every filter change', () => {
      const changes: ReadonlyArray<[string, () => void]> = [
        ['addIndicator', () => store.addIndicator(`I${Math.random()}`)],
        ['removeIndicator', () => store.removeIndicator('I-seed')],
        ['addCountry', () => store.addCountry(`C${Math.random()}`)],
        ['removeCountry', () => store.removeCountry('C-seed')],
        ['setYearRange', () => store.setYearRange(2018, 2031)],
        ['setSource', () => store.setSource('WB_WDI')],
        ['setForecast', () => store.setForecast('actual')],
        ['setVintage', () => store.setVintage(12)]
      ];

      for (const [name, change] of changes) {
        store.reset();
        store.addIndicator('I-seed');
        store.addCountry('C-seed');
        store.setPage(3);
        expect(store.query().page)
          .withContext(`page should be 3 before ${name}`)
          .toBe(3);

        change();

        expect(store.query().page).withContext(`${name} should reset the page`).toBe(1);
      }
    });
  });

  describe('validation', () => {
    it('is invalid with no indicators and valid once one is added', () => {
      expect(store.validation().valid).toBeFalse();

      store.addIndicator('GDP_GROWTH_REAL');

      expect(store.validation().valid).toBeTrue();
    });

    it('reports and then clears an inverted year range', () => {
      store.addIndicator('GDP_GROWTH_REAL');
      store.setYearRange(2030, 2020);

      expect(store.validation().problems).toContain('inverted-year-range');

      store.setYearRange(2020, 2030);

      expect(store.validation().valid).toBeTrue();
    });
  });

  describe('apiQuery', () => {
    it('tracks the state and omits defaults', () => {
      store.addIndicator('GDP_GROWTH_REAL');

      expect(store.apiQuery()).toEqual({ indicators: ['GDP_GROWTH_REAL'], pageSize: 25 });

      store.addCountry('ZAF');
      store.setForecast('forecast');

      expect(store.apiQuery()).toEqual({
        indicators: ['GDP_GROWTH_REAL'],
        countries: ['ZAF'],
        forecast: 'forecast',
        pageSize: 25
      });
    });
  });

  it('reset returns to the defaults from any state', () => {
    store.addIndicator('A');
    store.addCountry('ZAF');
    store.setYearRange(2000, 2020);
    store.setSource('IMF_WEO');
    store.setForecast('actual');
    store.setVintage(12);
    store.setPage(4);

    store.reset();

    expect(store.query()).toEqual(DEFAULT_WORKING_QUERY);
  });
});

/**
 * F-22: a mutation that changes nothing must not mint a new query object.
 *
 * Reference identity is the mechanism, not the point. Signals compare by
 * identity, so a structurally equal but new object notifies every reader and
 * costs a full round trip. The round trip itself is asserted in
 * `result-state.spec.ts`; this block pins the store half.
 */
describe('WorkingQueryStore no-op mutations', () => {
  let store: WorkingQueryStore;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [WorkingQueryStore] });
    store = TestBed.inject(WorkingQueryStore);
    store.reset();
    // A populated query, so every setter below is writing back a real value
    // rather than re-asserting a default.
    store.addIndicator('GDP_GROWTH_REAL');
    store.addCountry('ZAF');
    store.setYearRange(2018, 2031);
    store.setSource('IMF_WEO');
    store.setForecast('forecast');
    store.setVintage(12);
  });

  afterEach(() => TestBed.resetTestingModule());

  describe('keeps the same object when nothing changes', () => {
    it('setSource with the current value', () => {
      const before = store.query();
      store.setSource('IMF_WEO');

      expect(store.query()).toBe(before);
    });

    it('setForecast with the current value', () => {
      const before = store.query();
      store.setForecast('forecast');

      expect(store.query()).toBe(before);
    });

    it('setVintage with the current value', () => {
      const before = store.query();
      store.setVintage(12);

      expect(store.query()).toBe(before);
    });

    it('setYearRange with the current values', () => {
      const before = store.query();
      store.setYearRange(2018, 2031);

      expect(store.query()).toBe(before);
    });

    it('setPage with the current page', () => {
      const before = store.query();
      store.setPage(before.page);

      expect(store.query()).toBe(before);
    });

    it('setPage with a value that clamps to the current page', () => {
      store.setPage(1);
      const before = store.query();
      // `Math.max(1, ...)` clamps 0 and -5 to 1, so neither is a change.
      store.setPage(0);
      expect(store.query()).toBe(before);

      store.setPage(-5);
      expect(store.query()).toBe(before);
    });

    it('setPage with a fractional value that truncates to the current page', () => {
      store.setPage(3);
      const before = store.query();
      store.setPage(3.7);

      expect(store.query()).toBe(before);
    });
  });

  describe('still emits a new object for every real change', () => {
    it('setSource', () => {
      const before = store.query();
      store.setSource('WB_WDI');

      expect(store.query()).not.toBe(before);
      expect(store.query().source).toBe('WB_WDI');
    });

    it('setForecast', () => {
      const before = store.query();
      store.setForecast('actual');

      expect(store.query()).not.toBe(before);
      expect(store.query().forecast).toBe('actual');
    });

    it('setVintage', () => {
      const before = store.query();
      store.setVintage('latest');

      expect(store.query()).not.toBe(before);
      expect(store.query().vintage).toBe('latest');
    });

    it('setYearRange', () => {
      const before = store.query();
      store.setYearRange(2000, 2031);

      expect(store.query()).not.toBe(before);
      expect(store.query().yearFrom).toBe(2000);
    });

    it('setYearRange clearing a bound', () => {
      const before = store.query();
      store.setYearRange(null, null);

      expect(store.query()).not.toBe(before);
      expect(store.query().yearFrom).toBeNull();
    });

    it('setPage', () => {
      const before = store.query();
      store.setPage(2);

      expect(store.query()).not.toBe(before);
      expect(store.query().page).toBe(2);
    });

    it('addIndicator and removeIndicator', () => {
      const before = store.query();
      store.addIndicator('CPI_INFLATION_AVG');
      expect(store.query()).not.toBe(before);

      const added = store.query();
      store.removeIndicator('CPI_INFLATION_AVG');
      expect(store.query()).not.toBe(added);
    });
  });

  it('treats an unchanged filter on page 3 as a change, because paging resets', () => {
    // The reason the guard compares the built candidate rather than the
    // incoming changes: `patch` also forces `page: 1`, so re-selecting the
    // current source while on page 3 really does change the query.
    store.setPage(3);
    const before = store.query();
    expect(before.page).toBe(3);

    store.setSource('IMF_WEO');

    expect(store.query()).not.toBe(before);
    expect(store.query().page).toBe(1);
    expect(store.query().source).toBe('IMF_WEO');
  });

  it('leaves validation and the api query untouched across a no-op', () => {
    const validation = store.validation();
    const apiQuery = store.apiQuery();

    store.setSource('IMF_WEO');

    // Both are computeds over the same signal, so identity survives too.
    expect(store.validation()).toBe(validation);
    expect(store.apiQuery()).toBe(apiQuery);
  });
});
