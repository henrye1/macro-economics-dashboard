import { FIXTURE_INDICATORS, FIXTURE_VINTAGES } from './macro-fixtures';
import {
  FIXTURE_OBSERVATIONS,
  FIXTURE_OBSERVATION_VINTAGE_IDS,
  isCoverageGap
} from './observation-fixtures';

/**
 * These fixtures back every observation spec in the console, so the properties
 * asserted here are the ones the rest of the suite is allowed to rely on.
 */
describe('observation fixtures', () => {
  const rowsFor = (indicator: string, country: string, vintageId?: number) =>
    FIXTURE_OBSERVATIONS.filter(
      (row) =>
        row.indicator === indicator &&
        row.country === country &&
        (vintageId === undefined || row.vintageId === vintageId)
    );

  it('is not empty', () => {
    expect(FIXTURE_OBSERVATIONS.length).toBeGreaterThan(0);
  });

  it('is deterministic, so specs built on these numbers cannot flake', () => {
    // The module is generated once at load, so the strongest available check is
    // that no value carries more precision than the generator produces and that
    // repeated reads of the same cell agree.
    const first = rowsFor('GDP_GROWTH_REAL', 'ZAF', 14);
    const second = rowsFor('GDP_GROWTH_REAL', 'ZAF', 14);

    expect(first.length).toBeGreaterThan(0);
    expect(second).toEqual(first);

    for (const row of first) {
      expect(row.value).toBe(Math.round(row.value * 10) / 10);
    }
  });

  it('reports WEO history to 2025 and forecasts to 2031 in the latest vintage', () => {
    const rows = rowsFor('GDP_GROWTH_REAL', 'ZAF', 14);
    const years = rows.map((row) => row.year);

    expect(Math.min(...years)).toBe(2010);
    expect(Math.max(...years)).toBe(2031);

    for (const row of rows) {
      expect(row.isForecast).toBe(row.year > 2025);
      expect(row.source).toBe('IMF_WEO');
    }
  });

  it('moves the actual and forecast boundary earlier in an older WEO vintage', () => {
    const rows = rowsFor('GDP_GROWTH_REAL', 'ZAF', 12);
    const years = rows.map((row) => row.year);

    expect(Math.max(...years)).toBe(2030);

    for (const row of rows) {
      expect(row.isForecast).toBe(row.year > 2024);
    }
  });

  it('never marks a WDI row as a forecast, because WDI publishes history only', () => {
    const wdi = FIXTURE_OBSERVATIONS.filter((row) => row.source === 'WB_WDI');

    expect(wdi.length).toBeGreaterThan(0);
    expect(wdi.every((row) => !row.isForecast)).toBeTrue();
    expect(Math.max(...wdi.map((row) => row.year))).toBe(2024);
  });

  it('gives an older vintage different values for the same cell', () => {
    const latest = rowsFor('CPI_INFLATION_AVG', 'ZAF', 14).filter((row) => row.year === 2020);
    const older = rowsFor('CPI_INFLATION_AVG', 'ZAF', 12).filter((row) => row.year === 2020);

    expect(latest.length).toBe(1);
    expect(older.length).toBe(1);
    expect(older[0]?.value).not.toBe(latest[0]?.value);
  });

  it('reports nothing at all for a coverage gap, so absence is reachable', () => {
    expect(isCoverageGap('REER_INDEX', 'NAM')).toBeTrue();
    expect(rowsFor('REER_INDEX', 'NAM').length).toBe(0);

    // The same indicator is reported elsewhere: the gap is the pair, not the code.
    expect(rowsFor('REER_INDEX', 'ZAF').length).toBeGreaterThan(0);
  });

  it('only emits rows for sources the indicator is registered against', () => {
    const registered = new Map(
      FIXTURE_INDICATORS.map((indicator) => [
        indicator.code,
        new Set(indicator.sources.map((entry) => entry.source))
      ])
    );

    for (const row of FIXTURE_OBSERVATIONS) {
      expect(registered.get(row.indicator)?.has(row.source)).toBeTrue();
    }
  });

  it('only references vintage ids that exist', () => {
    const known = new Set(FIXTURE_VINTAGES.map((vintage) => vintage.id));
    const used = new Set(FIXTURE_OBSERVATIONS.map((row) => row.vintageId));

    for (const id of used) {
      expect(known.has(id)).toBeTrue();
    }

    expect([...used].sort()).toEqual([...FIXTURE_OBSERVATION_VINTAGE_IDS].sort());
  });

  it('matches the design: 2 indicators x 2 countries over 2018-2031 is 56 rows', () => {
    const rows = FIXTURE_OBSERVATIONS.filter(
      (row) =>
        row.vintageId === 14 &&
        ['GDP_GROWTH_REAL', 'CPI_INFLATION_AVG'].includes(row.indicator) &&
        ['ZAF', 'NAM'].includes(row.country) &&
        row.year >= 2018 &&
        row.year <= 2031
    );

    expect(rows.length).toBe(56);
  });
});
