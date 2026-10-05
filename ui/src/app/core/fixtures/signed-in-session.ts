import type { Provider } from '@angular/core';
import type { Session as SupabaseSession, SupabaseClient, User } from '@supabase/supabase-js';

import { SESSION_STORAGE, type SessionStorage } from '../session.store';
import { SUPABASE_CLIENT } from '../supabase/supabase.client';
import { FIXTURE_SESSION } from './fixture-auth.provider';

/**
 * A console route is behind `sessionGuard`, so a spec that navigates to one
 * needs a session. Since feature 14 that means a Supabase client with one, not
 * a storage entry: the store reads the client and nothing else.
 *
 * Nothing here reaches the network or the browser's own storage, which would
 * leak between runs. A spec that wants the signed-out path asks for
 * `provideNoSession()` instead, so the intent is visible either way rather than
 * inherited from whatever ran first.
 */
export function provideSignedInSession(): Provider {
  return providers(clientWith(fixtureUser()));
}

export function provideNoSession(): Provider {
  return providers(clientWith(null));
}

/** The fixture account as Supabase would describe it. */
function fixtureUser(): User {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    email: FIXTURE_SESSION.email,
    // Where the console really reads these two from, so a spec cannot pass by
    // putting a role somewhere the product does not trust.
    app_metadata: {
      role: FIXTURE_SESSION.role,
      organisation: FIXTURE_SESSION.organisation
    },
    user_metadata: { full_name: FIXTURE_SESSION.fullName },
    aud: 'authenticated',
    created_at: '2026-09-01T09:00:00.000Z'
  } as User;
}

function clientWith(user: User | null): SupabaseClient {
  const session = user === null ? null : ({ access_token: 'test-token', user } as SupabaseSession);

  return {
    auth: {
      getSession: () => Promise.resolve({ data: { session }, error: null }),
      signOut: () => Promise.resolve({ error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } })
    }
  } as unknown as SupabaseClient;
}

function providers(client: SupabaseClient): Provider {
  return [
    { provide: SUPABASE_CLIENT, useValue: client },
    { provide: SESSION_STORAGE, useValue: memoryStorage() }
  ];
}

function memoryStorage(): SessionStorage {
  const entries = new Map<string, string>();

  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => void entries.set(key, value),
    removeItem: (key) => void entries.delete(key)
  };
}
