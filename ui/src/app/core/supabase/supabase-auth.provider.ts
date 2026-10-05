import { DOCUMENT, Injectable, inject } from '@angular/core';
import type { AuthError as SupabaseAuthError } from '@supabase/supabase-js';
import { Observable, from, map } from 'rxjs';

import type {
  AuthFailure,
  AuthProvider,
  Invitation,
  PasswordRejection,
  Session
} from '../auth.provider';
import { FixtureAuthProvider } from '../fixtures/fixture-auth.provider';
import { SUPABASE_CLIENT } from './supabase.client';
import { toSession } from './session-mapping';

/** Where the password reset email sends the visitor back to. */
export const RESET_PATH = '/set-password';

/**
 * Authentication against Supabase Auth.
 *
 * Three of the five methods are real and the two invitation methods are still
 * fixtures, which is a decision rather than an oversight. Supabase Auth models a user and a
 * password; it does not model an invitation with the organisation, the inviter
 * and the two dates the accept screen renders. Feature 20 builds the
 * administration surface that issues those, and until something can issue one
 * there is nothing for this class to read. The delegation below is tested, so a
 * later reader can see it was chosen.
 *
 * A rejected credential is an answer, not an error, exactly as `AuthProvider`
 * says: a wrong password completes with `'denied'`, while an outage or a
 * missing project reaches the error channel and the screens report that
 * sign-in is unavailable.
 */
@Injectable()
export class SupabaseAuthProvider implements AuthProvider {
  private readonly client = inject(SUPABASE_CLIENT);
  private readonly document = inject(DOCUMENT);
  private readonly fixture = inject(FixtureAuthProvider);

  signIn(email: string, password: string): Observable<Session | AuthFailure> {
    const client = this.client;

    if (client === null) {
      return unconfigured();
    }

    return from(
      client.auth.signInWithPassword({ email: email.trim(), password })
    ).pipe(
      map(({ data, error }) => {
        if (error !== null) {
          if (isRefusal(error)) {
            return 'denied';
          }

          throw serviceFailure(error);
        }

        if (data.user === null) {
          // A success that carries nobody. Nothing to sign in as, and treating
          // it as a wrong password would be a lie about whose fault it is.
          throw new Error('Supabase accepted the credentials and returned no user.');
        }

        return toSession(data.user);
      })
    );
  }

  requestPasswordReset(email: string): Observable<void> {
    const client = this.client;

    if (client === null) {
      return unconfigured();
    }

    return from(
      client.auth.resetPasswordForEmail(email.trim(), { redirectTo: this.resetUrl() })
    ).pipe(
      map(({ error }) => {
        if (error !== null) {
          throw serviceFailure(error);
        }

        // The same answer for an address that exists and one that does not.
        // Supabase answers that way too, and the screen's copy is written for
        // it: a reset form that reports which addresses have accounts is an
        // account enumeration endpoint.
        return undefined;
      })
    );
  }

  setPassword(password: string): Observable<Session | AuthFailure | PasswordRejection> {
    const client = this.client;

    if (client === null) {
      return unconfigured();
    }

    // Changes the password of whoever the recovery link signed in. With no
    // such session Supabase refuses, which is the expired or already used
    // link, and the screen renders its dead end rather than an error.
    return from(client.auth.updateUser({ password })).pipe(
      map(({ data, error }) => {
        if (error !== null) {
          if (isSessionMissing(error)) {
            return 'denied';
          }

          return passwordRejection(error) ?? rethrow(error);
        }

        if (data.user === null) {
          throw new Error('Supabase accepted the password change and returned no user.');
        }

        return toSession(data.user);
      })
    );
  }

  /** Still the fixture. See the class comment. */
  invitation(token: string): Observable<Invitation> {
    return this.fixture.invitation(token);
  }

  /** Still the fixture. See the class comment. */
  acceptInvitation(
    token: string,
    fullName: string,
    password: string
  ): Observable<Session | AuthFailure> {
    return this.fixture.acceptInvitation(token, fullName, password);
  }

  private resetUrl(): string {
    return `${this.document.location.origin}${RESET_PATH}`;
  }
}

/**
 * Whether Supabase refused the credentials, as opposed to failing to consider
 * them.
 *
 * Matched on the error code rather than its message, which is display text and
 * changes. Anything unrecognised is treated as our failure, so a new code
 * surfaces as "unavailable" and gets investigated, instead of silently telling
 * a visitor with a correct password that it was wrong.
 */
function isRefusal(error: SupabaseAuthError): boolean {
  return (
    error.code === 'invalid_credentials' ||
    error.code === 'email_not_confirmed' ||
    error.code === 'user_banned' ||
    error.code === 'invalid_grant'
  );
}

/**
 * Supabase's own message is kept for the console's error channel, where the
 * screens replace it with their own wording. It never reaches a rendered
 * string, and no token or session ever travels on an error.
 */
function serviceFailure(error: SupabaseAuthError): Error {
  return new Error(`Supabase Auth failed: ${error.message}`);
}

/**
 * Whether Supabase refused for want of a session rather than for the password.
 *
 * This is what an expired, already used, or hand-typed recovery link looks
 * like from here: there is nobody signed in to change a password for. The
 * screen renders that as its dead end, which is a thing the visitor can act on
 * by asking for a new link.
 */
function isSessionMissing(error: SupabaseAuthError): boolean {
  return (
    error.status === 401 ||
    error.code === 'session_not_found' ||
    error.code === 'session_expired' ||
    error.code === 'no_authorization'
  );
}

/**
 * Whether Supabase considered the new password and refused it, which the
 * visitor fixes by choosing another, as opposed to failing to consider it.
 *
 * Matched on the code, as `isRefusal` is. `weak_password` covers whatever the
 * project's policy adds beyond the screen's three rules, leaked-password
 * protection included.
 */
function passwordRejection(error: SupabaseAuthError): PasswordRejection | null {
  switch (error.code) {
    case 'same_password':
      return 'same-password';
    case 'weak_password':
      return 'weak-password';
    default:
      return null;
  }
}

/** Narrows a map callback that cannot return, so the failure keeps one shape. */
function rethrow(error: SupabaseAuthError): never {
  throw serviceFailure(error);
}

function unconfigured<T>(): Observable<T> {
  return new Observable<T>((subscriber) =>
    subscriber.error(new Error('This build has no Supabase project configured.'))
  );
}
