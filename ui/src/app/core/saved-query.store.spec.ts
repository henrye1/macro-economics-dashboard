import { TestBed } from '@angular/core/testing';

import type { SavedQuery } from './saved-query';
import {
  SAVED_QUERIES_KEY,
  SAVED_QUERY_CLOCK,
  SAVED_QUERY_STORAGE,
  SavedQueryStore,
  type SavedQueryStorage
} from './saved-query.store';
import { DEFAULT_WORKING_QUERY, type WorkingQuery } from './working-query';

/** In-memory storage: the real localStorage would leak between runs. */
class FakeStorage implements SavedQueryStorage {
  readonly items = new Map<string, string>();
  failReads = false;
  failWrites = false;

  getItem(key: string): string | null {
    if (this.failReads) {
      throw new DOMException('denied', 'SecurityError');
    }
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) {
      throw new DOMException('quota', 'QuotaExceededError');
    }
    this.items.set(key, value);
  }
}

function query(overrides: Partial<WorkingQuery> = {}): WorkingQuery {
  return { ...DEFAULT_WORKING_QUERY, indicators: ['GDP_GROWTH_REAL'], ...overrides };
}

function entry(overrides: Partial<SavedQuery> = {}): SavedQuery {
  return {
    name: 'Q4 2025 ECL',
    query: query(),
    vintageIds: [12],
    savedAt: '2025-10-14T00:00:00.000Z',
    ...overrides
  };
}

