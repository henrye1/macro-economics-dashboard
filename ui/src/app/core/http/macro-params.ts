import { HttpParams } from '@angular/common/http';

/**
 * A value the macro query string can carry.
 *
 * Arrays are the interesting case: `CONSUMER-GUIDE.md` section 4.3 documents
 * `indicators` as a "csv of canonical codes" and `countries` as a "csv of
 * ISO3", and its worked example is
 * `?indicators=GDP_GROWTH_REAL,CPI_INFLATION_AVG&countries=ZAF,NAM`. Repeated
 * keys are a different request, and the live service answers them with a `400`.
 */
export type MacroParamValue =
  | string
  | number
  | boolean
  | readonly string[]
  | readonly number[]
  | null
  | undefined;

export type MacroQuery = Readonly<Record<string, MacroParamValue>>;

/**
 * Serialises a macro query object into `HttpParams`.
 *
 * The whole contract, and nothing beyond it:
 *
 * - An array joins with commas into **one** value for its key. `HttpParams.append`
 *   is never used, so a key can never be emitted twice.
 * - An empty array is omitted entirely. The service reads an empty
 *   `countries=` as a filter that matches nothing, not as "all countries".
 * - `undefined` and `null` are omitted. Both mean "unbounded" or "not asked" in
 *   `ObservationsQuery`, and the service's own default is the right answer.
 * - Numbers and booleans stringify, so `curated: false` emits `curated=false`
 *   rather than an empty value.
 *
 * No key is renamed, no value is encoded by hand, and no parameter is added.
 * `HttpParams` owns the percent-encoding.
 *
 * The self-referential constraint means a query type is only accepted when
 * every one of its properties is serialisable, so a future contract field of an
 * unhandled shape fails to compile rather than being dropped at runtime.
 */
export function toMacroParams<T extends { [K in keyof T]: MacroParamValue }>(
  query?: T
): HttpParams {
  if (query === undefined) {
    return new HttpParams();
  }

  const fromObject: Record<string, string> = {};

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) {
      continue;
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        continue;
      }

      fromObject[key] = value.join(',');
      continue;
    }

    fromObject[key] = String(value);
  }

  return new HttpParams({ fromObject });
}
