import { Injectable, signal } from '@angular/core';

import type { EnvelopeMeta } from './macro-contracts';
import { type WorkingQuery, sameWorkingQuery } from './working-query';

/** Which route answered. `/series` counts series in `totalCount`, not rows. */
export type ResultSource = 'observations' | 'series';

interface Observed {
  readonly query: WorkingQuery;
  readonly meta: EnvelopeMeta;
  readonly source: ResultSource;
}

/**
 * The `meta` of the last result that actually settled, alongside the query that
 * produced it.
 *
 * Two consumers need it and neither can ask for it themselves. Saved queries
 * record vintage ids so a result can be reproduced exactly, and those ids have
 * to come from a result the user actually saw. The Export card shows the row
 * count of the result it is about to download, which is `totalCount` and never
 * the length of a page. Nothing else in the console keeps a result's
 * provenance: the store holds the query, and each result tab holds only its own
 * answer.
 *
 * **The query is stored with the meta on purpose.** Numbers alone would be read
 * as belonging to whatever query is current when they are asked for, so editing
 * a filter and reading before the new answer lands would report the previous
 * query's provenance — a claim it never earned. Both readers below hand back
 * nothing unless the query matches the one that produced the answer.
 */
@Injectable({ providedIn: 'root' })
export class LastResultMeta {
  private readonly observed = signal<Observed | null>(null);

  /** Called when a working-query result settles. Failures publish nothing. */
  record(query: WorkingQuery, meta: EnvelopeMeta, source: ResultSource = 'observations'): void {
    this.observed.set({ query, meta: { ...meta, vintages: [...meta.vintages] }, source });
  }

  /**
   * The meta observed for exactly this query, or null.
   *
   * Null is the honest answer for "no result seen yet" and for "seen, but for a
   * different query". Callers render that as an unknown, never as a zero.
   */
  metaFor(query: WorkingQuery): EnvelopeMeta | null {
    const observed = this.observed();

    return observed !== null && sameWorkingQuery(observed.query, query) ? observed.meta : null;
  }

  /**
   * The vintage ids observed for exactly this query, or an empty array.
   *
   * A saved entry with no ids simply cannot be reproduced, which the UI says
   * plainly.
   */
  idsFor(query: WorkingQuery): number[] {
    return this.metaFor(query)?.vintages.map((vintage) => vintage.id) ?? [];
  }

  /**
   * How many rows exactly this query returns, or null.
   *
   * Only an `/observations` answer knows: `/series` pages series, so its
   * `totalCount` is a series count. After the Series tab the honest answer is
   * "unknown", not a smaller number. Vintage ids above have no such caveat:
   * either route's answer is provenance for the query.
   */
  rowCountFor(query: WorkingQuery): number | null {
    const observed = this.observed();

    return observed !== null &&
      observed.source === 'observations' &&
      sameWorkingQuery(observed.query, query)
      ? observed.meta.totalCount
      : null;
  }
}
