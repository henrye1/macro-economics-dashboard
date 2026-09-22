import type { Provider } from '@angular/core';

import { SESSION_KEY, SESSION_STORAGE, type SessionStorage } from '../session.store';
import { FIXTURE_SESSION } from './fixture-auth.provider';

/**
 * A console route is behind `sessionGuard`, so a spec that navigates to one
 * needs a session. This supplies one in memory, never touching the browser's
 * own storage, which would leak between runs.
 *
 * Every spec that drives the router through a console route uses this. A spec
 * that wants the signed-out path asks for `provideNoSession()` instead, so the
 * intent is visible either way rather than inherited from whatever ran first.
 */
export function provideSignedInSession(): Provider {
  return { provide: SESSION_STORAGE, useValue: memoryStorage(JSON.stringify(FIXTURE_SESSION)) };
}

export function provideNoSession(): Provider {
  return { provide: SESSION_STORAGE, useValue: memoryStorage(null) };
}

function memoryStorage(initial: string | null): SessionStorage {
  const entries = new Map<string, string>();

  if (initial !== null) {
    entries.set(SESSION_KEY, initial);
  }

  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => void entries.set(key, value),
    removeItem: (key) => void entries.delete(key)
  };
}
