import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import type { Session } from './auth.provider';
import type { SavedQuery } from './saved-query';
import {
  SAVED_QUERIES_KEY,
  SAVED_QUERIES_URL,
  SAVED_QUERY_STORAGE,
  SavedQueryStore,
  type SavedQueryStorage
} from './saved-query.store';
import { SESSION_STORAGE, SessionStore } from './session.store';
import { SUPABASE_CLIENT } from './supabase/supabase.client';
import { DEFAULT_WORKING_QUERY, type WorkingQuery } from './working-query';

/** In-memory storage: the real localStorage would leak between runs. */
class FakeStorage implements SavedQueryStorage {
  readonly items = new Map<string, string>();
  failRemoves = false;

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  removeItem(key: string): void {
    if (this.failRemoves) {
      throw new DOMException('denied', 'SecurityError');
    }
    this.items.delete(key);
  }
}

/** One turn of the task queue, so awaited HTTP answers land. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve));
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

function person(email: string): Session {
  return { email, fullName: 'Thandi', organisation: 'Treasury Risk', role: 'Member' };
}

const MOVE_FAILED =
  "Could not move this browser's saved queries to your account. They are still here and will be tried again next time.";

describe('SavedQueryStore', () => {
  let storage: FakeStorage;
  let httpMock: HttpTestingController;
  let session: SessionStore;

  function build(storageValue: SavedQueryStorage | null = storage): SavedQueryStore {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SUPABASE_CLIENT, useValue: null },
        { provide: SESSION_STORAGE, useValue: null },
        { provide: SAVED_QUERY_STORAGE, useValue: storageValue }
      ]
    });

    httpMock = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionStore);
    return TestBed.inject(SavedQueryStore);
  }

  /** Signs someone in and lets the store's effect issue its first request. */
  function signIn(email = 'thandi@example.com'): void {
    session.signIn(person(email));
    TestBed.tick();
  }

  beforeEach(() => {
    storage = new FakeStorage();
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  it('stays idle and asks for nothing while nobody is signed in', () => {
    const store = build();
    TestBed.tick();

    expect(store.status()).toBe('idle');
    expect(store.saved()).toEqual([]);
  });

  describe('loading', () => {
    it('lists the account’s queries on sign-in', async () => {
      const store = build();
      signIn();

      expect(store.status()).toBe('loading');
      httpMock.expectOne({ method: 'GET', url: SAVED_QUERIES_URL }).flush({ data: [entry()] });
      await settle();

      expect(store.status()).toBe('ready');
      expect(store.saved()).toEqual([entry()]);
      expect(store.storageProblem()).toBeNull();
    });

    it('fails visibly when the list cannot be read', async () => {
      const store = build();
      signIn();

      httpMock
        .expectOne(SAVED_QUERIES_URL)
        .flush({ error: 'Saved queries could not be reached.' }, { status: 502, statusText: 'Bad Gateway' });
      await settle();

      expect(store.status()).toBe('failed');
      expect(store.saved()).toEqual([]);
    });

    it('drops malformed entries from the answer rather than half-rendering them', async () => {
      const store = build();
      signIn();

      httpMock.expectOne(SAVED_QUERIES_URL).flush({ data: [entry(), { name: 'broken' }] });
      await settle();

      expect(store.saved()).toEqual([entry()]);
    });

    it('empties on sign-out', async () => {
      const store = build();
      signIn();
      httpMock.expectOne(SAVED_QUERIES_URL).flush({ data: [entry()] });
      await settle();

      session.signOut();
      TestBed.tick();

      expect(store.status()).toBe('idle');
      expect(store.saved()).toEqual([]);
    });

    it('reloads for a different visitor and ignores the previous one’s late answer', async () => {
      const store = build();
      signIn('first@example.com');
      const first = httpMock.expectOne(SAVED_QUERIES_URL);

      signIn('second@example.com');
      const second = httpMock.expectOne(SAVED_QUERIES_URL);

      second.flush({ data: [entry({ name: 'Second’s' })] });
      first.flush({ data: [entry({ name: 'First’s' })] });
      await settle();

      expect(store.saved().map((held) => held.name)).toEqual(['Second’s']);
    });
  });

  describe('moving this browser’s queries into the account', () => {
    it('imports them, removes the local copy and shows the account’s list', async () => {
      storage.items.set(SAVED_QUERIES_KEY, JSON.stringify([entry()]));
      const store = build();
      signIn();

      const request = httpMock.expectOne({ method: 'POST', url: `${SAVED_QUERIES_URL}/import` });
      expect(request.request.body).toEqual({ data: [entry()] });
      request.flush({ data: [entry(), entry({ name: 'Already held' })] });
      await settle();

      expect(storage.items.has(SAVED_QUERIES_KEY)).toBeFalse();
      expect(store.saved().length).toBe(2);
      expect(store.status()).toBe('ready');
      expect(store.storageProblem()).toBeNull();
    });

    it('keeps the local copy, still lists, and says so when the move fails', async () => {
      storage.items.set(SAVED_QUERIES_KEY, JSON.stringify([entry()]));
      const store = build();
      signIn();

      httpMock
        .expectOne(`${SAVED_QUERIES_URL}/import`)
        .flush({ error: 'no' }, { status: 502, statusText: 'Bad Gateway' });
      await settle();
      httpMock.expectOne({ method: 'GET', url: SAVED_QUERIES_URL }).flush({ data: [] });
      await settle();

      expect(storage.items.has(SAVED_QUERIES_KEY)).toBeTrue();
      expect(store.status()).toBe('ready');
      expect(store.storageProblem()).toBe(MOVE_FAILED);
    });

    it('reports a browser that will not let go of the local copy', async () => {
      storage.items.set(SAVED_QUERIES_KEY, JSON.stringify([entry()]));
      storage.failRemoves = true;
      const store = build();
      signIn();

      httpMock.expectOne(`${SAVED_QUERIES_URL}/import`).flush({ data: [entry()] });
      await settle();

      expect(store.saved()).toEqual([entry()]);
      expect(store.storageProblem()).toBe(MOVE_FAILED);
    });

    it('sends only entries the API will accept', async () => {
      storage.items.set(
        SAVED_QUERIES_KEY,
        JSON.stringify([
          entry(),
          { name: 'no query' },
          entry({ name: '   ' }),
          entry({ name: 'bad time', savedAt: 'yesterday' })
        ])
      );
      build();
      signIn();

      const request = httpMock.expectOne(`${SAVED_QUERIES_URL}/import`);
      expect(request.request.body).toEqual({ data: [entry()] });
      request.flush({ data: [entry()] });
      await settle();
    });

    it('just lists when nothing is stored locally, or the stored value is unreadable', async () => {
      storage.items.set(SAVED_QUERIES_KEY, 'not json');
      build();
      signIn();

      httpMock.expectOne({ method: 'GET', url: SAVED_QUERIES_URL }).flush({ data: [] });
      await settle();
    });

    it('just lists when the browser has no usable storage', async () => {
      build(null);
      signIn();

      httpMock.expectOne({ method: 'GET', url: SAVED_QUERIES_URL }).flush({ data: [] });
      await settle();
    });
  });

  describe('saving', () => {
    async function ready(held: SavedQuery[] = []): Promise<SavedQueryStore> {
      const store = build();
      signIn();
      httpMock.expectOne(SAVED_QUERIES_URL).flush({ data: held });
      await settle();
      return store;
    }

    it('puts the trimmed entry and shows the server’s copy first, replacing that name', async () => {
      const store = await ready([entry({ name: 'Other' }), entry({ name: 'Q1' })]);

      const saving = store.save('  Q1  ', query({ countries: ['ZAF'] }), [14]);
      expect(store.saving()).toBeTrue();

      const request = httpMock.expectOne({ method: 'PUT', url: SAVED_QUERIES_URL });
      expect(request.request.body).toEqual({
        name: 'Q1',
        query: query({ countries: ['ZAF'] }),
        vintageIds: [14]
      });
      const stored = entry({ name: 'Q1', vintageIds: [14], savedAt: '2026-10-06T09:00:00.000Z' });
      request.flush({ data: stored });

      expect(await saving).toBeTrue();
      expect(store.saving()).toBeFalse();
      expect(store.saved().map((held) => held.name)).toEqual(['Q1', 'Other']);
      expect(store.saved()[0]).toEqual(stored);
    });

    it('leaves the list alone and says so when the save fails', async () => {
      const store = await ready([entry()]);

      const saving = store.save('New', query(), []);
      httpMock
        .expectOne(SAVED_QUERIES_URL)
        .flush({ error: 'no' }, { status: 502, statusText: 'Bad Gateway' });

      expect(await saving).toBeFalse();
      expect(store.saved()).toEqual([entry()]);
      expect(store.storageProblem()).toBe('Could not save the query. Try again.');
      expect(store.saving()).toBeFalse();
    });

    it('clears a refused save when the name is edited', async () => {
      const store = await ready();

      const saving = store.save('New', query(), []);
      httpMock.expectOne(SAVED_QUERIES_URL).flush({}, { status: 500, statusText: 'Error' });
      await saving;

      store.clearWriteProblem();
      expect(store.storageProblem()).toBeNull();
    });

    it('refuses a blank name and anything before the list has loaded', async () => {
      const store = build();

      expect(await store.save('Q1', query(), [])).toBeFalse();

      signIn();
      expect(await store.save('Q1', query(), [])).toBeFalse();
      httpMock.expectOne(SAVED_QUERIES_URL).flush({ data: [] });
      await settle();

      expect(await store.save('   ', query(), [])).toBeFalse();
    });
  });
});
