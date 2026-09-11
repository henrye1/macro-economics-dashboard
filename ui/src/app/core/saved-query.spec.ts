import {
  type SavedQuery,
  reproduceBlockedReason,
  reproduceTarget,
  savedDate,
  scopeLabel,
  vintageLabel
} from './saved-query';
import { DEFAULT_WORKING_QUERY, type WorkingQuery } from './working-query';

function query(overrides: Partial<WorkingQuery> = {}): WorkingQuery {
  return { ...DEFAULT_WORKING_QUERY, ...overrides };
}

function saved(overrides: Partial<SavedQuery> = {}): SavedQuery {
  return {
    name: 'Q4 2025 ECL — ZAF, NAM',
    query: query(),
    vintageIds: [12],
    savedAt: '2025-10-14T09:31:04.221Z',
    ...overrides
  };
}

describe('scopeLabel', () => {
  it('renders the design example', () => {
    const label = scopeLabel(
      query({
        indicators: ['A', 'B', 'C'],
        countries: ['ZAF', 'NAM'],
        yearFrom: 2018,
        yearTo: 2030
      })
    );

    expect(label).toBe('3 ind × 2 ctry · 2018–2030');
  });

  it('does not pluralise, matching the design', () => {
    expect(scopeLabel(query({ indicators: ['A'], countries: ['ZAF'] }))).toContain('1 ind × 1 ctry');
  });

  it('reads no countries as all countries, which is what the API does', () => {
    expect(scopeLabel(query({ indicators: ['A'], countries: [] }))).toContain('1 ind × all ctry');
  });

  it('reads an unbounded range as all years', () => {
    expect(scopeLabel(query({ yearFrom: null, yearTo: null }))).toContain('all years');
  });

  it('reads a one-sided range from either end', () => {
    expect(scopeLabel(query({ yearFrom: 2018, yearTo: null }))).toContain('from 2018');
    expect(scopeLabel(query({ yearFrom: null, yearTo: 2030 }))).toContain('to 2030');
  });

  it('renders a single-year range as both ends, not one', () => {
    // Unlike a series span, a year filter of 2020 to 2020 is genuinely a range
    // the user set on both sides.
    expect(scopeLabel(query({ yearFrom: 2020, yearTo: 2020 }))).toContain('2020–2020');
  });
});

describe('vintageLabel', () => {
  it('reads latest when nothing is pinned', () => {
    expect(vintageLabel(query({ vintage: 'latest' }))).toBe('latest');
  });

  it('names a pinned id', () => {
    expect(vintageLabel(query({ vintage: 12 }))).toBe('pinned id 12');
  });

  it('shows a pinned label as written', () => {
    expect(vintageLabel(query({ vintage: 'WEO 9.0.0 2025-10-08' }))).toBe('WEO 9.0.0 2025-10-08');
  });
});

describe('savedDate', () => {
  it('renders the date part of the stamp', () => {
    expect(savedDate(saved({ savedAt: '2025-10-14T09:31:04.221Z' }))).toBe('2025-10-14');
  });

  it('does not parse the stamp as a Date, so no timezone can shift it', () => {
    // 23:30 UTC is the next day in some zones. Slicing cannot drift.
    expect(savedDate(saved({ savedAt: '2026-05-02T23:30:00.000Z' }))).toBe('2026-05-02');
  });
});

describe('reproduceTarget', () => {
  it('is the recorded id when exactly one was observed', () => {
    expect(reproduceTarget(saved({ vintageIds: [12] }))).toBe(12);
  });

  it('is null when none were recorded', () => {
    expect(reproduceTarget(saved({ vintageIds: [] }))).toBeNull();
  });

  it('is null when the result drew on more than one vintage', () => {
    // Pinning one would return a subset while claiming to reproduce.
    expect(reproduceTarget(saved({ vintageIds: [2, 12] }))).toBeNull();
  });
});

describe('reproduceBlockedReason', () => {
  it('is null when Reproduce can be offered', () => {
    expect(reproduceBlockedReason(saved({ vintageIds: [12] }))).toBeNull();
  });

  it('explains an empty record', () => {
    expect(reproduceBlockedReason(saved({ vintageIds: [] }))).toContain('nothing to pin');
  });

  it('explains a multi-vintage record', () => {
    expect(reproduceBlockedReason(saved({ vintageIds: [2, 12] }))).toContain(
      'more than one vintage'
    );
  });

  it('agrees with reproduceTarget in every case', () => {
    for (const ids of [[], [12], [2, 12], [1, 2, 3]]) {
      const entry = saved({ vintageIds: ids });
      const blocked = reproduceBlockedReason(entry) !== null;

      expect(blocked)
        .withContext(`ids ${JSON.stringify(ids)}`)
        .toBe(reproduceTarget(entry) === null);
    }
  });
});
