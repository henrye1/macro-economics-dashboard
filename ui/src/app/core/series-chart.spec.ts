import type { Series, SeriesPoint } from './macro-contracts';
import { buildCharts, CHART_HEIGHT, CHART_WIDTH, SERIES_COLORS } from './series-chart';

function point(year: number, value: number, isForecast = false): SeriesPoint {
  return { year, value, isForecast };
}

function series(overrides: Partial<Series> = {}): Series {
  return {
    indicator: 'GDP_GROWTH_REAL',
    name: 'Real GDP growth',
    unit: 'Percent',
    scale: null,
    country: 'ZAF',
    source: 'IMF_WEO',
    vintage: 'WEO 10.0.0',
    lastActualYear: 2024,
    points: [point(2022, 1), point(2023, 2), point(2024, 3)],
    ...overrides
  };
}

describe('buildCharts', () => {
  it('makes one chart per indicator and one line per country', () => {
    const charts = buildCharts([
      series({ country: 'ZAF' }),
      series({ country: 'NGA' }),
      series({ indicator: 'CPI_INFLATION_AVG', name: 'Inflation' })
    ]);

    expect(charts.length).toBe(2);
    expect(charts[0].indicator).toBe('GDP_GROWTH_REAL');
    expect(charts[0].lines.map((line) => line.country)).toEqual(['ZAF', 'NGA']);
    expect(charts[1].lines.length).toBe(1);
  });

  it('walks the palette per country and wraps past the end', () => {
    const countries = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    const chart = buildCharts(countries.map((country) => series({ country })))[0];

    expect(chart.lines.map((line) => line.color)).toEqual([
      ...SERIES_COLORS,
      SERIES_COLORS[0]
    ]);
  });

  it('scales the first and last year to the plot edges', () => {
    const chart = buildCharts([series()])[0];
    const xs = chart.xTicks.map((tick) => tick.position);

    expect(xs[0]).toBe(56);
    expect(xs[xs.length - 1]).toBe(748);
  });

  it('centres a single-year series rather than dividing by a zero span', () => {
    const chart = buildCharts([series({ points: [point(2024, 5)] })])[0];

    expect(chart.xTicks).toEqual([{ position: 402, label: '2024' }]);
    expect(chart.points[0].cx).toBe(402);
  });

  it('pads the value range so the extremes never touch the frame', () => {
    const chart = buildCharts([
      series({ points: [point(2022, 0), point(2023, 10)] })
    ])[0];

    const ys = chart.points.map((p) => p.cy);

    // The plot runs 14 to 214; 15% padding keeps both points inside it.
    expect(Math.max(...ys)).toBeLessThan(214);
    expect(Math.min(...ys)).toBeGreaterThan(14);
  });

  it('gives a flat series a range instead of a NaN scale', () => {
    const chart = buildCharts([
      series({ points: [point(2022, 4), point(2023, 4)] })
    ])[0];

    for (const p of chart.points) {
      expect(p.cy).toBe(114);
    }
  });

  it('bridges the forecast path back to the last actual point', () => {
    const chart = buildCharts([
      series({
        lastActualYear: 2023,
        points: [point(2022, 1), point(2023, 2), point(2024, 3, true)]
      })
    ])[0];

    const line = chart.lines[0];

    // 2022 to 2023: one move, one line.
    expect(line.actualPath).toBe('M56 190.9 L402 114');
    // Restarts at 2023, where the actual path ended, then draws to 2024.
    expect(line.forecastPath).toBe('M402 114 L748 37.1');
  });

  it('keeps the boundary out of the window when every year is a forecast', () => {
    const chart = buildCharts([
      series({
        lastActualYear: 2021,
        points: [point(2022, 1, true), point(2023, 2, true)]
      })
    ])[0];

    expect(chart.hasForecast).toBe(true);
    expect(chart.boundaryInWindow).toBe(false);
    // The band still covers the plot: all of it really is forecast.
    expect(chart.forecastBandWidth).toBe(692);
  });

  it('keeps the boundary out of the window when it sits on the last year', () => {
    const chart = buildCharts([
      series({
        lastActualYear: 2024,
        points: [point(2023, 1), point(2024, 2)]
      })
    ])[0];

    expect(chart.boundaryInWindow).toBe(false);
  });

  it('leaves the forecast path empty when nothing is forecast', () => {
    const chart = buildCharts([series()])[0];

    expect(chart.lines[0].forecastPath).toBe('');
    expect(chart.hasForecast).toBe(false);
    expect(chart.forecastBandWidth).toBe(0);
  });

  it('bands the forecast from the boundary to the right edge', () => {
    const chart = buildCharts([
      series({
        lastActualYear: 2023,
        points: [point(2022, 1), point(2023, 2), point(2024, 3, true)]
      })
    ])[0];

    expect(chart.hasForecast).toBe(true);
    expect(chart.boundaryInWindow).toBe(true);
    expect(chart.boundaryX).toBe(402);
    expect(chart.forecastBandX).toBe(402);
    expect(chart.forecastBandWidth).toBe(346);
  });

  it('takes the earliest boundary in the group so the band never overclaims', () => {
    const points = [point(2022, 1), point(2023, 2), point(2024, 3, true)];
    const chart = buildCharts([
      series({ country: 'ZAF', lastActualYear: 2023, points }),
      series({ country: 'NGA', lastActualYear: 2024, points })
    ])[0];

    expect(chart.boundaryX).toBe(402);
  });

  it('draws forecast points hollow and actual points filled', () => {
    const chart = buildCharts([
      series({ lastActualYear: 2023, points: [point(2023, 2), point(2024, 3, true)] })
    ])[0];

    expect(chart.points[0].fill).toBe(SERIES_COLORS[0]);
    expect(chart.points[0].radius).toBe(3.2);
    expect(chart.points[1].fill).toBe('#ffffff');
    expect(chart.points[1].radius).toBe(2.6);
  });

  it('labels a point with its country, year, state and unit', () => {
    const chart = buildCharts([
      series({ lastActualYear: 2023, points: [point(2023, 2.25), point(2024, 3, true)] })
    ])[0];

    expect(chart.points[0].head).toBe('ZAF · 2023 · actual');
    expect(chart.points[0].value).toBe('2.3 Percent');
    expect(chart.points[1].head).toBe('ZAF · 2024 · forecast');
  });

  it('anchors the tooltip as a percentage of the viewBox', () => {
    const chart = buildCharts([series()])[0];
    const first = chart.points[0];

    expect(first.leftPercent).toBeCloseTo((first.cx / CHART_WIDTH) * 100, 6);
    expect(first.topPercent).toBeCloseTo((first.cy / CHART_HEIGHT) * 100, 6);
  });

  it('emits five y ticks spanning the padded range', () => {
    const chart = buildCharts([series()])[0];

    expect(chart.yTicks.length).toBe(5);
    expect(chart.yTicks[0].position).toBe(214);
    expect(chart.yTicks[4].position).toBe(14);
  });

  it('drops the decimal on ticks once the range runs to thousands', () => {
    const chart = buildCharts([
      series({ points: [point(2022, 1000), point(2023, 9000)] })
    ])[0];

    for (const tick of chart.yTicks) {
      expect(tick.label).not.toContain('.');
    }

    // The padded range runs past 10,000, where grouping shows.
    expect(chart.yTicks[4].label).toBe('10,200');
  });

  it('thins a dense x axis but keeps the last year', () => {
    const points = Array.from({ length: 30 }, (_, i) => point(2000 + i, i));
    const chart = buildCharts([series({ points })])[0];

    expect(chart.xTicks.length).toBeLessThanOrEqual(12);
    expect(chart.xTicks[chart.xTicks.length - 1].label).toBe('2029');
  });

  it('labels every year while the axis is sparse', () => {
    const chart = buildCharts([series()])[0];

    expect(chart.xTicks.map((tick) => tick.label)).toEqual(['2022', '2023', '2024']);
  });

  it('states the chart for screen readers', () => {
    const chart = buildCharts([series({ country: 'ZAF' }), series({ country: 'NGA' })])[0];

    expect(chart.description).toContain('Real GDP growth');
    expect(chart.description).toContain('Percent');
    expect(chart.description).toContain('ZAF, NGA');
    expect(chart.description).toContain('2022 to 2024');
    expect(chart.description).toContain('actual through 2024');
  });

  it('summarises the group in the meta label', () => {
    const chart = buildCharts([series({ country: 'ZAF' }), series({ country: 'NGA' })])[0];

    expect(chart.metaLabel).toBe('Percent · ZAF, NGA · IMF_WEO · WEO 10.0.0');
  });

  it('skips a group whose series all came back empty', () => {
    expect(buildCharts([series({ points: [] })])).toEqual([]);
  });

  it('keeps a populated group when a sibling series is empty', () => {
    const charts = buildCharts([
      series({ country: 'ZAF', points: [] }),
      series({ country: 'NGA' })
    ]);

    expect(charts.length).toBe(1);
    expect(charts[0].lines.length).toBe(2);
    expect(charts[0].lines[0].actualPath).toBe('');
  });

  describe('the accessible value table', () => {
    it('covers the same years as the axis, in order', () => {
      const chart = buildCharts([
        series({ country: 'ZAF', points: [point(2022, 1), point(2024, 3)] }),
        series({ country: 'NGA', points: [point(2023, 9)] })
      ])[0];

      expect(chart.table.years).toEqual([2022, 2023, 2024]);
    });

    it('gives one row per country with a cell per year', () => {
      const chart = buildCharts([
        series({ country: 'ZAF' }),
        series({ country: 'NGA' })
      ])[0];

      expect(chart.table.rows.map((row) => row.country)).toEqual(['ZAF', 'NGA']);
      expect(chart.table.rows[0].cells.length).toBe(3);
    });

    it('formats the value with its unit and marks forecasts', () => {
      const chart = buildCharts([
        series({ points: [point(2024, 3), point(2025, 4.25, true)] })
      ])[0];

      expect(chart.table.rows[0].cells[0]).toEqual({
        value: '3.0 Percent',
        forecast: false
      });
      expect(chart.table.rows[0].cells[1]).toEqual({
        value: '4.3 Percent',
        forecast: true
      });
    });

    it('nulls a year the country does not report, keeping the columns aligned', () => {
      const chart = buildCharts([
        series({ country: 'ZAF', points: [point(2022, 1), point(2023, 2)] }),
        series({ country: 'NGA', points: [point(2023, 9)] })
      ])[0];

      expect(chart.table.rows[1].cells[0]).toBeNull();
      expect(chart.table.rows[1].cells[1]?.value).toBe('9.0 Percent');
      expect(chart.table.rows[1].cells.length).toBe(chart.table.years.length);
    });

    it('carries every plotted point, so nothing on the chart is unreachable', () => {
      const chart = buildCharts([
        series({ country: 'ZAF' }),
        series({ country: 'NGA', points: [point(2023, 9), point(2025, 11, true)] })
      ])[0];

      const cells = chart.table.rows.flatMap((row) =>
        row.cells.filter((cell) => cell !== null)
      );

      expect(cells.length).toBe(chart.points.length);
    });
  });

  it('returns nothing for no series', () => {
    expect(buildCharts([])).toEqual([]);
  });
});
