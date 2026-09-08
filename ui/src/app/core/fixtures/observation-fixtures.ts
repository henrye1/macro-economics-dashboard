import type { Observation, SourceCode } from '../macro-contracts';
import { FIXTURE_COUNTRIES, FIXTURE_INDICATORS, FIXTURE_VINTAGES } from './macro-fixtures';

/**
 * Generated observation fixtures, standing in for `/api/macro/observations`
 * until feature 8 wires the real service.
 *
 * Everything here is derived from `(indicator, country, year, vintage)` with no
 * randomness and no clock: two calls produce byte-identical values, so specs
 * built on these numbers cannot flake. The shape of the data is chosen to make
 * the console's three headline ideas demonstrable:
 *
 * - **Vintages.** Every vintage carries its own values and its own
 *   actual/forecast boundary, so pinning WEO 9.0.0 really does return different
 *   numbers than `latest`. A fixture that ignored the pin would teach the
 *   opposite of the point.
 * - **Absence, not nulls.** `COVERAGE_GAPS` lists valid (indicator, country)
 *   pairs the sources simply do not report. Querying one is a `200` with empty
 *   `data`. Do not remove a gap to make a screenshot look fuller.
 * - **Two sources that disagree.** Indicators covered by both sources get a WEO
 *   row and a WDI row for the same year, with different values, so
 *   `source=preferred` has something real to resolve.
 */

/** The console's history floor, matching the overview's "history from 2010". */
const FIRST_YEAR = 2010;

interface VintageShape {
  readonly id: number;
  readonly source: SourceCode;
  /** Last year reported as history. Later years in range are forecasts. */
  readonly lastActualYear: number;
  /** Final year the vintage reports at all. */
  readonly horizon: number;
}

/**
 * WEO publishes a forecast horizon of roughly five years past its release; WDI
 * publishes history only and lags a year. Both are read off the vintage labels
 * in `FIXTURE_VINTAGES`, so an older vintage's boundary sits genuinely earlier.
 */
const VINTAGE_SHAPES: readonly VintageShape[] = [
  { id: 14, source: 'IMF_WEO', lastActualYear: 2025, horizon: 2031 },
  { id: 12, source: 'IMF_WEO', lastActualYear: 2024, horizon: 2030 },
  { id: 9, source: 'IMF_WEO', lastActualYear: 2024, horizon: 2030 },
  { id: 13, source: 'WB_WDI', lastActualYear: 2024, horizon: 2024 },
  { id: 11, source: 'WB_WDI', lastActualYear: 2023, horizon: 2023 }
];

interface Profile {
  /** Centre of the plausible range for this indicator, in its own unit. */
  readonly base: number;
  /** How far countries and years spread around the centre. */
  readonly spread: number;
  /** Per-year drift, for indicators that trend rather than oscillate. */
  readonly trend?: number;
}

/**
 * Plausible ranges per indicator, in the indicator's own unit. Units are mixed
 * on purpose: percent, percent of GDP, US dollars and an index all appear, which
 * is exactly why the catalogue tells consumers to read `unit` rather than assume.
 */
const PROFILES: Readonly<Record<string, Profile>> = {
  GDP_GROWTH_REAL: { base: 2.4, spread: 1.9 },
  CPI_INFLATION_AVG: { base: 4.2, spread: 1.6 },
  CPI_INFLATION_EOP: { base: 4.4, spread: 1.9 },
  UNEMPLOYMENT_RATE: { base: 12.0, spread: 3.2 },
  GOVT_DEBT_GDP: { base: 62.0, spread: 9.0, trend: 1.3 },
  FISCAL_BALANCE_GDP: { base: -4.2, spread: 1.6 },
  CURRENT_ACCOUNT_GDP: { base: -2.6, spread: 2.1 },
  GDP_PER_CAPITA_USD: { base: 24000, spread: 21000, trend: 420 },
  REAL_INTEREST_RATE: { base: 3.4, spread: 1.8 },
  LENDING_RATE: { base: 9.6, spread: 2.3 },
  PRIVATE_CREDIT_GDP: { base: 48.0, spread: 12.0 },
  BROAD_MONEY_GDP: { base: 56.0, spread: 10.0 },
  REER_INDEX: { base: 100.0, spread: 7.0 }
};

/**
 * Valid (indicator, country) pairs with no data in any vintage or source.
 *
 * These are the "absence, not nulls" cases: the codes resolve, the query is
 * well-formed, and the honest answer is a `200` with an empty `data` array.
 */
