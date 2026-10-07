/**
 * One decimal place, grouped thousands.
 *
 * The observations design only shows percent values, where one decimal matches
 * it exactly. Grouping is added because `GDP_PER_CAPITA_USD` reaches five
 * figures and an ungrouped `65324.1` is harder to read than `65,324.1`.
 *
 * Shared by Observations and Series so the same number never renders two ways.
 * Display only: the underlying `value` is never rounded or mutated.
 */
const VALUE_FORMAT = new Intl.NumberFormat('en-GB', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
});

export function formatValue(value: number): string {
  return VALUE_FORMAT.format(value);
}

/**
 * The unit, with the scale beside it when the service gave one:
 * `National currency (Billions)`. The guide says to read unit "and sometimes
 * scale - never assume", and a value in billions shown as plain units is wrong
 * by nine orders of magnitude. Display only.
 */
export function unitLabel(unit: string, scale: string | null | undefined): string {
  const trimmed = scale?.trim() ?? '';
  return trimmed === '' ? unit : `${unit} (${trimmed})`;
}
