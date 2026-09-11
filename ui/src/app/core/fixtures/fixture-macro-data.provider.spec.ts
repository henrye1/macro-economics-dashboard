import { type Observable, firstValueFrom } from 'rxjs';

import type { Envelope } from '../macro-contracts';
import {
  FIXTURE_ATTRIBUTION,
  FIXTURE_COUNTRIES,
  FIXTURE_INDICATORS,
  FIXTURE_VINTAGES,
  FIXTURE_VINTAGE_REFS
} from './macro-fixtures';
import {
  FixtureMacroDataProvider,
  filterIndicators,
  filterObservations,
  groupIntoSeries,
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
    // `page` is null on this route, not 1: reconciled against the live service
    // at feature 8, where `/countries` is unpaginated. Per-route meta has its
    // own describe block below.
    expect(envelope.meta.page).toBeNull();
    expect(envelope.meta.totalCount).toBe(FIXTURE_COUNTRIES.length);
    expect(envelope.meta.attribution).toEqual([...FIXTURE_ATTRIBUTION]);
  });

  it('reports the latest vintage per source in meta.vintages', async () => {
    // Asked of `/countries`, not `/vintages`. The vintages route reports no
    // provenance of its own, because its result IS the vintage list; the
    // country list is genuinely derived from both latest vintages.
    const envelope = await firstValueFrom(provider.countries());
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

describe('groupIntoSeries', () => {
  /** The same query feature 5 uses: 56 observation rows, grouped into 4 series. */
  const designQuery: ObsQuery = {
    indicators: ['GDP_GROWTH_REAL', 'CPI_INFLATION_AVG'],
    countries: ['ZAF', 'NAM'],
    yearFrom: 2018,
    yearTo: 2031
  };

  const run = (overrides: Partial<ObsQuery> = {}) =>
    groupIntoSeries(FIXTURE_OBSERVATIONS, { ...designQuery, ...overrides });

  it('groups the same rows the observations route returns', () => {
    const rows = filterObservations(FIXTURE_OBSERVATIONS, designQuery);
    const series = run();

    expect(rows.length).toBe(56);
    expect(series.length).toBe(4);
    expect(series.reduce((total, entry) => total + entry.points.length, 0)).toBe(56);
  });

  it('orders series by indicator, then country', () => {
    expect(run().map((entry) => `${entry.indicator}/${entry.country}`)).toEqual([
      'CPI_INFLATION_AVG/NAM',
      'CPI_INFLATION_AVG/ZAF',
      'GDP_GROWTH_REAL/NAM',
      'GDP_GROWTH_REAL/ZAF'
    ]);
  });

  it('takes name and unit from the catalogue, not from the rows', () => {
    const series = run()[0];

    expect(series?.indicator).toBe('CPI_INFLATION_AVG');
    expect(series?.name).toBe('Inflation, average CPI');
    expect(series?.unit).toBe('Percent');
  });

  it('reports the vintage label, not the id', () => {
    const series = run()[0];

    expect(series?.vintage).toBe('WEO 10.0.0 2026-04-14');
    expect(series?.source).toBe('IMF_WEO');
  });

  it('carries points year-ascending, matching the underlying rows exactly', () => {
    const series = run().find((entry) => entry.country === 'ZAF' && entry.indicator === 'GDP_GROWTH_REAL');
    const rows = filterObservations(FIXTURE_OBSERVATIONS, {
      ...designQuery,
      indicators: ['GDP_GROWTH_REAL'],
      countries: ['ZAF']
    });

    expect(series?.points.map((point) => point.year)).toEqual(rows.map((row) => row.year));
    expect(series?.points.map((point) => point.value)).toEqual(rows.map((row) => row.value));
    expect(series?.points.map((point) => point.isForecast)).toEqual(
      rows.map((row) => row.isForecast)
    );
  });

  it('splits history from forecast at lastActualYear', () => {
    const series = run()[0];

    expect(series?.lastActualYear).toBe(2025);

    for (const point of series?.points ?? []) {
      expect(point.isForecast).toBe(point.year > 2025);
    }
  });

  it('keeps lastActualYear fixed when the year range hides the boundary', () => {
    // Forecast-only window: every visible point is a forecast, and the boundary
    // still reports 2025 rather than sliding to the newest visible year.
    const series = run({ yearFrom: 2027, yearTo: 2031 })[0];

    expect(series?.lastActualYear).toBe(2025);
    expect(series?.points.map((point) => point.year)).toEqual([2027, 2028, 2029, 2030, 2031]);
    expect(series?.points.every((point) => point.isForecast)).toBeTrue();
  });

  it('keeps lastActualYear fixed when the forecast filter hides the boundary', () => {
    const actualOnly = run({ forecast: 'actual' })[0];

    expect(actualOnly?.lastActualYear).toBe(2025);
    expect(actualOnly?.points.every((point) => !point.isForecast)).toBeTrue();
  });

  it('moves lastActualYear when a genuinely older vintage is pinned', () => {
    const series = run({ vintage: 12 })[0];

    expect(series?.lastActualYear).toBe(2024);
    expect(series?.vintage).toBe('WEO 9.0.0 2025-10-08');
  });

  it('reports the WDI boundary for a WDI-only indicator', () => {
    const series = groupIntoSeries(FIXTURE_OBSERVATIONS, {
      indicators: ['LENDING_RATE'],
      countries: ['ZAF']
    })[0];

    expect(series?.source).toBe('WB_WDI');
    expect(series?.vintage).toBe('WDI 2026-03-27');
    expect(series?.lastActualYear).toBe(2024);
    expect(series?.points.every((point) => !point.isForecast)).toBeTrue();
  });

  it('never spans more than one vintage per series', () => {
    // Belt and braces: the filter resolves one vintage per source before
    // grouping, so a mixed group would be a fixture bug. Grouping throws rather
    // than reporting a vintage the values did not all come from.
    for (const series of groupIntoSeries(FIXTURE_OBSERVATIONS, {
      indicators: ['GDP_GROWTH_REAL', 'LENDING_RATE'],
      countries: ['ZAF', 'NAM']
    })) {
      expect(series.points.length).toBeGreaterThan(0);
    }
  });

  it('returns no series for a valid query the sources do not report', () => {
    expect(groupIntoSeries(FIXTURE_OBSERVATIONS, {
      indicators: ['REER_INDEX'],
      countries: ['NAM']
    })).toEqual([]);
  });
});

describe('FixtureMacroDataProvider series paging', () => {
  const provider = new FixtureMacroDataProvider();

  const designQuery: ObsQuery = {
    indicators: ['GDP_GROWTH_REAL', 'CPI_INFLATION_AVG'],
    countries: ['ZAF', 'NAM'],
    yearFrom: 2018,
    yearTo: 2031
  };

  it('counts series, not rows', async () => {
    const envelope = await firstValueFrom(provider.series(designQuery));

    expect(envelope.data.length).toBe(4);
    expect(envelope.meta.totalCount).toBe(4);

    // The same query over /observations counts 56. Same values, different unit
    // of pagination, exactly as the guide states.
    const observations = await firstValueFrom(provider.observations(designQuery));
    expect(observations.meta.totalCount).toBe(56);
  });

  it('pages series', async () => {
    const envelope = await firstValueFrom(
      provider.series({ ...designQuery, pageSize: 2, page: 2 })
    );

    expect(envelope.meta.page).toBe(2);
    expect(envelope.meta.pageSize).toBe(2);
    expect(envelope.meta.totalCount).toBe(4);
    expect(envelope.data.map((entry) => `${entry.indicator}/${entry.country}`)).toEqual([
      'GDP_GROWTH_REAL/NAM',
      'GDP_GROWTH_REAL/ZAF'
    ]);
  });

  it('reports the vintages behind the whole result', async () => {
    const envelope = await firstValueFrom(provider.series(designQuery));

    expect(envelope.meta.vintages.map((ref) => ref.id)).toEqual([14]);
  });

  it('returns empty data and no vintages for a coverage gap', async () => {
    const envelope = await firstValueFrom(
      provider.series({ indicators: ['REER_INDEX'], countries: ['NAM'] })
    );

    expect(envelope.data).toEqual([]);
    expect(envelope.meta.totalCount).toBe(0);
    expect(envelope.meta.vintages).toEqual([]);
    expect(envelope.meta.attribution.length).toBe(2);
  });
});

/**
 * Feature 8 (F-09, F-12): the double must model the meta shape the live service
 * actually sends, per route.
 *
 * This is the divergence that hid the header-strip bug: every fixture-backed
 * spec passed while the real `/vintages` answered `meta.vintages: []` and the
 * strip rendered blank. `blueprint/context/current-feature.md` commits features
 * 9 to 13 to this double, so a wrong shape here is a trap they inherit.
 */
describe('FixtureMacroDataProvider observed meta shape', () => {
  let provider: FixtureMacroDataProvider;

  beforeEach(() => {
    provider = new FixtureMacroDataProvider();
  });

  function metaOf<T>(source: Observable<Envelope<T>>): Envelope<T>['meta'] {
    let meta: Envelope<T>['meta'] | undefined;
    source.subscribe((envelope) => {
      meta = envelope.meta;
    });
    if (meta === undefined) {
      throw new Error('the fixture provider did not emit synchronously');
    }
    return meta;
  }

  it('reports /countries as unpaginated but vintage-derived', () => {
    const meta = metaOf(provider.countries());

    expect(meta.page).toBeNull();
    expect(meta.pageSize).toBeNull();
    expect(meta.totalCount).toBe(FIXTURE_COUNTRIES.length);
    // The country list IS derived from both latest vintages, so unlike
    // /vintages it does report provenance.
    expect(meta.vintages.length).toBeGreaterThan(0);
  });

  it('reports /vintages as unpaginated with no provenance of its own', () => {
    const meta = metaOf(provider.vintages());

    expect(meta.page).toBeNull();
    expect(meta.pageSize).toBeNull();
    // This route's result IS the vintage list; `meta.vintages` is empty.
    expect(meta.vintages).toEqual([]);
  });

  it('reports /indicators as paginated with no provenance', () => {
    const meta = metaOf(provider.indicators());

    expect(meta.page).toBe(1);
    expect(typeof meta.pageSize).toBe('number');
    // The catalogue is not vintage-derived.
    expect(meta.vintages).toEqual([]);
  });

  it('keeps /observations and /series paginated with real provenance', () => {
    for (const meta of [
      metaOf(provider.observations({ indicators: ['GDP_GROWTH_REAL'] })),
      metaOf(provider.series({ indicators: ['GDP_GROWTH_REAL'] }))
    ]) {
      expect(typeof meta.page).toBe('number');
      expect(typeof meta.pageSize).toBe('number');
      expect(meta.vintages.length).toBeGreaterThan(0);
    }
  });

  it('reports only the asked-about vintage as the provenance of its revisions', () => {
    const latest = FIXTURE_VINTAGE_REFS[0];
    const meta = metaOf(provider.revisions(latest.id));

    expect(meta.vintages.map((ref) => ref.id)).toEqual([latest.id]);
  });

  it('reports a superseded vintage too, which is every real revisions query', () => {
    // The live probe behind this reconciliation was `/vintages/12/revisions`.
    // Resolving only the latest refs reported nothing for exactly the inputs
    // this route exists to serve.
    const historical = FIXTURE_VINTAGES.find((vintage) => !vintage.isLatest);
    if (historical === undefined) {
      throw new Error('fixtures carry no superseded vintage to test with');
    }

    const meta = metaOf(provider.revisions(historical.id));

    expect(meta.vintages.map((ref) => ref.id)).toEqual([historical.id]);
    expect(meta.vintages[0].label).toBe(historical.label);
  });

  it('emits no provenance for a vintage id that does not exist', () => {
    const meta = metaOf(provider.revisions(-1));

    expect(meta.vintages).toEqual([]);
  });

  it('carries retrievedAtUtc in the observed wire format, with no zone designator', () => {
    // Observed live: "2026-09-08T01:00:31.5083586". A `Z` here would let a
    // consumer parse it correctly in tests and wrongly in production.
    for (const vintage of FIXTURE_VINTAGES) {
      expect(vintage.retrievedAtUtc)
        .withContext(`vintage ${vintage.id}`)
        .toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+$/);
    }
  });
});