const COVERAGE_GAPS: readonly string[] = [
  'REER_INDEX|NAM',
  'REER_INDEX|BWA',
  'REER_INDEX|ZMB',
  'PRIVATE_CREDIT_GDP|NAM',
  'BROAD_MONEY_GDP|NAM',
  'UNEMPLOYMENT_RATE|NGA',
  'REAL_INTEREST_RATE|IND',
  'LENDING_RATE|GBR',
  'CPI_INFLATION_EOP|MUS'
];

const GAPS = new Set(COVERAGE_GAPS);

/** True when the sources report nothing at all for this pair. */
export function isCoverageGap(indicator: string, country: string): boolean {
  return GAPS.has(`${indicator}|${country}`);
}

/** FNV-1a. Any stable string-to-integer hash would do; this one is short. */
function hash(text: string): number {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

/** A stable number in [-1, 1) for the given key. */
function wave(key: string): number {
  return (hash(key) % 2000) / 1000 - 1;
}

/** -1 or 1, stable for the given key. */
function direction(key: string): number {
  return hash(key) % 2 === 0 ? 1 : -1;
}

/**
 * How far one vintage revises a value, in the indicator's own unit.
 *
 * Floored at 0.1 so a revision always survives the fixture's one-decimal
 * rounding. A step that rounded away would make pinning an older vintage look
 * like a no-op, which is the opposite of what this console exists to show.
 */
function revisionStep(spread: number): number {
  return Math.max(0.1, round1(spread * 0.06));
}

/** Position of a vintage within its own source, newest first. */
function vintageAge(shapeId: number): number {
  const shape = VINTAGE_SHAPES.find((candidate) => candidate.id === shapeId);
  if (shape === undefined) {
    throw new Error(`No fixture shape for vintage ${shapeId}`);
  }
  return VINTAGE_SHAPES.filter((candidate) => candidate.source === shape.source).findIndex(
    (candidate) => candidate.id === shapeId
  );
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * The value for one cell of the cube.
 *
 * The country term dominates, so a country keeps a recognisable level across
 * years; the year term wobbles inside that level; the vintage term steps the
 * value away from the latest reading once per vintage of age, in a direction
 * fixed by the cell. That makes revisions cumulative and, more importantly,
 * provably different for every vintage rather than different most of the time.
 */
function valueFor(indicator: string, country: string, year: number, vintageId: number): number {
  const profile = PROFILES[indicator];
  if (profile === undefined) {
    // An indicator with no profile is a fixture bug, not a runtime condition.
    throw new Error(`No fixture profile for indicator ${indicator}`);
  }

  const level = wave(`${indicator}|${country}`) * profile.spread;
  const year0 = wave(`${indicator}|${country}|${year}`) * profile.spread * 0.35;
  const drift = (profile.trend ?? 0) * (year - FIRST_YEAR);

  const revision =
    direction(`${indicator}|${country}|${year}`) *
    revisionStep(profile.spread) *
    vintageAge(vintageId);

  return round1(profile.base + level + year0 + drift + revision);
}

function generate(): Observation[] {
  const rows: Observation[] = [];

  for (const indicator of FIXTURE_INDICATORS) {
    for (const country of FIXTURE_COUNTRIES) {
      if (isCoverageGap(indicator.code, country.iso3)) {
        continue;
      }

      // Only the sources this indicator is actually registered against.
      const sources = new Set(indicator.sources.map((entry) => entry.source));

      for (const shape of VINTAGE_SHAPES) {
        if (!sources.has(shape.source)) {
          continue;
        }

        for (let year = FIRST_YEAR; year <= shape.horizon; year += 1) {
          rows.push({
            indicator: indicator.code,
            country: country.iso3,
            year,
            value: valueFor(indicator.code, country.iso3, year, shape.id),
            isForecast: year > shape.lastActualYear,
            source: shape.source,
            vintageId: shape.id
          });
        }
      }
    }
  }

  return rows;
}

/**
 * Every observation the fixture service knows about, across all vintages.
 *
 * The provider filters this down per request; it is never returned whole.
 */
export const FIXTURE_OBSERVATIONS: readonly Observation[] = generate();

/** The vintage ids present in the fixture data, for spec assertions. */
export const FIXTURE_OBSERVATION_VINTAGE_IDS: readonly number[] = FIXTURE_VINTAGES.map(
  (vintage) => vintage.id
).filter((id) => VINTAGE_SHAPES.some((shape) => shape.id === id));
