import type { Revision, SourceCode, Vintage } from './macro-contracts';
import {
  SIGNIFICANCE_NOTE,
  SIGNIFICANT_ABSOLUTE,
  SIGNIFICANT_RELATIVE,
  appearedSeries,
  byNewestFirst,
  disappearedSeries,
  formatSeriesSpan,
  formatYearHorizon,
  isSignificantRevision,
  predecessorOf,
  revisionChange,
  toRevisionView,
  yearHorizon
} from './revision-view';

function revision(overrides: Partial<Revision> = {}): Revision {
  return {
    indicator: 'GDP_GROWTH_REAL',
    country: 'ZAF',
    year: 2023,
    previousValue: 10,
    newValue: 10,
    ...overrides
  };
}

function vintage(id: number, source: SourceCode): Vintage {
  return {
    id,
    label: `${source} ${id}`,
    source,
    sourceVersion: '2026-01',
    retrievedAtUtc: '2026-01-02T02:00:00.1234567',
    isLatest: false
  };
}

describe('revisionChange', () => {
  it('is the difference between the two values', () => {
    expect(revisionChange(revision({ previousValue: 7036, newValue: 6857 }))).toBe(-179);
    expect(revisionChange(revision({ previousValue: 6290, newValue: 6379 }))).toBe(89);
  });

  it('is null when the vintage added the cell', () => {
    expect(revisionChange(revision({ previousValue: null, newValue: 12 }))).toBeNull();
  });

  it('is null when the vintage dropped the cell', () => {
    expect(revisionChange(revision({ previousValue: 12, newValue: null }))).toBeNull();
  });

  it('is null, not zero, when both sides are missing', () => {
    // Zero would claim the value did not move. It was never there.
    expect(revisionChange(revision({ previousValue: null, newValue: null }))).toBeNull();
  });

  it('is zero when the value genuinely did not move', () => {
    expect(revisionChange(revision({ previousValue: 5, newValue: 5 }))).toBe(0);
  });
});

describe('isSignificantRevision', () => {
  describe('the absolute threshold', () => {
    it('flags a change greater than 0.5', () => {
      expect(isSignificantRevision(revision({ previousValue: 18.9, newValue: 19.5 }))).toBeTrue();
    });

    it('does not flag a change of exactly 0.5, because the rule says "more than"', () => {
      const exact = revision({ previousValue: 100, newValue: 100.5 });

      expect(revisionChange(exact)).toBeCloseTo(SIGNIFICANT_ABSOLUTE, 10);
      expect(isSignificantRevision(exact)).toBeFalse();
    });

    it('flags a large negative change', () => {
      expect(isSignificantRevision(revision({ previousValue: 7036, newValue: 6857 }))).toBeTrue();
    });
  });

  describe('the relative threshold', () => {
    it('flags a small absolute change that is a big proportion', () => {
      // 0.02 absolute is under 0.5, but 20% of 0.1 is over the relative bar.
      const row = revision({ previousValue: 0.1, newValue: 0.12 });

      expect(Math.abs(revisionChange(row) as number)).toBeLessThan(SIGNIFICANT_ABSOLUTE);
      expect(isSignificantRevision(row)).toBeTrue();
    });

    it('does not flag exactly ten percent', () => {
      // The witness has to clear neither bar: 5 -> 5.5 is a change of exactly
      // 0.5 (not "more than" 0.5) and exactly 10% (not "more than" 10%). A
      // larger pair would flag on the absolute test before the relative one
      // was ever reached.
      const row = revision({ previousValue: 5, newValue: 5.5 });

      expect(revisionChange(row)).toBe(SIGNIFICANT_ABSOLUTE);
      expect((revisionChange(row) as number) / 5).toBe(SIGNIFICANT_RELATIVE);
      expect(isSignificantRevision(row)).toBeFalse();
    });

    it('follows IEEE-754 at a boundary the binary format cannot represent', () => {
      // `1.1 - 1` is 0.10000000000000009, marginally over the bar, so this row
      // flags. Recorded rather than smoothed over with an epsilon: the
      // threshold is a reading aid, and a tolerance would be a second
      // undocumented rule on top of a derived flag the service never sent.
      expect(1.1 - 1).toBeGreaterThan(0.1);
      expect(isSignificantRevision(revision({ previousValue: 1, newValue: 1.1 }))).toBeTrue();
    });

    it('measures the proportion against a negative previous value too', () => {
      // -0.1 -> -0.13 is 30% in magnitude, well under 0.5 absolute.
      expect(isSignificantRevision(revision({ previousValue: -0.1, newValue: -0.13 }))).toBeTrue();
    });
  });

  describe('a previous value of zero', () => {
    it('never divides, so a tiny change from zero is not flagged', () => {
      const row = revision({ previousValue: 0, newValue: 0.2 });

      expect(isSignificantRevision(row)).toBeFalse();
    });

    it('still applies the absolute test', () => {
      expect(isSignificantRevision(revision({ previousValue: 0, newValue: 3 }))).toBeTrue();
    });
  });

  describe('a missing side', () => {
    it('is never significant, because there is no change to measure', () => {
      expect(isSignificantRevision(revision({ previousValue: null, newValue: 9999 }))).toBeFalse();
      expect(isSignificantRevision(revision({ previousValue: 9999, newValue: null }))).toBeFalse();
      expect(isSignificantRevision(revision({ previousValue: null, newValue: null }))).toBeFalse();
    });
  });

  it('does not flag an unchanged value', () => {
    expect(isSignificantRevision(revision({ previousValue: 5, newValue: 5 }))).toBeFalse();
  });
});

