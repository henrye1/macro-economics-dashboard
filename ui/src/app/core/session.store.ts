import { InjectionToken, Injectable, computed, inject, signal } from '@angular/core';

import type { Session } from './auth.provider';
import { SUPABASE_CLIENT } from './supabase/supabase.client';
import { toSession } from './supabase/session-mapping';

/**
 * Feature 19's own session entry, which this feature retires.
 *
 * Kept as a name so the store can delete it once. It held a display shape and
 * never a credential, so there is nothing to migrate: the same four fields are
 * re-derived from the Supabase session, exactly, where a migration would be a
 * guess about a visitor who may no longer have an account.
 */
export const LEGACY_SESSION_KEY = 'cyte.macro.session.v1';

/** The slice of `Storage` this store uses, for the one-time cleanup above. */
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
 * Who the console is showing, as a projection of the Supabase session.
 *
 * Feature 19's version of this file said plainly that it was not a security
 * boundary: it read a `localStorage` entry a visitor could write by hand, and
 * the API checked nothing. Both halves of that have changed. The store no
 * longer reads any entry of its own, so nothing a visitor can type into
 * devtools puts them in the console, and `/api/macro` verifies the token behind
 * every request whatever this signal says.
 *
 * It still is not the boundary. The Supabase client holds the tokens and the
 * API verifies them; this is what the topbar and the guard read.
 */
@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly client = inject(SUPABASE_CLIENT);
  private readonly storage = inject(SESSION_STORAGE);

  private readonly current = signal<Session | null>(null);

  /**
   * Whether anything has spoken about this session yet.
   *
   * Hydration is a question asked at boot, and its answer is stale the moment
   * something more recent arrives. Without this, a `getSession()` that settles
   * just after a visitor signed in would overwrite them back to signed out.
   */
  private answered = false;

  readonly session = this.current.asReadonly();

  readonly signedIn = computed(() => this.current() !== null);

  /**
   * Settles once the first answer about an existing session has arrived.
   *
   * The guard waits on this. Deciding before it settles would send every
   * signed-in visitor who reloads a tab back to sign-in, because reading
   * persisted storage is asynchronous and "not yet" looks exactly like "no".
   */
  readonly ready: Promise<void>;

  constructor() {
    this.forgetLegacyEntry();
    this.ready = this.hydrate();
    this.follow();
  }

  /**
   * Adopt a session a provider has just established.
   *
   * `onAuthStateChange` reports the same thing a moment later, but a moment is
   * long enough for the sign-in screen to navigate and the guard to read an
   * empty store, so the screen that proved the credential says so directly.
   * Nothing is written anywhere: the Supabase client already persisted its own
   * session, and a second copy is a second thing to go stale.
   */
  signIn(session: Session): void {
    this.answered = true;
    this.current.set(session);
  }

  signOut(): void {
    this.answered = true;
    this.current.set(null);

    // Local, because the visitor is signing out of this browser and a network
    // failure must not leave them looking signed in. The refresh token is
    // revoked by its own expiry.
    void this.client?.auth.signOut({ scope: 'local' }).catch(() => undefined);
  }

  private async hydrate(): Promise<void> {
    const client = this.client;

    if (client === null) {
      return;
    }

    try {
      const { data } = await client.auth.getSession();

      if (this.answered) {
        // Someone signed in or out while this was in flight. They are more
        // recent than the question this method asked at boot.
        return;
      }

      const user = data.session?.user;

      this.answered = true;
      this.current.set(user === undefined ? null : toSession(user));
    } catch {
      // An unreadable session is no session. The visitor sees sign-in, which is
      // the safe direction and the one they can act on.
      if (!this.answered) {
        this.answered = true;
        this.current.set(null);
      }
    }
  }

  /**
   * Follow the client for the rest of the session's life: another tab signing
   * out, a refresh token that has been revoked, an administrator changing a
   * role. A console that keeps showing a session the client has dropped is a
   * console whose every request answers 401.
   */
  private follow(): void {
    this.client?.auth.onAuthStateChange((_event, session) => {
      const user = session?.user;

      // Always wins: this is the client's own account of what it holds.
      this.answered = true;
      this.current.set(user === undefined ? null : toSession(user));
    });
  }

  private forgetLegacyEntry(): void {
    try {
      this.storage?.removeItem(LEGACY_SESSION_KEY);
    } catch {
      // A browser that refuses to remove is one that refused to store. Nothing
      // reads the entry any more either way.
    }
  }
}

function readableStorage(): SessionStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
