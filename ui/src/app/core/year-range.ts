/**
 * The years the Year from and Year to selects offer.
 *
 * The service publishes no year bounds, so the console picks a window. 2010 is
 * the design's floor, and the ceiling tracks the calendar because WEO carries
 * staff forecasts about five years past the current year: a hardcoded ceiling
 * would quietly stop offering the forecast horizon as the years roll on.
 */

export const MIN_YEAR = 2010;

/** WEO forecasts run about five years out; one more keeps the edge reachable. */
const FORECAST_HORIZON = 6;

/**
 * The year list, newest last, always covering `include`.
 *
 * A saved query or a pinned vintage can carry a year outside the window.
 * Widening rather than clamping means loading one never silently rewrites the
 * query it restored: the select shows the value the query actually holds.
 */
export function yearOptions(
  include: readonly (number | null)[] = [],
  now: Date = new Date()
): number[] {
  const present = include.filter((year): year is number => year !== null);

  const first = Math.min(MIN_YEAR, ...present);
  const last = Math.max(now.getFullYear() + FORECAST_HORIZON, ...present);

  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}
