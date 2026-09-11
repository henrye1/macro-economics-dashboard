import { InjectionToken, Injectable, computed, inject, signal } from '@angular/core';

import type { SavedQuery } from './saved-query';
import { DEFAULT_WORKING_QUERY, type WorkingQuery } from './working-query';

/**
 * Namespaced so it cannot collide on a shared origin, and versioned so feature
 * 16's migration to Supabase has something it can recognise.
 */
export const SAVED_QUERIES_KEY = 'cyte.macro.saved-queries.v1';

/** The slice of `Storage` this store uses. */
export interface SavedQueryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Overridden in specs so they never touch the browser's own storage, which
 * would leak state between runs. Null means no usable storage, as a private
 * mode can produce.
 */
export const SAVED_QUERY_STORAGE = new InjectionToken<SavedQueryStorage | null>(
  'SAVED_QUERY_STORAGE',
  { providedIn: 'root', factory: readableStorage }
);

/** `savedAt` is nondeterministic, so it comes through a seam. */
export const SAVED_QUERY_CLOCK = new InjectionToken<() => string>('SAVED_QUERY_CLOCK', {
  providedIn: 'root',
  factory: () => () => new Date().toISOString()
});

/**
 * Saved queries, kept in this browser.
 *
 * Per-browser and anonymous, which is honest for a console with no users. The
 * overview locks the stored shape because feature 16 copies it to Supabase
 * rather than redesigning it.
 */
@Injectable({ providedIn: 'root' })
export class SavedQueryStore {
  private readonly storage = inject(SAVED_QUERY_STORAGE);
  private readonly now = inject(SAVED_QUERY_CLOCK);

  private readonly entries = signal<readonly SavedQuery[]>([]);
  private readonly failure = signal<string | null>(null);

  /** Newest first, as the design lists them. */
  readonly saved = this.entries.asReadonly();

  /** Set when storage could not be read or written. Null when all is well. */
  readonly storageProblem = this.failure.asReadonly();

  readonly isEmpty = computed(() => this.entries().length === 0);

  constructor() {
    if (this.storage === null) {
      this.failure.set('This browser is not allowing saved queries to be stored.');
      return;
    }

    this.entries.set(this.read(this.storage));
  }

  /**
   * Saves under `name`, replacing any entry already using it.
   *
   * Replace rather than append: names are the only handle a user has and the
   * design offers no delete, so re-saving a name means "update it". A second
   * entry with the same name would be unreachable by any other means.
   */
  save(name: string, query: WorkingQuery, vintageIds: readonly number[]): void {
    const trimmed = name.trim();
    if (trimmed === '' || this.storage === null) {
      return;
    }

    const entry: SavedQuery = {
      name: trimmed,
      query: { ...query, indicators: [...query.indicators], countries: [...query.countries] },
      vintageIds: [...vintageIds],
      savedAt: this.now()
    };

    const next = [entry, ...this.entries().filter((held) => held.name !== trimmed)];

    try {
      this.storage.setItem(SAVED_QUERIES_KEY, JSON.stringify(next));
    } catch {
      // Quota, or a browser refusing writes. The page stays usable and says so
      // rather than losing the list it already has.
      this.failure.set('Could not save: this browser refused to store the query.');
      return;
    }

    this.failure.set(null);
    this.entries.set(next);
  }

  /**
   * Drops a refused-write message so the next attempt can reach storage.
   *
   * Called when the user edits the name, which is the only gesture the design
   * offers for "try that again". Without it the card latches: `save` sets
   * `failure`, the page disables Save while `storageProblem()` is set, and the
   * only write that could clear the flag is the one the flag prevents.
   *
   * No usable storage at all is a different thing and stays latched: clearing
   * it would enable a Save that cannot ever succeed. A read that threw is
   * cleared, because a browser that refused a read may still accept a write,
   * and if it does not, `save` sets the message again with a current answer.
   */
  clearWriteProblem(): void {
    if (this.storage === null) {
      return;
    }

    this.failure.set(null);
  }

  /**
   * Everything in storage is untrusted: a user can edit it by hand and a future
   * version can write a different shape. Unreadable values and malformed
   * entries are dropped rather than thrown or half-rendered.
   */
  private read(storage: SavedQueryStorage): readonly SavedQuery[] {
    let raw: string | null;
    try {
      raw = storage.getItem(SAVED_QUERIES_KEY);
    } catch {
      this.failure.set('This browser is not allowing saved queries to be read.');
      return [];
    }

    if (raw === null) {
      return [];
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }

    return Array.isArray(parsed) ? parsed.filter(isSavedQuery) : [];
  }
}

/** Null when the browser has no usable storage, as private modes can. */
function readableStorage(): SavedQueryStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

/**
 * Structural check against the locked shape.
 *
 * Deliberately exhaustive over `WorkingQuery`: an entry missing a field would
 * otherwise reach the store as a partial object and produce a query the rest of
 * the console cannot run.
 */
function isSavedQuery(value: unknown): value is SavedQuery {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const entry = value as Partial<SavedQuery>;

  if (typeof entry.name !== 'string' || typeof entry.savedAt !== 'string') {
    return false;
  }

  if (!Array.isArray(entry.vintageIds) || !entry.vintageIds.every(Number.isInteger)) {
    return false;
  }

  const query = entry.query as Partial<WorkingQuery> | undefined;
  if (typeof query !== 'object' || query === null) {
    return false;
  }

  return (
    isStringArray(query.indicators) &&
    isStringArray(query.countries) &&
    isNullableNumber(query.yearFrom) &&
    isNullableNumber(query.yearTo) &&
    typeof query.source === 'string' &&
    typeof query.forecast === 'string' &&
    (typeof query.vintage === 'string' || typeof query.vintage === 'number') &&
    typeof query.page === 'number' &&
    typeof query.pageSize === 'number' &&
    Object.keys(DEFAULT_WORKING_QUERY).every((key) => key in query)
  );
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || typeof value === 'number';
}