describe('SavedQueryStore', () => {
  let storage: FakeStorage;
  let clock: string;

  function build(storageValue: SavedQueryStorage | null = storage): SavedQueryStore {
    TestBed.configureTestingModule({
      providers: [
        { provide: SAVED_QUERY_STORAGE, useValue: storageValue },
        { provide: SAVED_QUERY_CLOCK, useValue: () => clock },
        SavedQueryStore
      ]
    });
    return TestBed.inject(SavedQueryStore);
  }

  beforeEach(() => {
    storage = new FakeStorage();
    clock = '2026-01-02T03:04:05.000Z';
  });

  afterEach(() => TestBed.resetTestingModule());

  describe('reading', () => {
    it('starts empty when nothing has been saved', () => {
      const store = build();

      expect(store.saved()).toEqual([]);
      expect(store.isEmpty()).toBeTrue();
      expect(store.storageProblem()).toBeNull();
    });

    it('round-trips entries through JSON', () => {
      storage.items.set(SAVED_QUERIES_KEY, JSON.stringify([entry()]));
      const store = build();

      expect(store.saved().length).toBe(1);
      expect(store.saved()[0].name).toBe('Q4 2025 ECL');
      expect(store.saved()[0].query.indicators).toEqual(['GDP_GROWTH_REAL']);
    });

    describe('treats storage as untrusted', () => {
      const rejected: readonly [string, string][] = [
        ['unparseable JSON', '{not json'],
        ['a bare string', '"hello"'],
        ['a number', '42'],
        ['null', 'null'],
        ['an object rather than an array', '{"name":"x"}']
      ];

      for (const [label, raw] of rejected) {
        it(`reads ${label} as an empty list rather than throwing`, () => {
          storage.items.set(SAVED_QUERIES_KEY, raw);

          expect(() => build()).not.toThrow();
          expect(TestBed.inject(SavedQueryStore).saved()).toEqual([]);
        });
      }

      it('drops entries of the wrong shape and keeps the good ones', () => {
        storage.items.set(
          SAVED_QUERIES_KEY,
          JSON.stringify([
            entry({ name: 'good' }),
            { name: 'no query' },
            { ...entry(), vintageIds: ['12'] },
            { ...entry(), query: { indicators: ['A'] } },
            { ...entry(), savedAt: 1234 },
            null,
            'nonsense'
          ])
        );
        const store = build();

        expect(store.saved().map((held) => held.name)).toEqual(['good']);
      });

      it('rejects a query missing a field, which would not be runnable', () => {
        const { pageSize: _dropped, ...partial } = query();
        storage.items.set(
          SAVED_QUERIES_KEY,
          JSON.stringify([{ ...entry(), query: partial }])
        );

        expect(build().saved()).toEqual([]);
      });
    });

    it('reports a read that throws, rather than crashing', () => {
      storage.failReads = true;
      const store = build();

      expect(store.saved()).toEqual([]);
      expect(store.storageProblem()).toContain('not allowing');
    });

    it('reports having no usable storage at all', () => {
      const store = build(null);

      expect(store.saved()).toEqual([]);
      expect(store.storageProblem()).toContain('not allowing');
    });
  });

  describe('saving', () => {
    it('writes an entry and keeps it in the signal', () => {
      const store = build();
      store.save('Q1 2026 ECL', query(), [12]);

      expect(store.saved().length).toBe(1);
      expect(store.saved()[0]).toEqual({
        name: 'Q1 2026 ECL',
        query: query(),
        vintageIds: [12],
        savedAt: clock
      });
      expect(storage.items.get(SAVED_QUERIES_KEY)).toContain('Q1 2026 ECL');
    });

    it('takes savedAt from the injected clock', () => {
      const store = build();
      store.save('a', query(), []);

      expect(store.saved()[0].savedAt).toBe('2026-01-02T03:04:05.000Z');
    });

    it('lists the newest first', () => {
      const store = build();
      store.save('first', query(), []);
      clock = '2026-02-02T00:00:00.000Z';
      store.save('second', query(), []);

      expect(store.saved().map((held) => held.name)).toEqual(['second', 'first']);
    });

    it('replaces an entry of the same name rather than appending', () => {
      const store = build();
      store.save('Q4 2025 ECL', query({ countries: ['ZAF'] }), [2]);
      clock = '2026-03-03T00:00:00.000Z';
      store.save('Q4 2025 ECL', query({ countries: ['NAM'] }), [12]);

      expect(store.saved().length).toBe(1);
      expect(store.saved()[0].query.countries).toEqual(['NAM']);
      expect(store.saved()[0].vintageIds).toEqual([12]);
      expect(store.saved()[0].savedAt).toBe('2026-03-03T00:00:00.000Z');
    });

    it('trims the name and matches the replacement on the trimmed form', () => {
      const store = build();
      store.save('  Padded  ', query(), []);
      store.save('Padded', query({ countries: ['ZAF'] }), []);

      expect(store.saved().length).toBe(1);
      expect(store.saved()[0].name).toBe('Padded');
    });

    it('ignores a blank name', () => {
      const store = build();
      store.save('   ', query(), [12]);

      expect(store.saved()).toEqual([]);
    });

    it('copies the query, so a later mutation cannot reach the saved entry', () => {
      const store = build();
      const indicators = ['A'];
      const live = query({ indicators, countries: ['ZAF'] });
      store.save('a', live, []);

      // The caller still holds the array it passed in.
      indicators.push('B');

      expect(store.saved()[0].query.indicators).toEqual(['A']);
    });

    it('records an empty id list when none were observed', () => {
      const store = build();
      store.save('a', query(), []);

      expect(store.saved()[0].vintageIds).toEqual([]);
    });

    it('reports a write that throws and keeps the existing list', () => {
      const store = build();
      store.save('kept', query(), []);
      storage.failWrites = true;

      store.save('rejected', query(), []);

      expect(store.storageProblem()).toContain('refused to store');
      expect(store.saved().map((held) => held.name)).toEqual(['kept']);
    });

    it('clears a previous problem once a save succeeds', () => {
      const store = build();
      storage.failWrites = true;
      store.save('rejected', query(), []);
      expect(store.storageProblem()).not.toBeNull();

      storage.failWrites = false;
      store.save('accepted', query(), []);

      expect(store.storageProblem()).toBeNull();
    });

    it('does nothing when there is no usable storage', () => {
      const store = build(null);
      store.save('a', query(), []);

      expect(store.saved()).toEqual([]);
    });
  });

  describe('clearWriteProblem', () => {
    it('drops a refused write, so the next attempt can reach storage', () => {
      const store = build();
      storage.failWrites = true;
      store.save('rejected', query(), []);
      expect(store.storageProblem()).toContain('refused to store');

      store.clearWriteProblem();

      expect(store.storageProblem()).toBeNull();
    });

    it('keeps the message when there is no usable storage at all', () => {
      // Clearing here would enable a Save that cannot ever succeed.
      const store = build(null);

      store.clearWriteProblem();

      expect(store.storageProblem()).toContain('not allowing');
    });

    it('does not disturb the saved list', () => {
      const store = build();
      store.save('kept', query(), []);
      storage.failWrites = true;
      store.save('rejected', query(), []);

      store.clearWriteProblem();

      expect(store.saved().map((held) => held.name)).toEqual(['kept']);
    });
  });
});
