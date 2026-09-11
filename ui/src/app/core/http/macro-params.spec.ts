import { toMacroParams } from './macro-params';

describe('toMacroParams', () => {
  it('serialises the consumer guide worked example, CSV and in order', () => {
    const params = toMacroParams({
      indicators: ['GDP_GROWTH_REAL', 'CPI_INFLATION_AVG'],
      countries: ['ZAF', 'NAM'],
      yearFrom: 2020,
      yearTo: 2030
    });

    expect(params.toString()).toBe(
      'indicators=GDP_GROWTH_REAL,CPI_INFLATION_AVG&countries=ZAF,NAM&yearFrom=2020&yearTo=2030'
    );
  });

  it('emits a single-element array with no comma', () => {
    expect(toMacroParams({ indicators: ['GDP_GROWTH_REAL'] }).toString()).toBe(
      'indicators=GDP_GROWTH_REAL'
    );
  });

  it('omits an empty array entirely', () => {
    const params = toMacroParams({ indicators: ['GDP_GROWTH_REAL'], countries: [] });

    expect(params.has('countries')).toBeFalse();
    expect(params.toString()).toBe('indicators=GDP_GROWTH_REAL');
  });

  it('omits undefined and null keys', () => {
    const params = toMacroParams({
      indicators: ['GDP_GROWTH_REAL'],
      yearFrom: undefined,
      yearTo: null,
      source: undefined
    });

    expect(params.has('yearFrom')).toBeFalse();
    expect(params.has('yearTo')).toBeFalse();
    expect(params.toString()).toBe('indicators=GDP_GROWTH_REAL');
  });

  it('emits curated=false rather than an empty value', () => {
    expect(toMacroParams({ curated: false }).toString()).toBe('curated=false');
    expect(toMacroParams({ curated: true }).toString()).toBe('curated=true');
  });

  it('serialises a vintage selector as an id or as a label', () => {
    expect(toMacroParams({ vintage: 12 }).toString()).toBe('vintage=12');
    expect(toMacroParams({ vintage: 'WEO 9.0.0 2025-10-08' }).get('vintage')).toBe(
      'WEO 9.0.0 2025-10-08'
    );
  });

  it('never emits a key twice', () => {
    const params = toMacroParams({
      indicators: ['A', 'B', 'C'],
      countries: ['ZAF']
    });

    expect(params.getAll('indicators')).toEqual(['A,B,C']);
    expect(params.getAll('countries')).toEqual(['ZAF']);
    expect(params.keys()).toEqual(['indicators', 'countries']);
  });

  it('returns empty params for no query', () => {
    expect(toMacroParams().toString()).toBe('');
    expect(toMacroParams({}).toString()).toBe('');
  });

  it('stringifies numeric arrays', () => {
    expect(toMacroParams({ ids: [1, 2, 3] }).toString()).toBe('ids=1,2,3');
  });
});
