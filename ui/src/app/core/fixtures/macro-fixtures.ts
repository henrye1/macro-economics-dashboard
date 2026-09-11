/**
 * Fixture data standing in for the Core API until feature 8 wires the real
 * service. Values match the mockups in prototypes/ and the designs in
 * blueprint/references/ so the shell can be compared against them directly.
 *
 * Countries, indicators, vintages and attribution are populated because the
 * shell renders the vintage strip and footer from them. Revisions are
 * intentionally empty here: feature 9 owns that data and extends these fixtures
 * when it needs it. An empty `data` array is a valid response, so consumers
 * must handle it regardless.
 *
 * Observations live in `observation-fixtures.ts`, which is generated from the
 * countries, indicators and vintages below. Keeping them in their own module
 * avoids an import cycle back into this one. Series are not stored at all: the
 * provider groups them out of the observations, so the two routes cannot
 * disagree about a number.
 */

import type {
  Country,
  Indicator,
  Revision,
  Vintage,
  VintageRef,
} from '../macro-contracts';

export const FIXTURE_ATTRIBUTION: readonly string[] = [
  'Source: IMF World Economic Outlook database',
  'Source: World Bank World Development Indicators (CC BY 4.0)',
];

export const FIXTURE_VINTAGES: readonly Vintage[] = [
  {
    id: 14,
    label: 'WEO 10.0.0 2026-04-14',
    source: 'IMF_WEO',
    sourceVersion: '2026-04',
    retrievedAtUtc: '2026-04-16T02:14:07.5083586',
    isLatest: true,
  },
  {
    id: 13,
    label: 'WDI 2026-03-27',
    source: 'WB_WDI',
    sourceVersion: '2026-03-27',
    retrievedAtUtc: '2026-03-29T02:11:52.4471203',
    isLatest: true,
  },
  {
    id: 12,
    label: 'WEO 9.0.0 2025-10-08',
    source: 'IMF_WEO',
    sourceVersion: '2025-10',
    retrievedAtUtc: '2025-10-09T02:12:44.1180922',
    isLatest: false,
  },
  {
    id: 11,
    label: 'WDI 2025-09-19',
    source: 'WB_WDI',
    sourceVersion: '2025-09-19',
    retrievedAtUtc: '2025-09-21T02:10:38.9052614',
    isLatest: false,
  },
  {
    id: 9,
    label: 'WEO 8.0.0 2025-04-15',
    source: 'IMF_WEO',
    sourceVersion: '2025-04',
    retrievedAtUtc: '2025-04-17T02:13:19.3341097',
    isLatest: false,
  },
];

/** The `meta.vintages` refs a live query would carry: the latest per source. */
export const FIXTURE_VINTAGE_REFS: readonly VintageRef[] = FIXTURE_VINTAGES.filter(
  (vintage) => vintage.isLatest,
).map(({ id, source, label }) => ({ id, source, label }));

const BOTH_SOURCES: readonly ['IMF_WEO', 'WB_WDI'] = ['IMF_WEO', 'WB_WDI'];

export const FIXTURE_COUNTRIES: readonly Country[] = [
  { iso3: 'ZAF', name: 'South Africa', sources: [...BOTH_SOURCES] },
  { iso3: 'NAM', name: 'Namibia', sources: [...BOTH_SOURCES] },
  { iso3: 'BWA', name: 'Botswana', sources: [...BOTH_SOURCES] },
  { iso3: 'KEN', name: 'Kenya', sources: [...BOTH_SOURCES] },
  { iso3: 'NGA', name: 'Nigeria', sources: [...BOTH_SOURCES] },
  { iso3: 'ZMB', name: 'Zambia', sources: [...BOTH_SOURCES] },
  { iso3: 'MUS', name: 'Mauritius', sources: [...BOTH_SOURCES] },
  { iso3: 'GBR', name: 'United Kingdom', sources: [...BOTH_SOURCES] },
  { iso3: 'USA', name: 'United States', sources: [...BOTH_SOURCES] },
  { iso3: 'DEU', name: 'Germany', sources: [...BOTH_SOURCES] },
  { iso3: 'IND', name: 'India', sources: [...BOTH_SOURCES] },
  { iso3: 'BRA', name: 'Brazil', sources: [...BOTH_SOURCES] },
];

