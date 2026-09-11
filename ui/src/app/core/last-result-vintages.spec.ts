import { TestBed } from '@angular/core/testing';

import { LastResultVintages } from './last-result-vintages';
import type { VintageRef } from './macro-contracts';
import { DEFAULT_WORKING_QUERY, type WorkingQuery } from './working-query';

function query(overrides: Partial<WorkingQuery> = {}): WorkingQuery {
  return { ...DEFAULT_WORKING_QUERY, indicators: ['GDP_GROWTH_REAL'], ...overrides };
}

const WEO: VintageRef = { id: 2, source: 'IMF_WEO', label: 'WEO 9.0.0' };
const WDI: VintageRef = { id: 12, source: 'WB_WDI', label: 'WDI 2026-07-13' };

describe('LastResultVintages', () => {
  let service: LastResultVintages;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [LastResultVintages] });
    service = TestBed.inject(LastResultVintages);
  });

  afterEach(() => TestBed.resetTestingModule());

  it('reports nothing before any result has settled', () => {
    expect(service.idsFor(query())).toEqual([]);
  });

  it('reports the ids recorded for that query', () => {
    const asked = query();
    service.record(asked, [WEO]);

    expect(service.idsFor(asked)).toEqual([2]);
  });

  it('reports every id when a result drew on more than one vintage', () => {
    const asked = query();
    service.record(asked, [WEO, WDI]);

    expect(service.idsFor(asked)).toEqual([2, 12]);
  });

  it('reports an empty list when the result carried no vintages', () => {
    const asked = query();
    service.record(asked, []);

    expect(service.idsFor(asked)).toEqual([]);
  });

  it('matches by value, so a query rebuilt from equal parts still matches', () => {
    service.record(query(), [WEO]);

    const rebuilt = query({ indicators: ['GDP_GROWTH_REAL'] });
    expect(rebuilt).not.toBe(query());
    expect(service.idsFor(rebuilt)).toEqual([2]);
  });

  describe('the query-match guard', () => {
    it('refuses the ids once the query has changed', () => {
      // The point of storing the query with the ids: editing a filter and
      // saving before the new answer lands must not stamp the entry with the
      // previous query's provenance.
      service.record(query({ yearFrom: 2018 }), [WEO]);

      expect(service.idsFor(query({ yearFrom: 2000 }))).toEqual([]);
    });

    it('refuses on any field, not only the obvious ones', () => {
      const asked = query({ yearFrom: 2018, yearTo: 2031 });
      service.record(asked, [WEO]);

      const changes: readonly Partial<WorkingQuery>[] = [
        { indicators: ['CPI_INFLATION_AVG'] },
        { countries: ['ZAF'] },
        { yearFrom: 2019 },
        { yearTo: 2030 },
        { source: 'WB_WDI' },
        { forecast: 'actual' },
        { vintage: 12 },
        { page: 2 },
        { pageSize: 50 }
      ];

      for (const change of changes) {
        expect(service.idsFor({ ...asked, ...change }))
          .withContext(JSON.stringify(change))
          .toEqual([]);
      }
    });

    it('reports the ids again when the query returns to the recorded one', () => {
      const asked = query({ yearFrom: 2018 });
      service.record(asked, [WEO]);

      expect(service.idsFor(query({ yearFrom: 2000 }))).toEqual([]);
      expect(service.idsFor(asked)).toEqual([2]);
    });
  });

  it('keeps only the most recent recording', () => {
    const first = query({ yearFrom: 2018 });
    const second = query({ yearFrom: 2000 });

    service.record(first, [WEO]);
    service.record(second, [WDI]);

    expect(service.idsFor(second)).toEqual([12]);
    expect(service.idsFor(first)).toEqual([]);
  });

  it('copies the refs it was handed, so a later mutation cannot reach it', () => {
    const asked = query();
    const refs: VintageRef[] = [WEO];

    service.record(asked, refs);
    refs.push(WDI);

    expect(service.idsFor(asked)).toEqual([2]);
  });
});
