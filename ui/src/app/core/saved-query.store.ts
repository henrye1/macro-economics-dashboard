import { HttpClient } from '@angular/common/http';
import {
  InjectionToken,
  Injectable,
  computed,
  effect,
  inject,
  signal,
  untracked
} from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { SavedQuery } from './saved-query';
import { SessionStore } from './session.store';
import { DEFAULT_WORKING_QUERY, type WorkingQuery } from './working-query';

/**
 * Where feature 10 kept saved queries in this browser. Feature 16 only reads it,
 * to move what is there into the account, and removes it once that worked.
 */
export const SAVED_QUERIES_KEY = 'cyte.macro.saved-queries.v1';

/** The visitor's own saved queries. The API scopes them to the verified caller. */
export const SAVED_QUERIES_URL = '/api/saved-queries';

/** The slice of `Storage` this store uses. */
export interface SavedQueryStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
}

/**
 * Overridden in specs so they never touch the browser's own storage, which
 * would leak state between runs. Null means no usable storage, as a private
 * mode can produce, and then there is simply nothing to migrate.
 */
export const SAVED_QUERY_STORAGE = new InjectionToken<SavedQueryStorage | null>(
  'SAVED_QUERY_STORAGE',
  { providedIn: 'root', factory: readableStorage }
);

export type SavedQueryStatus = 'idle' | 'loading' | 'ready' | 'failed';

const MOVE_FAILED =
  "Could not move this browser's saved queries to your account. They are still here and will be tried again next time.";
export const SAVE_FAILED = 'Could not save the query. Try again.';

/**
 * Saved queries, kept in the signed-in account.
 *
 * Loads whenever a session appears or changes hands, and empties on sign-out,
 * so one visitor's list is never shown to the next. On each load, anything
 * feature 10 left in this browser is copied to the account first and then
 * removed here; the account's own version wins on a name clash, which makes a
 * retried move harmless.
 */
@Injectable({ providedIn: 'root' })
export class SavedQueryStore {
  private readonly http = inject(HttpClient);
  private readonly storage = inject(SAVED_QUERY_STORAGE);
  private readonly session = inject(SessionStore);

  private readonly entries = signal<readonly SavedQuery[]>([]);
  private readonly failure = signal<string | null>(null);
  private readonly state = signal<SavedQueryStatus>('idle');
  private readonly writing = signal(false);

  /** Who the current list belongs to, by verified email. Null when signed out. */
  private loadedFor: string | null = null;

  /** Bumped per owner, so an answer for a previous visitor is dropped. */
  private generation = 0;

  /** Newest first, as the design lists them. */
  readonly saved = this.entries.asReadonly();

  /** Set when a move or a save failed. Null when all is well. */
  readonly storageProblem = this.failure.asReadonly();

  readonly status = this.state.asReadonly();

  readonly saving = this.writing.asReadonly();

  readonly isEmpty = computed(() => this.entries().length === 0);

  constructor() {
    effect(() => {
      const email = this.session.session()?.email ?? null;

      untracked(() => this.follow(email));
    });
  }

  /**
   * Saves under `name`, replacing any entry already using it.
   *
   * The server stamps `savedAt`. True once the account holds it; false, with
   * the list untouched and the problem set, when it does not.
   */
  async save(name: string, query: WorkingQuery, vintageIds: readonly number[]): Promise<boolean> {
    const trimmed = name.trim();
    if (trimmed === '' || this.state() !== 'ready' || this.writing()) {
      return false;
    }

    const generation = this.generation;
    this.writing.set(true);

    try {
      const response = await firstValueFrom(
        this.http.put<{ data: unknown }>(SAVED_QUERIES_URL, {
          name: trimmed,
          query: { ...query, indicators: [...query.indicators], countries: [...query.countries] },
          vintageIds: [...vintageIds]
        })
      );

      if (generation !== this.generation) {
        return false;
      }

      if (!isSavedQuery(response.data)) {
        throw new Error('Unexpected saved query response.');
      }

      const entry = response.data;
      this.entries.set([entry, ...this.entries().filter((held) => held.name !== entry.name)]);
      this.failure.set(null);
      return true;
    } catch {
      if (generation === this.generation) {
        this.failure.set(SAVE_FAILED);
      }
      return false;
    } finally {
      if (generation === this.generation) {
        this.writing.set(false);
      }
    }
  }

  /**
   * Drops a refused-save message so the next attempt can go.
   *
   * Called when the user edits the name, the only "try again" gesture the
   * design offers. A failed move stays reported: editing a name does not
   * retry it, the next load does.
   */
  clearWriteProblem(): void {
    if (this.failure() === SAVE_FAILED) {
      this.failure.set(null);
    }
  }

  private follow(email: string | null): void {
    if (email === this.loadedFor) {
      return;
    }

    this.loadedFor = email;
    this.generation += 1;
    this.entries.set([]);
    this.failure.set(null);
    this.writing.set(false);

    if (email === null) {
      this.state.set('idle');
      return;
    }

    void this.load(this.generation);
  }

  private async load(generation: number): Promise<void> {
    this.state.set('loading');

    const local = this.readLocal();

    if (local.length > 0) {
      try {
        const moved = await firstValueFrom(
          this.http.post<{ data: unknown }>(`${SAVED_QUERIES_URL}/import`, { data: local })
        );

        if (generation !== this.generation) {
          return;
        }

        this.settle(moved.data);

        try {
          this.storage?.removeItem(SAVED_QUERIES_KEY);
        } catch {
          // The account has them; this browser would not let go. The next
          // load moves them again and the account's copies win.
          this.failure.set(MOVE_FAILED);
        }
        return;
      } catch {
        if (generation !== this.generation) {
          return;
        }

        // Kept locally for next time, and the account's list still shows.
        this.failure.set(MOVE_FAILED);
      }
    }

    try {
      const listed = await firstValueFrom(this.http.get<{ data: unknown }>(SAVED_QUERIES_URL));

      if (generation === this.generation) {
        this.settle(listed.data);
      }
    } catch {
      if (generation === this.generation) {
        this.state.set('failed');
      }
    }
  }

  /** Our own API's answer, still checked: a half-shaped entry cannot be run. */
  private settle(data: unknown): void {
    if (!Array.isArray(data)) {
      this.state.set('failed');
      return;
    }

    this.entries.set(data.filter(isSavedQuery));
    this.state.set('ready');
  }

  /**
   * Everything in storage is untrusted: a user can edit it by hand and an older
   * version can have written a different shape. Unreadable values and malformed
   * entries are left out of the move rather than sent.
   */
  private readLocal(): SavedQuery[] {
    if (this.storage === null) {
      return [];
    }

    let raw: string | null;
    try {
      raw = this.storage.getItem(SAVED_QUERIES_KEY);
    } catch {
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

    return Array.isArray(parsed) ? parsed.filter(isSavedQuery).filter(isMovable) : [];
  }
}

/** `toISOString()` output, or any ISO-8601 instant with an offset, as the API requires. */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * The few things the API checks that `isSavedQuery` does not. Feature 10 always
 * wrote entries that pass, but storage is hand-editable, and one entry the API
 * refuses would fail the whole move on every visit. Such an entry is left
 * behind rather than sent.
 */
function isMovable(entry: SavedQuery): boolean {
  return (
    entry.name.trim() !== '' &&
    ISO_INSTANT.test(entry.savedAt) &&
    entry.vintageIds.every(Number.isSafeInteger)
  );
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
 * the console cannot run. The API's schema mirrors this check, so anything that
 * passes here is accepted there.
 */
export function isSavedQuery(value: unknown): value is SavedQuery {
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
