import { firstValueFrom } from 'rxjs';

import {
  FIXTURE_ATTRIBUTION,
  FIXTURE_COUNTRIES,
  FIXTURE_INDICATORS,
  FIXTURE_VINTAGES
} from './macro-fixtures';
import {
  FixtureMacroDataProvider,
  filterIndicators,
  filterObservations,
  vintageRefsFor
} from './fixture-macro-data.provider';
import { FIXTURE_OBSERVATIONS } from './observation-fixtures';

describe('FixtureMacroDataProvider', () => {
  let provider: FixtureMacroDataProvider;

  beforeEach(() => {
    provider = new FixtureMacroDataProvider();
  });

  it('wraps every response in the envelope shape', async () => {
    const envelope = await firstValueFrom(provider.countries());

    expect(envelope.data.length).toBe(FIXTURE_COUNTRIES.length);
    expect(envelope.meta.page).toBe(1);
    expect(envelope.meta.totalCount).toBe(FIXTURE_COUNTRIES.length);
    expect(envelope.meta.attribution).toEqual([...FIXTURE_ATTRIBUTION]);
  });

  it('reports the latest vintage per source in meta.vintages', async () => {
    const envelope = await firstValueFrom(provider.vintages());
    const refs = envelope.meta.vintages;

    expect(refs.length).toBe(2);
    expect(refs.map((ref) => ref.source).sort()).toEqual(['IMF_WEO', 'WB_WDI']);
    expect(refs.every((ref) => Number.isInteger(ref.id))).toBeTrue();
  });

  it('returns every published vintage, newest first, from the vintages route', async () => {
    const envelope = await firstValueFrom(provider.vintages());

    expect(envelope.data.length).toBe(FIXTURE_VINTAGES.length);
    expect(envelope.data[0].id).toBe(14);
    expect(envelope.data.filter((vintage) => vintage.isLatest).length).toBe(2);
  });

  it('returns the curated indicator catalogue', async () => {
    const envelope = await firstValueFrom(provider.indicators());

    expect(envelope.data.length).toBe(FIXTURE_INDICATORS.length);
    expect(envelope.data.every((indicator) => indicator.unit.length > 0)).toBeTrue();
    expect(envelope.data.map((indicator) => indicator.code)).toContain('GDP_GROWTH_REAL');
  });

  it('returns an empty data array, not an error, for a valid query with no data', async () => {
    // REER_INDEX and NAM are both real codes; the sources just do not report
    // the pair. That is a 200 with empty data, never an error.
    const envelope = await firstValueFrom(
      provider.observations({ indicators: ['REER_INDEX'], countries: ['NAM'] })
    );

    expect(envelope.data).toEqual([]);
    expect(envelope.meta.totalCount).toBe(0);
    expect(envelope.meta.attribution.length).toBe(2);
  });

  describe('indicator filters', () => {
    async function codes(query?: Parameters<FixtureMacroDataProvider['indicators']>[0]) {
      const envelope = await firstValueFrom(provider.indicators(query));
      return envelope.data.map((indicator) => indicator.code);
    }

    it('returns the curated set by default', async () => {
      expect((await codes()).length).toBe(FIXTURE_INDICATORS.length);
    });

    it('filters by exact category', async () => {
      expect(await codes({ category: 'fiscal' }))
        .toEqual(['GOVT_DEBT_GDP', 'FISCAL_BALANCE_GDP']);
    });

    it('returns nothing for an unknown category rather than everything', async () => {
      expect(await codes({ category: 'nope' })).toEqual([]);
    });

    it('filters by source when any source entry matches', async () => {
      const wdiOnly = await codes({ source: 'WB_WDI' });

      expect(wdiOnly).toContain('REAL_INTEREST_RATE');
      expect(wdiOnly).toContain('GDP_GROWTH_REAL');
      expect(wdiOnly).not.toContain('GOVT_DEBT_GDP');
    });

    it('matches q against the code, case-insensitively', async () => {
      expect(await codes({ q: 'gdp_growth' })).toEqual(['GDP_GROWTH_REAL']);
    });

    it('matches q against the name too', async () => {
      expect(await codes({ q: 'unemployment' })).toEqual(['UNEMPLOYMENT_RATE']);
    });

    it('ignores surrounding whitespace in q', async () => {
      expect(await codes({ q: '  reer  ' })).toEqual(['REER_INDEX']);
    });

    it('returns an empty list for a term that matches nothing', async () => {
      expect(await codes({ q: 'zzzz' })).toEqual([]);
    });

    it('combines filters with AND', async () => {
      expect(await codes({ category: 'monetary', source: 'WB_WDI', q: 'rate' }))
        .toEqual(['REAL_INTEREST_RATE', 'LENDING_RATE']);
    });

    it('reports the filtered total in meta, not the unfiltered one', async () => {
      const envelope = await firstValueFrom(provider.indicators({ category: 'fiscal' }));

      expect(envelope.meta.totalCount).toBe(2);
      expect(envelope.data.length).toBe(2);
    });

    it('curated false still returns the fixtures, which are all curated', async () => {
      expect((await codes({ curated: false })).length).toBe(FIXTURE_INDICATORS.length);
    });

    it('excludes a non-curated entry when curated is on', () => {
      const nonCurated = { ...FIXTURE_INDICATORS[0], code: 'WEO_NGAP_NPGDP', curated: false };

      expect(filterIndicators([nonCurated]).length).toBe(0);
      expect(filterIndicators([nonCurated], { curated: false }).length).toBe(1);
    });
  });

  it('does not hand out the shared fixture arrays', async () => {
    const first = await firstValueFrom(provider.countries());
    first.data.pop();

    const second = await firstValueFrom(provider.countries());

    expect(second.data.length).toBe(FIXTURE_COUNTRIES.length);
  });
});

