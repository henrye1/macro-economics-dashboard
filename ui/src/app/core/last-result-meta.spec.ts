import { TestBed } from '@angular/core/testing';

import { LastResultMeta } from './last-result-meta';
import type { EnvelopeMeta, VintageRef } from './macro-contracts';
import { DEFAULT_WORKING_QUERY, type WorkingQuery } from './working-query';

function query(overrides: Partial<WorkingQuery> = {}): WorkingQuery {
  return { ...DEFAULT_WORKING_QUERY, indicators: ['GDP_GROWTH_REAL'], ...overrides };
}

const WEO: VintageRef = { id: 2, source: 'IMF_WEO', label: 'WEO 9.0.0' };
const WDI: VintageRef = { id: 12, source: 'WB_WDI', label: 'WDI 2026-07-13' };

/** The envelope meta a settled result would have carried. */
function meta(vintages: readonly VintageRef[], overrides: Partial<EnvelopeMeta> = {}): EnvelopeMeta {
  return {
    page: 1,
    pageSize: 25,
    totalCount: 56,
    vintages: [...vintages],
    attribution: ['Source: IMF World Economic Outlook database'],
    ...overrides
  };
}

describe('LastResultMeta', () => {
  let service: LastResultMeta;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [LastResultMeta] });
    service = TestBed.inject(LastResultMeta);
  });

  afterEach(() => TestBed.resetTestingModule());

  it('reports nothing before any result has settled', () => {
    expect(service.idsFor(query())).toEqual([]);
  });

  it('reports the ids recorded for that query', () => {
    const asked = query();
    service.record(asked, meta([WEO]));

    expect(service.idsFor(asked)).toEqual([2]);
  });

  it('reports every id when a result drew on more than one vintage', () => {
    const asked = query();
    service.record(asked, meta([WEO, WDI]));

    expect(service.idsFor(asked)).toEqual([2, 12]);
  });

  it('reports an empty list when the result carried no vintages', () => {
    const asked = query();
    service.record(asked, meta([]));

    expect(service.idsFor(asked)).toEqual([]);
  });

  it('matches by value, so a query rebuilt from equal parts still matches', () => {
    service.record(query(), meta([WEO]));

    const rebuilt = query({ indicators: ['GDP_GROWTH_REAL'] });
    expect(rebuilt).not.toBe(query());
    expect(service.idsFor(rebuilt)).toEqual([2]);
  });

  describe('the query-match guard', () => {
    it('refuses the ids once the query has changed', () => {
      // The point of storing the query with the ids: editing a filter and
      // saving before the new answer lands must not stamp the entry with the
      // previous query's provenance.
      service.record(query({ yearFrom: 2018 }), meta([WEO]));

      expect(service.idsFor(query({ yearFrom: 2000 }))).toEqual([]);
    });

    it('refuses on any field, not only the obvious ones', () => {
      const asked = query({ yearFrom: 2018, yearTo: 2031 });
      service.record(asked, meta([WEO]));

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
      service.record(asked, meta([WEO]));

      expect(service.idsFor(query({ yearFrom: 2000 }))).toEqual([]);
      expect(service.idsFor(asked)).toEqual([2]);
    });
  });

  it('keeps only the most recent recording', () => {
    const first = query({ yearFrom: 2018 });
    const second = query({ yearFrom: 2000 });

    service.record(first, meta([WEO]));
    service.record(second, meta([WDI]));

    expect(service.idsFor(second)).toEqual([12]);
    expect(service.idsFor(first)).toEqual([]);
  });

  it('copies the refs it was handed, so a later mutation cannot reach it', () => {
    const asked = query();
    const refs: VintageRef[] = [WEO];

    service.record(asked, meta(refs));
    refs.push(WDI);

    expect(service.idsFor(asked)).toEqual([2]);
  });

  describe('metaFor', () => {
    it('reports null before any result has settled', () => {
      expect(service.metaFor(query())).toBeNull();
    });

    it('reports the whole meta for the query that produced it', () => {
      const asked = query();
      service.record(asked, meta([WEO], { totalCount: 143 }));

      expect(service.metaFor(asked)?.totalCount).toBe(143);
      expect(service.metaFor(asked)?.attribution.length).toBe(1);
    });

    it('refuses the meta once the query has changed, exactly as idsFor does', () => {
      // The row count on the Export card is a claim about a specific query.
      // Reporting the previous result's total would be the same lie as
      // reporting its vintage ids.
      service.record(query({ yearFrom: 2018 }), meta([WEO], { totalCount: 143 }));

      expect(service.metaFor(query({ yearFrom: 2000 }))).toBeNull();
    });

    it('copies the meta it was handed, so a later mutation cannot reach it', () => {
      const asked = query();
      const handed = meta([WEO]);

      service.record(asked, handed);
      handed.vintages.push(WDI);
      handed.totalCount = 9999;

      expect(service.metaFor(asked)?.vintages.length).toBe(1);
      expect(service.metaFor(asked)?.totalCount).toBe(56);
    });
  });
});
