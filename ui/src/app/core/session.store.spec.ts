import { TestBed } from '@angular/core/testing';

import type { Session } from './auth.provider';
import { SESSION_KEY, SESSION_STORAGE, SessionStore, type SessionStorage } from './session.store';

const SESSION: Session = {
  email: 'thandi.mokoena@cyte.co.za',
  fullName: 'Thandi Mokoena',
  organisation: 'Treasury Risk',
  role: 'Administrator'
};

class MemoryStorage implements SessionStorage {
  constructor(private readonly entries = new Map<string, string>()) {}

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.entries.set(key, value);
  }

  removeItem(key: string): void {
    this.entries.delete(key);
  }
}

function storeWith(storage: SessionStorage | null): SessionStore {
  TestBed.configureTestingModule({
    providers: [{ provide: SESSION_STORAGE, useValue: storage }]
  });

  return TestBed.inject(SessionStore);
}

describe('SessionStore', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('starts signed out when storage holds nothing', () => {
    const store = storeWith(new MemoryStorage());

    expect(store.session()).toBeNull();
    expect(store.signedIn()).toBeFalse();
  });

  it('round trips a session through storage', () => {
    const storage = new MemoryStorage();
    storeWith(storage).signIn(SESSION);
    TestBed.resetTestingModule();

    const reloaded = storeWith(storage);

    expect(reloaded.session()).toEqual(SESSION);
    expect(reloaded.signedIn()).toBeTrue();
  });

  it('clears both the signal and storage on sign out', () => {
    const storage = new MemoryStorage();
    const store = storeWith(storage);
    store.signIn(SESSION);

    store.signOut();

    expect(store.session()).toBeNull();
    expect(storage.getItem(SESSION_KEY)).toBeNull();
  });

  it('treats unparseable stored text as signed out rather than crashing', () => {
    const storage = new MemoryStorage(new Map([[SESSION_KEY, '{not json']]));

    expect(storeWith(storage).session()).toBeNull();
  });

  it('treats a session missing a field as signed out', () => {
    const storage = new MemoryStorage(
      new Map([[SESSION_KEY, JSON.stringify({ email: 'a@b.c', fullName: 'A' })]])
    );

    expect(storeWith(storage).session()).toBeNull();
  });

  it('treats stored JSON that is not an object as signed out', () => {
    for (const raw of ['null', '"a string"', '42', '[]']) {
      TestBed.resetTestingModule();
      const storage = new MemoryStorage(new Map([[SESSION_KEY, raw]]));

      expect(storeWith(storage).session()).withContext(raw).toBeNull();
    }
  });

  it('survives a browser with no usable storage', () => {
    const store = storeWith(null);
    store.signIn(SESSION);

    // The signal still holds it for this page; only persistence is lost.
    expect(store.session()).toEqual(SESSION);
    expect(() => store.signOut()).not.toThrow();
  });

  it('survives storage that throws on every call', () => {
    const hostile: SessionStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      }
    };

    const store = storeWith(hostile);

    expect(store.session()).toBeNull();
    expect(() => store.signIn(SESSION)).not.toThrow();
    expect(store.session()).toEqual(SESSION);
    expect(() => store.signOut()).not.toThrow();
    expect(store.session()).toBeNull();
  });
});
