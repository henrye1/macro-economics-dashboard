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
