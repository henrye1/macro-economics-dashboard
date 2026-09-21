import { MIN_YEAR, yearOptions } from './year-range';

const NOW = new Date('2026-09-14T00:00:00Z');

describe('yearOptions', () => {
  it('runs from the floor to the forecast horizon', () => {
    const years = yearOptions([], NOW);

    expect(years[0]).toBe(MIN_YEAR);
    expect(years[years.length - 1]).toBe(2032);
  });

  it('is contiguous and ascending', () => {
    const years = yearOptions([], NOW);

    expect(years.length).toBe(2032 - MIN_YEAR + 1);
    years.forEach((year, index) => expect(year).toBe(MIN_YEAR + index));
  });

  it('tracks the calendar rather than a fixed ceiling', () => {
    const later = yearOptions([], new Date('2030-01-01T00:00:00Z'));

    expect(later[later.length - 1]).toBe(2036);
  });

  it('widens down to cover a year below the floor', () => {
    const years = yearOptions([1998], NOW);

    expect(years[0]).toBe(1998);
    expect(years).toContain(MIN_YEAR);
  });

  it('widens up to cover a year past the horizon', () => {
    const years = yearOptions([2099], NOW);

    expect(years[years.length - 1]).toBe(2099);
  });

  it('ignores unbounded ends', () => {
    expect(yearOptions([null, null], NOW)).toEqual(yearOptions([], NOW));
  });

  it('covers both ends of a range that straddles the window', () => {
    const years = yearOptions([1995, 2099], NOW);

    expect(years[0]).toBe(1995);
    expect(years[years.length - 1]).toBe(2099);
  });

  it('leaves the window alone for years already inside it', () => {
    expect(yearOptions([2018, 2024], NOW)).toEqual(yearOptions([], NOW));
  });
});
