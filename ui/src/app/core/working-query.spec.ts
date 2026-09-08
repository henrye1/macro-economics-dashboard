import {
  DEFAULT_WORKING_QUERY,
  hasPinnedVintage,
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