type ObsQuery = Parameters<typeof filterObservations>[1];

describe('filterObservations', () => {
  const query = (overrides: Partial<ObsQuery> = {}): ObsQuery => ({
    indicators: ['GDP_GROWTH_REAL'],
    ...overrides
  });

  const run = (overrides: Partial<ObsQuery> = {}) =>
    filterObservations(FIXTURE_OBSERVATIONS, query(overrides));

  it('returns nothing for an empty indicator list rather than everything', () => {
    expect(filterObservations(FIXTURE_OBSERVATIONS, { indicators: [] })).toEqual([]);
  });

  it('returns only the requested indicators', () => {
    const codes = new Set(
      run({ indicators: ['GDP_GROWTH_REAL', 'CPI_INFLATION_AVG'] }).map((row) => row.indicator)
    );

    expect([...codes].sort()).toEqual(['CPI_INFLATION_AVG', 'GDP_GROWTH_REAL']);
  });

  it('defaults to every country and narrows when countries are given', () => {
    const all = new Set(run().map((row) => row.country));
    const two = new Set(run({ countries: ['ZAF', 'NAM'] }).map((row) => row.country));

    expect(all.size).toBe(FIXTURE_COUNTRIES.length);
    expect([...two].sort()).toEqual(['NAM', 'ZAF']);
  });

  it('treats the year range as inclusive on both ends', () => {
    const years = run({ countries: ['ZAF'], yearFrom: 2018, yearTo: 2020 }).map((row) => row.year);

    expect(years).toEqual([2018, 2019, 2020]);
  });

  it('only returns the latest vintage per source by default', () => {
    const ids = new Set(run({ countries: ['ZAF'], source: 'WB_WDI' }).map((row) => row.vintageId));

    expect([...ids]).toEqual([13]);
  });

  it('resolves source=preferred to the WEO row where both sources report', () => {
    const rows = run({ countries: ['ZAF'], yearFrom: 2015, yearTo: 2015 });

    expect(rows.length).toBe(1);
    expect(rows[0]?.source).toBe('IMF_WEO');
  });

  it('falls back to WDI under preferred where only WDI reports', () => {
    const rows = run({
      indicators: ['LENDING_RATE'],
      countries: ['ZAF'],
      yearFrom: 2015,
      yearTo: 2015
    });

    expect(rows.length).toBe(1);
    expect(rows[0]?.source).toBe('WB_WDI');
  });

  it('filters by an explicit source', () => {
    const rows = run({ countries: ['ZAF'], source: 'WB_WDI' });

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.source === 'WB_WDI')).toBeTrue();
  });

  it('splits actual from forecast', () => {
    const actual = run({ countries: ['ZAF'], forecast: 'actual' });
    const forecast = run({ countries: ['ZAF'], forecast: 'forecast' });

    expect(actual.length).toBeGreaterThan(0);
    expect(forecast.length).toBeGreaterThan(0);
    expect(actual.every((row) => !row.isForecast)).toBeTrue();
    expect(forecast.every((row) => row.isForecast)).toBeTrue();
  });

  it('pins a vintage by id, and the pin overrides the source default', () => {
    const rows = run({ countries: ['ZAF'], vintage: 12 });

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.vintageId === 12)).toBeTrue();
  });

  it('pins a vintage by label too', () => {
    const rows = run({ countries: ['ZAF'], vintage: 'WEO 9.0.0 2025-10-08' });

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.vintageId === 12)).toBeTrue();
  });

  it('returns different values for a pinned older vintage than for latest', () => {
    const cell: Partial<ObsQuery> = { countries: ['ZAF'], yearFrom: 2020, yearTo: 2020 };
    const latest = run(cell);
    const older = run({ ...cell, vintage: 12 });

    expect(latest.length).toBe(1);
    expect(older.length).toBe(1);
    expect(older[0]?.value).not.toBe(latest[0]?.value);
  });

  it('matches nothing for an unknown vintage rather than falling back to latest', () => {
    expect(run({ vintage: 9999 })).toEqual([]);
  });

  it('orders by indicator, then country, then year, all ascending', () => {
    const rows = run({
      indicators: ['GDP_GROWTH_REAL', 'CPI_INFLATION_AVG'],
      countries: ['ZAF', 'NAM'],
      yearFrom: 2018,
      yearTo: 2031
    });

    const keys = rows.map((row) => `${row.indicator}|${row.country}|${row.year}`);

    expect(keys).toEqual([...keys].sort());
    expect(rows[0]?.indicator).toBe('CPI_INFLATION_AVG');
    expect(rows[0]?.country).toBe('NAM');
    expect(rows[0]?.year).toBe(2018);
  });
});

