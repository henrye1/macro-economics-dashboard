import { TestBed } from '@angular/core/testing';
import type { AuthChangeEvent, Session as SupabaseSession, SupabaseClient, User } from '@supabase/supabase-js';

import type { Session } from './auth.provider';
import {
  LEGACY_SESSION_KEY,
  SESSION_STORAGE,
  SessionStore,
  type SessionStorage
} from './session.store';
import { SUPABASE_CLIENT } from './supabase/supabase.client';

const SESSION: Session = {
  email: 'thandi.mokoena@cyte.co.za',
  fullName: 'Thandi Mokoena',
  organisation: 'Treasury Risk',
  role: 'Administrator'
};

function user(overrides: Partial<User> = {}): User {
  return {
    id: 'c2a1',
    email: 'thandi.mokoena@cyte.co.za',
    app_metadata: { role: 'Administrator', organisation: 'Treasury Risk' },
    user_metadata: { full_name: 'Thandi Mokoena' },
    aud: 'authenticated',
    created_at: '2026-09-01T09:00:00.000Z',
    ...overrides
  } as User;
}

class MemoryStorage implements SessionStorage {
  constructor(readonly entries = new Map<string, string>()) {}

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

interface ClientStub {
  getSession: jasmine.Spy;
  signOut: jasmine.Spy;
  onAuthStateChange: jasmine.Spy;
  /** Fires whatever the client would have fired, once the store has subscribed. */
  emit(event: AuthChangeEvent, session: SupabaseSession | null): void;
}

function clientStub(overrides: Partial<ClientStub> = {}): ClientStub {
  let listener: ((event: AuthChangeEvent, session: SupabaseSession | null) => void) | null = null;

  const stub: ClientStub = {
    getSession: jasmine.createSpy('getSession').and.resolveTo({ data: { session: null }, error: null }),
    signOut: jasmine.createSpy('signOut').and.resolveTo({ error: null }),
    onAuthStateChange: jasmine.createSpy('onAuthStateChange').and.callFake((fn: never) => {
      listener = fn;
      return { data: { subscription: { unsubscribe: () => undefined } } };
    }),
    emit: (event, session) => listener?.(event, session),
    ...overrides
  };

  return stub;
}

function make(options: { client?: ClientStub | null; storage?: SessionStorage | null } = {}) {
  const client = options.client === undefined ? clientStub() : options.client;

  TestBed.configureTestingModule({
    providers: [
      { provide: SESSION_STORAGE, useValue: options.storage ?? new MemoryStorage() },
      {
        provide: SUPABASE_CLIENT,
        useValue: client === null ? null : ({ auth: client } as unknown as SupabaseClient)
      }
    ]
  });

  return { client, store: TestBed.inject(SessionStore) };
}

/** A Supabase session as the client hands one back. */
function supabaseSession(withUser: User = user()): SupabaseSession {
  return { access_token: 'jwt', user: withUser } as SupabaseSession;
}

describe('SessionStore', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('starts signed out when the client has no session', async () => {
    const { store } = make();
    await store.ready;

    expect(store.session()).toBeNull();
    expect(store.signedIn()).toBeFalse();
  });

  it('hydrates from a session the client restored', async () => {
    const { store } = make({
      client: clientStub({
        getSession: jasmine
          .createSpy()
          .and.resolveTo({ data: { session: supabaseSession() }, error: null })
      })
    });
    await store.ready;

    expect(store.session()).toEqual(SESSION);
    expect(store.signedIn()).toBeTrue();
  });

  it('takes the organisation and role from app_metadata, not from the visitor', async () => {
    const { store } = make({
      client: clientStub({
        getSession: jasmine.createSpy().and.resolveTo({
          data: {
            session: supabaseSession(
              user({
                app_metadata: { role: 'Member', organisation: 'Treasury Risk' },
                user_metadata: { full_name: 'Thandi Mokoena', role: 'Administrator' }
              })
            )
          },
          error: null
        })
      })
    });
    await store.ready;

    expect(store.session()?.role).toBe('Member');
  });

  it('is signed out, not broken, when reading the session throws', async () => {
    const { store } = make({
      client: clientStub({ getSession: jasmine.createSpy().and.rejectWith(new Error('nope')) })
    });
    await store.ready;

    expect(store.session()).toBeNull();
  });

  it('is signed out when this build has no project at all', async () => {
    const { store } = make({ client: null });
    await store.ready;

    expect(store.session()).toBeNull();
    expect(store.signedIn()).toBeFalse();
  });

  describe('the entry feature 19 used to keep', () => {
    it('is deleted on boot, so it cannot sign anybody in', async () => {
      const storage = new MemoryStorage(
        new Map([[LEGACY_SESSION_KEY, JSON.stringify(SESSION)]])
      );

      const { store } = make({ storage });
      await store.ready;

      expect(storage.getItem(LEGACY_SESSION_KEY)).toBeNull();
      // The whole point: a hand-written entry is no longer a way in.
      expect(store.signedIn()).toBeFalse();
    });

    it('survives storage that refuses to remove it', async () => {
      const refusing: SessionStorage = {
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => {
          throw new Error('denied');
        }
      };

      const { store } = make({ storage: refusing });

      await expectAsync(store.ready).toBeResolved();
      expect(store.signedIn()).toBeFalse();
    });

    it('does nothing when there is no usable storage', async () => {
      const { store } = make({ storage: null });

      await expectAsync(store.ready).toBeResolved();
    });
  });

  describe('following the client', () => {
    it('signs in when the client reports a session', async () => {
      const { client, store } = make();
      await store.ready;

      client!.emit('SIGNED_IN', supabaseSession());

      expect(store.session()).toEqual(SESSION);
    });

    it('signs out when the client drops the session, as another tab can', async () => {
      const { client, store } = make({
        client: clientStub({
          getSession: jasmine
            .createSpy()
            .and.resolveTo({ data: { session: supabaseSession() }, error: null })
        })
      });
      await store.ready;

      client!.emit('SIGNED_OUT', null);

      expect(store.session()).toBeNull();
    });

    it('remaps on a refreshed token, so a changed role is picked up', async () => {
      const { client, store } = make();
      await store.ready;

      client!.emit(
        'TOKEN_REFRESHED',
        supabaseSession(user({ app_metadata: { role: 'Member', organisation: 'Treasury Risk' } }))
      );

      expect(store.session()?.role).toBe('Member');
    });
  });

  describe('signIn and signOut', () => {
    it('adopts the session the sign-in screen just proved, without waiting for the client', async () => {
      const { store } = make();
      await store.ready;

      store.signIn(SESSION);

      // The guard reads this signal immediately after the screen navigates, so
      // waiting for onAuthStateChange here would bounce the visitor.
      expect(store.signedIn()).toBeTrue();
    });

    it('clears the session and tells the client to end it', async () => {
      const { client, store } = make();
      await store.ready;
      store.signIn(SESSION);

      store.signOut();

      expect(store.signedIn()).toBeFalse();
      expect(client!.signOut).toHaveBeenCalledWith({ scope: 'local' });
    });

    it('still signs out locally when the client cannot be reached', async () => {
      const { store } = make({
        client: clientStub({ signOut: jasmine.createSpy().and.rejectWith(new Error('offline')) })
      });
      await store.ready;
      store.signIn(SESSION);

      store.signOut();

      expect(store.signedIn()).toBeFalse();
    });

    it('writes nothing to storage, so there is no second copy to go stale', async () => {
      const storage = new MemoryStorage();
      const { store } = make({ storage });
      await store.ready;

      store.signIn(SESSION);

      expect(storage.entries.size).toBe(0);
    });
  });
});

describe('SessionStore, when answers race', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('does not let a slow boot question overwrite a visitor who has just signed in', async () => {
    let settle: (value: { data: { session: null }; error: null }) => void = () => undefined;
    const slow = new Promise<{ data: { session: null }; error: null }>((resolve) => {
      settle = resolve;
    });

    const { store } = make({
      client: clientStub({ getSession: jasmine.createSpy().and.returnValue(slow) })
    });

    store.signIn(SESSION);
    settle({ data: { session: null }, error: null });
    await store.ready;

    expect(store.signedIn()).toBeTrue();
  });

  it('lets the client have the last word, because it is the one holding the tokens', async () => {
    const { client, store } = make();
    await store.ready;
    store.signIn(SESSION);

    client!.emit('SIGNED_OUT', null);

    expect(store.signedIn()).toBeFalse();
  });
});
