import {
  DEFAULT_WORKING_QUERY,
  hasPinnedVintage,
  sameWorkingQuery,
  toObservationsQuery,
  validateWorkingQuery,
  type WorkingQuery
} from './working-query';

function query(overrides: Partial<WorkingQuery> = {}): WorkingQuery {
  return { ...DEFAULT_WORKING_QUERY, ...overrides };
}

describe('DEFAULT_WORKING_QUERY', () => {
  it('uses the console page size of 25, not the API default of 500', () => {
    expect(DEFAULT_WORKING_QUERY.pageSize).toBe(25);
  });

  it('starts empty, unbounded and tracking the latest vintage', () => {
    expect(DEFAULT_WORKING_QUERY).toEqual({
      indicators: [],
      countries: [],
      yearFrom: null,
      yearTo: null,
      source: 'preferred',
      forecast: 'all',
      vintage: 'latest',
      page: 1,
      pageSize: 25
    });
  });
});

describe('validateWorkingQuery', () => {
  it('rejects a query with no indicators', () => {
    const result = validateWorkingQuery(query());

    expect(result.valid).toBeFalse();
    expect(result.problems).toContain('no-indicators');
  });

  it('rejects an inverted year range', () => {
    const result = validateWorkingQuery(
      query({ indicators: ['GDP_GROWTH_REAL'], yearFrom: 2030, yearTo: 2020 })
    );

    expect(result.valid).toBeFalse();
    expect(result.problems).toEqual(['inverted-year-range']);
  });

  it('accepts equal year bounds, since the range is inclusive', () => {
    const result = validateWorkingQuery(
      query({ indicators: ['GDP_GROWTH_REAL'], yearFrom: 2024, yearTo: 2024 })
    );

    expect(result.valid).toBeTrue();
  });

  it('ignores the range when only one bound is set', () => {
    expect(
      validateWorkingQuery(query({ indicators: ['X'], yearFrom: 2030, yearTo: null })).valid
    ).toBeTrue();
    expect(
      validateWorkingQuery(query({ indicators: ['X'], yearFrom: null, yearTo: 1990 })).valid
    ).toBeTrue();
  });

  it('reports both problems at once', () => {
    const result = validateWorkingQuery(query({ yearFrom: 2030, yearTo: 2020 }));

    expect(result.problems.length).toBe(2);
  });
});

describe('hasPinnedVintage', () => {
  it('is false for latest and true for an id or a label', () => {
    expect(hasPinnedVintage(query())).toBeFalse();
    expect(hasPinnedVintage(query({ vintage: 12 }))).toBeTrue();
    expect(hasPinnedVintage(query({ vintage: 'WEO 9.0.0 2025-10-08' }))).toBeTrue();
  });
});

describe('toObservationsQuery', () => {
  it('sends only indicators and pageSize for a default query', () => {
    const result = toObservationsQuery(query({ indicators: ['GDP_GROWTH_REAL'] }));

    expect(result).toEqual({ indicators: ['GDP_GROWTH_REAL'], pageSize: 25 });
  });

  it('omits countries when empty and sends them when set', () => {
    expect(toObservationsQuery(query({ indicators: ['X'] })).countries).toBeUndefined();
    expect(
      toObservationsQuery(query({ indicators: ['X'], countries: ['ZAF', 'NAM'] })).countries
    ).toEqual(['ZAF', 'NAM']);
  });

  it('omits null year bounds and sends the ones that are set', () => {
    const result = toObservationsQuery(
      query({ indicators: ['X'], yearFrom: 2018, yearTo: null })
    );

    expect(result.yearFrom).toBe(2018);
    expect(result.yearTo).toBeUndefined();
  });

  it('omits source when preferred and sends an explicit source', () => {
    expect(toObservationsQuery(query({ indicators: ['X'] })).source).toBeUndefined();
    expect(
      toObservationsQuery(query({ indicators: ['X'], source: 'WB_WDI' })).source
    ).toBe('WB_WDI');
  });

  it('omits forecast when all and sends a filtered one', () => {
    expect(toObservationsQuery(query({ indicators: ['X'] })).forecast).toBeUndefined();
    expect(
      toObservationsQuery(query({ indicators: ['X'], forecast: 'forecast' })).forecast
    ).toBe('forecast');
  });

  it('omits vintage when latest and sends a pinned one', () => {
    expect(toObservationsQuery(query({ indicators: ['X'] })).vintage).toBeUndefined();
    expect(toObservationsQuery(query({ indicators: ['X'], vintage: 12 })).vintage).toBe(12);
  });

  it('drops source when a vintage is pinned, because pinning implies the source', () => {
    const result = toObservationsQuery(
      query({ indicators: ['X'], source: 'WB_WDI', vintage: 12 })
    );

    expect(result.vintage).toBe(12);
    expect(result.source).toBeUndefined();
  });

  it('omits page 1 and sends a later page', () => {
    expect(toObservationsQuery(query({ indicators: ['X'] })).page).toBeUndefined();
    expect(toObservationsQuery(query({ indicators: ['X'], page: 3 })).page).toBe(3);
  });

  it('maps a fully populated query', () => {
    const result = toObservationsQuery({
      indicators: ['GDP_GROWTH_REAL', 'CPI_INFLATION_AVG'],
      countries: ['ZAF', 'NAM'],
      yearFrom: 2018,
      yearTo: 2031,
      source: 'IMF_WEO',
      forecast: 'actual',
      vintage: 'latest',
      page: 2,
      pageSize: 25
    });

    expect(result).toEqual({
      indicators: ['GDP_GROWTH_REAL', 'CPI_INFLATION_AVG'],
      countries: ['ZAF', 'NAM'],
      yearFrom: 2018,
      yearTo: 2031,
      source: 'IMF_WEO',
      forecast: 'actual',
      page: 2,
      pageSize: 25
    });
  });

  it('copies the arrays so a later edit cannot mutate a built query', () => {
    const source = query({ indicators: ['X'], countries: ['ZAF'] });
    const result = toObservationsQuery(source);

    result.indicators.push('Y');
    result.countries?.push('NAM');

    expect(source.indicators).toEqual(['X']);
    expect(source.countries).toEqual(['ZAF']);
  });
});