describe('toRevisionView', () => {
  it('carries the row alongside its derived values', () => {
    const row = revision({ previousValue: 7036, newValue: 6857 });
    const view = toRevisionView(row);

    expect(view.revision).toBe(row);
    expect(view.change).toBe(-179);
    expect(view.significant).toBeTrue();
  });

  it('states the threshold it applied, so the note cannot drift from the rule', () => {
    expect(SIGNIFICANCE_NOTE).toContain('10%');
    expect(SIGNIFICANCE_NOTE).toContain('0.5');
  });
});

describe('appearedSeries', () => {
  it('groups added cells into one span per indicator and country', () => {
    const spans = appearedSeries([
      revision({ indicator: 'LENDING_RATE', country: 'MUS', year: 2012, previousValue: null }),
      revision({ indicator: 'LENDING_RATE', country: 'MUS', year: 2010, previousValue: null }),
      revision({ indicator: 'LENDING_RATE', country: 'MUS', year: 2024, previousValue: null })
    ]);

    expect(spans.length).toBe(1);
    expect(spans[0]).toEqual({
      indicator: 'LENDING_RATE',
      country: 'MUS',
      fromYear: 2010,
      toYear: 2024
    });
  });

  it('keeps one span per country', () => {
    const spans = appearedSeries([
      revision({ indicator: 'A', country: 'ZAF', year: 2020, previousValue: null }),
      revision({ indicator: 'A', country: 'NAM', year: 2021, previousValue: null })
    ]);

    expect(spans.map((span) => span.country)).toEqual(['NAM', 'ZAF']);
  });

  it('ignores ordinary changes and dropped cells', () => {
    const spans = appearedSeries([
      revision({ previousValue: 1, newValue: 2 }),
      revision({ indicator: 'GONE', previousValue: 5, newValue: null })
    ]);

    expect(spans).toEqual([]);
  });

  it('ignores a row with neither value', () => {
    expect(appearedSeries([revision({ previousValue: null, newValue: null })])).toEqual([]);
  });

  it('sorts by indicator then country', () => {
    const spans = appearedSeries([
      revision({ indicator: 'B', country: 'ZAF', previousValue: null }),
      revision({ indicator: 'A', country: 'ZWE', previousValue: null }),
      revision({ indicator: 'A', country: 'NAM', previousValue: null })
    ]);

    expect(spans.map((span) => `${span.indicator}/${span.country}`)).toEqual([
      'A/NAM',
      'A/ZWE',
      'B/ZAF'
    ]);
  });
});

describe('disappearedSeries', () => {
  it('groups dropped cells', () => {
    const spans = disappearedSeries([
      revision({ indicator: 'OLD_RATE', country: 'KEN', year: 2019, newValue: null }),
      revision({ indicator: 'OLD_RATE', country: 'KEN', year: 2021, newValue: null })
    ]);

    expect(spans).toEqual([
      { indicator: 'OLD_RATE', country: 'KEN', fromYear: 2019, toYear: 2021 }
    ]);
  });

  it('ignores added cells', () => {
    expect(disappearedSeries([revision({ previousValue: null, newValue: 3 })])).toEqual([]);
  });

  it('is empty for a vintage that dropped nothing', () => {
    expect(disappearedSeries([revision({ previousValue: 1, newValue: 2 })])).toEqual([]);
  });
});

