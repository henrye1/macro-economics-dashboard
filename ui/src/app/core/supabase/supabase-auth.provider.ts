import { DOCUMENT, Injectable, inject } from '@angular/core';
import type { AuthError as SupabaseAuthError, User } from '@supabase/supabase-js';
import { Observable, from, map } from 'rxjs';

import type {
  AuthFailure,
  AuthProvider,
  Invitation,
  PasswordRejection,
  Session
} from '../auth.provider';
import { SUPABASE_CLIENT } from './supabase.client';
import { toSession } from './session-mapping';

/** Where the password reset email sends the visitor back to. */
export const RESET_PATH = '/set-password';

/**
 * Authentication against Supabase Auth.
 *
 * All five methods are real. An invitation is Supabase's own: the API sends
 * the invite email (feature 20c) and stamps the invitee's `app_metadata` with
 * the organisation, role and inviter. Following the link leaves a session
 * behind, so reading the invitation is reading that session's user, and
 * accepting it is setting a name and password on it.
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

  /**
   * The invitation the emailed link signed in, or why there is none.
   *
   * `getSession()` waits for the client to finish reading the link. Only a
   * session whose user an administrator invited counts: an ordinary signed-in
   * visitor who opens this page is not shown an invitation. With no session,
   * Supabase's own reason is in the fragment; only its `error_code` is read,
   * never anything else in it.
   */
  invitation(_token: string): Observable<Invitation> {
    const client = this.client;

    if (client === null) {
      return unconfigured();
    }

    return from(client.auth.getSession()).pipe(
      map(({ data, error }) => {
        if (error !== null) {
          throw serviceFailure(error);
        }

        // A link Supabase refused wins over any session already in this
        // browser: supabase-js keeps the existing session on a failed link,
        // and that could be the same invitee re-opening a spent one.
        const refused = this.fragmentErrorCode();
        if (refused !== null) {
          return deadEnd(refused);
        }

        const user = data.session?.user;

        return user !== undefined && isInvited(user) ? invitationOf(user) : deadEnd(null);
      })
    );
  }

  /** Sets the invitee's name and password on the session the link established. */
  acceptInvitation(
    _token: string,
    fullName: string,
    password: string
  ): Observable<Session | AuthFailure | PasswordRejection> {
    const client = this.client;

    if (client === null) {
      return unconfigured();
    }

    return from(
      client.auth.updateUser({ password, data: { full_name: fullName.trim() } })
    ).pipe(
      map(({ data, error }) => {
        if (error !== null) {
          if (isSessionMissing(error)) {
            return 'denied';
          }

          // `same-password` cannot happen to an invitee who never had one; a
          // weak one is theirs to change.
          return passwordRejection(error) === 'weak-password' ? 'weak-password' : rethrow(error);
        }

        if (data.user === null) {
          throw new Error('Supabase accepted the invitation and returned no user.');
        }

        return toSession(data.user);
      })
    );
  }

  /** Supabase's reason a link failed, from `#error=…&error_code=…`, or null. */
  private fragmentErrorCode(): string | null {
    const hash = this.document.location?.hash ?? '';
    return new URLSearchParams(hash.replace(/^#/, '')).get('error_code');
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
 * An invitation not yet accepted. The API stamps `invited_by` on every
 * invitee and never removes it, so on its own it marks an account for life.
 * Accepting always sets `full_name`, so an invitee who has one has accepted.
 * `user_metadata` is the visitor's to write, but the most clearing it can do
 * is show them their own form again, which grants nothing: `/set-password`
 * already lets that session set a password.
 */
function isInvited(user: User): boolean {
  const invitedBy = user.app_metadata?.['invited_by'];
  const fullName = user.user_metadata?.['full_name'];
  const accepted = typeof fullName === 'string' && fullName.trim() !== '';

  return typeof invitedBy === 'string' && invitedBy !== '' && !accepted;
}

function stringAt(source: Record<string, unknown> | undefined, key: string): string {
  const value = source?.[key];
  return typeof value === 'string' ? value : '';
}

/**
 * The invitation the screen renders. Organisation and role come from
 * `app_metadata`, which only the API writes; nothing is read from
 * `user_metadata`. There is no expiry to show: the link was still good.
 */
function invitationOf(user: User): Invitation {
  const session = toSession(user);

  return {
    token: '',
    email: session.email,
    organisation: session.organisation,
    role: session.role,
    invitedBy: stringAt(user.app_metadata, 'invited_by_name') || 'an administrator',
    sentAt: user.invited_at ?? '',
    expiresAt: '',
    status: 'valid'
  };
}

/**
 * No usable invitation. A revoked invitation's user is deleted, so Supabase
 * rejects its link exactly as it rejects an expired one; `otp_expired` is
 * the only reason told apart, and it covers both and a link already used.
 */
function deadEnd(errorCode: string | null): Invitation {
  return {
    token: '',
    email: '',
    organisation: '',
    role: '',
    invitedBy: '',
    sentAt: '',
    expiresAt: '',
    status: errorCode === 'otp_expired' ? 'expired' : 'unknown'
  };
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