/**
 * F-22: the equality that lets the store refuse a mutation changing nothing.
 *
 * The per-field cases are the important half. An over-eager comparison that
 * swallows a genuine mutation is far worse than the wasted request it replaces,
 * so every field of `WorkingQuery` gets a case proving a real difference is
 * still detected.
 */
describe('sameWorkingQuery', () => {
  /** A fully populated query, so no field is compared against a default. */
  const base: WorkingQuery = {
    indicators: ['GDP_GROWTH_REAL', 'CPI_INFLATION_AVG'],
    countries: ['ZAF', 'NAM'],
    yearFrom: 2018,
    yearTo: 2031,
    source: 'IMF_WEO',
    forecast: 'forecast',
    vintage: 12,
    page: 3,
    pageSize: 50
  };

  it('matches a query against itself', () => {
    expect(sameWorkingQuery(base, base)).toBeTrue();
  });

  it('matches a structurally equal query built from different objects', () => {
    const rebuilt: WorkingQuery = {
      ...base,
      indicators: [...base.indicators],
      countries: [...base.countries]
    };

    expect(rebuilt).not.toBe(base);
    expect(rebuilt.indicators).not.toBe(base.indicators);
    expect(sameWorkingQuery(base, rebuilt)).toBeTrue();
  });

  it('matches the default query against a fresh copy of itself', () => {
    expect(sameWorkingQuery(DEFAULT_WORKING_QUERY, { ...DEFAULT_WORKING_QUERY })).toBeTrue();
  });

  describe('detects a difference in each field', () => {
    const cases: readonly [string, Partial<WorkingQuery>][] = [
      ['indicators added', { indicators: ['GDP_GROWTH_REAL', 'CPI_INFLATION_AVG', 'UNEMP'] }],
      ['indicators removed', { indicators: ['GDP_GROWTH_REAL'] }],
      ['countries', { countries: ['ZAF'] }],
      ['yearFrom', { yearFrom: 2019 }],
      ['yearFrom cleared', { yearFrom: null }],
      ['yearTo', { yearTo: 2030 }],
      ['source', { source: 'WB_WDI' }],
      ['forecast', { forecast: 'actual' }],
      ['vintage', { vintage: 'latest' }],
      ['page', { page: 4 }],
      ['pageSize', { pageSize: 25 }]
    ];

    for (const [label, change] of cases) {
      it(label, () => {
        expect(sameWorkingQuery(base, { ...base, ...change }))
          .withContext(label)
          .toBeFalse();
      });
    }
  });

  it('treats a reordered array as a different query', () => {
    // Order reaches the wire: `indicators=A,B` and `indicators=B,A` are
    // different request strings, so they are different queries even though
    // they are the same set.
    const reordered: WorkingQuery = {
      ...base,
      indicators: ['CPI_INFLATION_AVG', 'GDP_GROWTH_REAL']
    };

    expect(sameWorkingQuery(base, reordered)).toBeFalse();
  });

  it('does not confuse an empty array with a populated one', () => {
    expect(sameWorkingQuery(base, { ...base, countries: [] })).toBeFalse();
  });

  it('is symmetric', () => {
    const other: WorkingQuery = { ...base, page: 9 };

    expect(sameWorkingQuery(base, other)).toBe(sameWorkingQuery(other, base));
  });
});