describe('formatSeriesSpan', () => {
  it('renders a multi-year span with an en dash', () => {
    expect(
      formatSeriesSpan({ indicator: 'LENDING_RATE', country: 'MUS', fromYear: 2010, toYear: 2024 })
    ).toBe('LENDING_RATE · MUS · 2010–2024');
  });

  it('renders a single year once, not as a range against itself', () => {
    expect(
      formatSeriesSpan({ indicator: 'A', country: 'ZAF', fromYear: 2023, toYear: 2023 })
    ).toBe('A · ZAF · 2023');
  });
});

describe('predecessorOf', () => {
  const vintages = [
    vintage(14, 'IMF_WEO'),
    vintage(13, 'WB_WDI'),
    vintage(12, 'IMF_WEO'),
    vintage(11, 'WB_WDI'),
    vintage(9, 'IMF_WEO')
  ];

  it('skips other sources to find the same source', () => {
    // The design pairs WDI 13 with WDI 11, stepping over WEO 12.
    expect(predecessorOf(vintages, vintage(13, 'WB_WDI'))?.id).toBe(11);
  });

  it('takes the nearest earlier vintage of that source', () => {
    expect(predecessorOf(vintages, vintage(14, 'IMF_WEO'))?.id).toBe(12);
    expect(predecessorOf(vintages, vintage(12, 'IMF_WEO'))?.id).toBe(9);
  });

  it('is null for the earliest vintage of a source', () => {
    expect(predecessorOf(vintages, vintage(9, 'IMF_WEO'))).toBeNull();
    expect(predecessorOf(vintages, vintage(11, 'WB_WDI'))).toBeNull();
  });

  it('is null when the list holds no other vintage of that source', () => {
    expect(predecessorOf([vintage(5, 'WB_WDI')], vintage(5, 'WB_WDI'))).toBeNull();
  });

  it('does not depend on the order the service returned', () => {
    const shuffled = [vintages[3], vintages[0], vintages[4], vintages[1], vintages[2]];

    expect(predecessorOf(shuffled, vintage(13, 'WB_WDI'))?.id).toBe(11);
  });
});

describe('byNewestFirst', () => {
  it('sorts by id descending whatever order arrived', () => {
    const sorted = byNewestFirst([
      vintage(9, 'IMF_WEO'),
      vintage(14, 'IMF_WEO'),
      vintage(11, 'WB_WDI')
    ]);

    expect(sorted.map((v) => v.id)).toEqual([14, 11, 9]);
  });

  it('does not mutate its input', () => {
    const input = [vintage(9, 'IMF_WEO'), vintage(14, 'IMF_WEO')];
    byNewestFirst(input);

    expect(input.map((v) => v.id)).toEqual([9, 14]);
  });
});

describe('yearHorizon', () => {
  const row = (
    year: number,
    previousValue: number | null,
    newValue: number | null
  ): Revision => ({ indicator: 'GDP_GROWTH_REAL', country: 'ZAF', year, previousValue, newValue });

  it('reports the newest year each side carries a value for', () => {
    expect(yearHorizon([row(2023, 1, 1), row(2024, 2, 2), row(2025, null, 3)])).toEqual({
      previous: 2024,
      current: 2025
    });
  });

  it('ignores a null side rather than counting its year', () => {
    expect(yearHorizon([row(2030, 1, null)])).toEqual({ previous: 2030, current: null });
  });

  it('is empty for no rows', () => {
    expect(yearHorizon([])).toEqual({ previous: null, current: null });
  });

  it('does not assume the rows arrive in year order', () => {
    expect(yearHorizon([row(2025, null, 3), row(2023, 1, 1)])).toEqual({
      previous: 2023,
      current: 2025
    });
  });
});

describe('formatYearHorizon', () => {
  it('shows the move', () => {
    expect(formatYearHorizon({ previous: 2024, current: 2025 })).toBe('2024 → 2025');
  });

  it('says so when nothing moved', () => {
    expect(formatYearHorizon({ previous: 2025, current: 2025 })).toBe('Unchanged at 2025');
  });

  it('reads as new data when there was no predecessor value', () => {
    expect(formatYearHorizon({ previous: null, current: 2025 })).toBe('New through 2025');
  });

  it('reads as a retreat when the vintage added nothing', () => {
    expect(formatYearHorizon({ previous: 2025, current: null })).toBe('Nothing new past 2025');
  });

  it('is None when there is nothing at all', () => {
    expect(formatYearHorizon({ previous: null, current: null })).toBe('None');
  });
});