export const FIXTURE_INDICATORS: readonly Indicator[] = [
  {
    code: 'GDP_GROWTH_REAL',
    name: 'Real GDP growth',
    unit: 'Percent',
    scale: null,
    category: 'growth',
    curated: true,
    sources: [
      { source: 'IMF_WEO', sourceCode: 'NGDP_RPCH', preferred: true },
      { source: 'WB_WDI', sourceCode: 'NY.GDP.MKTP.KD.ZG', preferred: false },
    ],
  },
  {
    code: 'CPI_INFLATION_AVG',
    name: 'Inflation, average CPI',
    unit: 'Percent',
    scale: null,
    category: 'prices',
    curated: true,
    sources: [
      { source: 'IMF_WEO', sourceCode: 'PCPIPCH', preferred: true },
      { source: 'WB_WDI', sourceCode: 'FP.CPI.TOTL.ZG', preferred: false },
    ],
  },
  {
    code: 'CPI_INFLATION_EOP',
    name: 'Inflation, end of period CPI',
    unit: 'Percent',
    scale: null,
    category: 'prices',
    curated: true,
    sources: [{ source: 'IMF_WEO', sourceCode: 'PCPIEPCH', preferred: true }],
  },
  {
    code: 'UNEMPLOYMENT_RATE',
    name: 'Unemployment rate',
    unit: 'Percent of labour force',
    scale: null,
    category: 'labour',
    curated: true,
    sources: [
      { source: 'IMF_WEO', sourceCode: 'LUR', preferred: true },
      { source: 'WB_WDI', sourceCode: 'SL.UEM.TOTL.ZS', preferred: false },
    ],
  },
  {
    code: 'GOVT_DEBT_GDP',
    name: 'General government gross debt',
    unit: 'Percent of GDP',
    scale: null,
    category: 'fiscal',
    curated: true,
    sources: [{ source: 'IMF_WEO', sourceCode: 'GGXWDG_NGDP', preferred: true }],
  },
  {
    code: 'FISCAL_BALANCE_GDP',
    name: 'Govt net lending/borrowing',
    unit: 'Percent of GDP',
    scale: null,
    category: 'fiscal',
    curated: true,
    sources: [{ source: 'IMF_WEO', sourceCode: 'GGXCNL_NGDP', preferred: true }],
  },
  {
    code: 'CURRENT_ACCOUNT_GDP',
    name: 'Current account balance',
    unit: 'Percent of GDP',
    scale: null,
    category: 'external',
    curated: true,
    sources: [
      { source: 'IMF_WEO', sourceCode: 'BCA_NGDPD', preferred: true },
      { source: 'WB_WDI', sourceCode: 'BN.CAB.XOKA.GD.ZS', preferred: false },
    ],
  },
  {
    code: 'GDP_PER_CAPITA_USD',
    name: 'GDP per capita, current prices',
    unit: 'US dollars',
    scale: null,
    category: 'growth',
    curated: true,
    sources: [
      { source: 'IMF_WEO', sourceCode: 'NGDPDPC', preferred: true },
      { source: 'WB_WDI', sourceCode: 'NY.GDP.PCAP.CD', preferred: false },
    ],
  },
  {
    code: 'REAL_INTEREST_RATE',
    name: 'Real interest rate',
    unit: 'Percent',
    scale: null,
    category: 'monetary',
    curated: true,
    sources: [{ source: 'WB_WDI', sourceCode: 'FR.INR.RINR', preferred: true }],
  },
  {
    code: 'LENDING_RATE',
    name: 'Lending interest rate',
    unit: 'Percent',
    scale: null,
    category: 'monetary',
    curated: true,
    sources: [{ source: 'WB_WDI', sourceCode: 'FR.INR.LEND', preferred: true }],
  },
  {
    code: 'PRIVATE_CREDIT_GDP',
    name: 'Domestic credit to private sector',
    unit: 'Percent of GDP',
    scale: null,
    category: 'credit',
    curated: true,
    sources: [{ source: 'WB_WDI', sourceCode: 'FS.AST.PRVT.GD.ZS', preferred: true }],
  },
  {
    code: 'BROAD_MONEY_GDP',
    name: 'Broad money',
    unit: 'Percent of GDP',
    scale: null,
    category: 'monetary',
    curated: true,
    sources: [{ source: 'WB_WDI', sourceCode: 'FM.LBL.BMNY.GD.ZS', preferred: true }],
  },
  {
    code: 'REER_INDEX',
    name: 'Real effective exchange rate',
    unit: 'Index (2010=100)',
    scale: null,
    category: 'external',
    curated: true,
    sources: [{ source: 'WB_WDI', sourceCode: 'PX.REX.REER', preferred: true }],
  },
];

/**
 * Revisions for the vintages tab, shaped like the live route.
 *
 * Chosen to exercise every branch the derivations have: both significance
 * thresholds and both boundaries, a `previousValue` of zero, a series the
 * vintage added and one it dropped. The real service returns thousands of rows
 * for a vintage; this is the smallest set that makes every state reachable.
 */
export const FIXTURE_REVISIONS: readonly Revision[] = [
  // Significant by the absolute rule, negative.
  { indicator: 'GDP_PER_CAPITA_USD', country: 'ZAF', year: 2023, previousValue: 7036, newValue: 6857 },
  { indicator: 'GDP_PER_CAPITA_USD', country: 'NAM', year: 2023, previousValue: 8927, newValue: 8735 },
  // Significant by the absolute rule, positive.
  { indicator: 'GDP_PER_CAPITA_USD', country: 'KEN', year: 2023, previousValue: 6290, newValue: 6379 },
  { indicator: 'UNEMPLOYMENT_RATE', country: 'KEN', year: 2023, previousValue: 18.9, newValue: 19.5 },
  // Significant by the relative rule alone: 0.03 absolute, 20 percent.
  { indicator: 'CPI_INFLATION_AVG', country: 'BWA', year: 2024, previousValue: 0.15, newValue: 0.18 },
  // Under both bars: 0.4 absolute and 2 percent.
  { indicator: 'GDP_GROWTH_REAL', country: 'ZAF', year: 2024, previousValue: 20, newValue: 20.4 },
  // Exactly on both bars, so neither "more than" rule fires.
  { indicator: 'GDP_GROWTH_REAL', country: 'NAM', year: 2024, previousValue: 5, newValue: 5.5 },
  // A previous value of zero: the relative test must not divide.
  { indicator: 'CURRENT_ACCOUNT_GDP', country: 'BWA', year: 2022, previousValue: 0, newValue: 0.2 },
  // A series the vintage added, spanning several years.
  { indicator: 'LENDING_RATE', country: 'MUS', year: 2010, previousValue: null, newValue: 8.4 },
  { indicator: 'LENDING_RATE', country: 'MUS', year: 2017, previousValue: null, newValue: 7.9 },
  { indicator: 'LENDING_RATE', country: 'MUS', year: 2024, previousValue: null, newValue: 7.1 },
  // A series the vintage dropped, over a single year.
  { indicator: 'REER_INDEX', country: 'ZMB', year: 2021, previousValue: 103.2, newValue: null },
];
