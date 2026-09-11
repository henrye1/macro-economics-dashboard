import type { Envelope, Observation } from '../macro-contracts';

/**
 * The envelope verbatim, `data` and `meta` together.
 *
 * No reshaping and no option to drop `meta`: the provider contract says
 * implementations must not reshape, and `meta.vintages` is exactly what the
 * Integration habit card tells the reader to record alongside their results.
 * That is why the Export card's pin checkbox is inert for this format rather
 * than offering a choice the file cannot honour.
 */
export function toJson(envelope: Envelope<Observation>): string {
  return JSON.stringify(envelope, null, 2);
}