describe('vintageRefsFor', () => {
  it('reports the vintages the rows actually came from, newest first', () => {
    const rows = filterObservations(FIXTURE_OBSERVATIONS, {
      indicators: ['GDP_GROWTH_REAL', 'LENDING_RATE'],
      countries: ['ZAF']
    });

    expect(vintageRefsFor(rows).map((ref) => ref.id)).toEqual([14, 13]);
  });

  it('reports no vintages for an empty result', () => {
    expect(vintageRefsFor([])).toEqual([]);
  });
});

describe('FixtureMacroDataProvider observations paging', () => {
  const provider = new FixtureMacroDataProvider();

  /** The design query: 2 indicators over 2 countries and 2018-2031 is 56 rows. */
  const designQuery: ObsQuery = {
    indicators: ['GDP_GROWTH_REAL', 'CPI_INFLATION_AVG'],
    countries: ['ZAF', 'NAM'],
    yearFrom: 2018,
    yearTo: 2031,
    pageSize: 25
  };

  it('returns the first page with an honest total', async () => {
    const envelope = await firstValueFrom(provider.observations(designQuery));

    expect(envelope.data.length).toBe(25);
    expect(envelope.meta.page).toBe(1);
    expect(envelope.meta.pageSize).toBe(25);
    expect(envelope.meta.totalCount).toBe(56);
  });

  it('returns rows 26 to 50 on page 2 without changing the total', async () => {
    const all = filterObservations(FIXTURE_OBSERVATIONS, designQuery);
    const envelope = await firstValueFrom(provider.observations({ ...designQuery, page: 2 }));

    expect(envelope.data).toEqual(all.slice(25, 50));
    expect(envelope.meta.page).toBe(2);
    expect(envelope.meta.totalCount).toBe(56);
  });

  it('returns the short final page', async () => {
    const envelope = await firstValueFrom(provider.observations({ ...designQuery, page: 3 }));

    expect(envelope.data.length).toBe(6);
    expect(envelope.meta.totalCount).toBe(56);
  });

  it('returns no rows past the end, still with the real total', async () => {
    const envelope = await firstValueFrom(provider.observations({ ...designQuery, page: 9 }));

    expect(envelope.data).toEqual([]);
    expect(envelope.meta.totalCount).toBe(56);
  });

  it('reports meta.vintages for the whole result, not just the page', async () => {
    const envelope = await firstValueFrom(provider.observations(designQuery));

    expect(envelope.meta.vintages.map((ref) => ref.id)).toEqual([14]);
    expect(envelope.meta.vintages[0]?.label).toBe('WEO 10.0.0 2026-04-14');
  });

  it('reports no vintages when the result is empty', async () => {
    const envelope = await firstValueFrom(
      provider.observations({ indicators: ['REER_INDEX'], countries: ['NAM'] })
    );

    expect(envelope.data).toEqual([]);
    expect(envelope.meta.vintages).toEqual([]);
  });

  it('still names every published vintage on the vintages route', async () => {
    const envelope = await firstValueFrom(provider.vintages());

    expect(envelope.data.length).toBe(FIXTURE_VINTAGES.length);
  });
});
