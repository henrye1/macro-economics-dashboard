import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';

/**
 * Who the console thinks you are.
 *
 * No token, because there is nothing to hold one for: feature 19 authenticates
 * against a fixture. Feature 14 adds whatever Supabase Auth hands back, and
 * every consumer of this shape keeps working because none of them reads a
 * credential.
 */
export interface Session {
  readonly email: string;
  readonly fullName: string;
  readonly organisation: string;
  readonly role: string;
}

/** Why a sign-in or an acceptance did not happen. */
export type AuthFailure = 'denied' | 'unavailable';

/**
 * Why the service refused a new password it was able to consider: it is the one
 * the visitor already has, or the project's policy is stricter than the screen's
 * rules. The visitor's to fix, so an answer, never an outage.
 */
export type PasswordRejection = 'same-password' | 'weak-password';

export type InvitationStatus = 'valid' | 'expired' | 'revoked' | 'unknown';

/**
 * An invitation as the accept screen needs it.
 *
 * `sentAt` and `expiresAt` are fields rather than a single expired flag because
 * the dead-end screen names both dates: "sent to ... on 8 September 2026 and
 * expired on 15 September 2026".
 */
export interface Invitation {
  readonly token: string;
  readonly email: string;
  readonly organisation: string;
  readonly role: string;
  readonly invitedBy: string;
  /** ISO 8601. */
  readonly sentAt: string;
  readonly expiresAt: string;
  readonly status: InvitationStatus;
}

/**
 * The console's only route to authentication.
 *
 * Shaped like `MacroDataProvider`: one method per thing the screens do, every
 * one an Observable even where the fixture answers synchronously, so feature
 * 14 swaps the implementation in `app.config.ts` rather than rewriting the
 * screens.
 *
 * A rejected credential is an answer, not an error: `signIn` completes with a
 * failure rather than throwing, the same way the macro client treats an
 * upstream 400 as a payload. Only our own failures reach the error channel.
 */
export interface AuthProvider {
  signIn(email: string, password: string): Observable<Session | AuthFailure>;
  requestPasswordReset(email: string): Observable<void>;
  invitation(token: string): Observable<Invitation>;
  /**
   * Set a new password for the visitor the reset link signed in.
   *
   * Separate from `acceptInvitation` because it changes a password on an
   * account that already exists, and the screen that calls it has no
   * invitation, only a recovery session the service established from the
   * emailed link. A link that has expired or been used is a refusal, not an
   * error: the screen has a dead end to render for it.
   */
  setPassword(password: string): Observable<Session | AuthFailure | PasswordRejection>;

  acceptInvitation(
    token: string,
    fullName: string,
    password: string
  ): Observable<Session | AuthFailure>;
}

/** Inject this, never a concrete implementation. */
export const AUTH = new InjectionToken<AuthProvider>('AUTH');
