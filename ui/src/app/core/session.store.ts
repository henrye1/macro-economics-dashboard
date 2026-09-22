import { InjectionToken, Injectable, computed, inject, signal } from '@angular/core';

import type { Session } from './auth.provider';

/**
 * Namespaced so it cannot collide on a shared origin, and versioned so feature
 * 14 can recognise what it is replacing.
 */
export const SESSION_KEY = 'cyte.macro.session.v1';

/** The slice of `Storage` this store uses. */
export interface SessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Overridden in specs so they never touch the browser's own storage, which
 * would leak state between runs. Null means no usable storage, as a private
 * mode can produce.
 */
export const SESSION_STORAGE = new InjectionToken<SessionStorage | null>('SESSION_STORAGE', {
  providedIn: 'root',
  factory: readableStorage
});

/**
 * The current session, kept in this browser.
 *
 * **This is not a security boundary.** It is a `localStorage` entry a visitor
 * can write by hand, and the API behind `/api/macro` checks nothing, exactly as
 * `project-overview.md` records as an accepted gap until feature 14. What this
 * buys is a console that knows which screens to show, not one that keeps anyone
 * out.
 */
@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly storage = inject(SESSION_STORAGE);

  private readonly current = signal<Session | null>(null);

  readonly session = this.current.asReadonly();

  readonly signedIn = computed(() => this.current() !== null);

  constructor() {
    this.current.set(this.read());
  }

  signIn(session: Session): void {
    this.current.set(session);
    this.write(session);
  }

  signOut(): void {
    this.current.set(null);

    try {
      this.storage?.removeItem(SESSION_KEY);
    } catch {
      // A browser that refuses to remove is one that refused to store. The
      // signal is already clear, which is what the guard reads.
    }
  }

  /**
   * Anything unreadable is no session rather than a crash. A half-written or
   * hand-edited entry must not take the console down on load, and treating it
   * as signed out is the safe direction: the visitor sees sign-in.
   */
  private read(): Session | null {
    let raw: string | null = null;

    try {
      raw = this.storage?.getItem(SESSION_KEY) ?? null;
    } catch {
      return null;
    }

    if (raw === null) {
      return null;
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      return isSession(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private write(session: Session): void {
    try {
      this.storage?.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
      // Storage full or blocked. The signal still holds the session, so this
      // browser simply forgets it on reload.
    }
  }
}

function isSession(value: unknown): value is Session {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate['email'] === 'string' &&
    typeof candidate['fullName'] === 'string' &&
    typeof candidate['organisation'] === 'string' &&
    typeof candidate['role'] === 'string'
  );
}

function readableStorage(): SessionStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
