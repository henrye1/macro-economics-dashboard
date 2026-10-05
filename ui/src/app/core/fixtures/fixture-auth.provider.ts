import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';

import type { AuthFailure, AuthProvider, Invitation, Session } from '../auth.provider';

/**
 * The one account this fixture knows, and its password.
 *
 * In the clear on purpose: there is nothing to protect. No credential here
 * reaches a server, and feature 14 deletes this file when Supabase Auth
 * replaces it. Treating it as a secret would imply it is one.
 */
export const FIXTURE_EMAIL = 'thandi.mokoena@cyte.co.za';
export const FIXTURE_PASSWORD = 'Correct-horse-1';

export const FIXTURE_SESSION: Session = {
  email: FIXTURE_EMAIL,
  fullName: 'Thandi Mokoena',
  organisation: 'Treasury Risk',
  role: 'Administrator'
};

/**
 * The three inputs that exist only so a failure state can be reached.
 *
 * Every screen has a denied path and an unexpected-error path, and a fixture
 * that can only succeed leaves half of each screen unreachable and untested.
 * Feature 14 makes those the ordinary paths, which is the wrong moment to run
 * them for the first time.
 */
export const FIXTURE_UNREACHABLE_EMAIL = 'unreachable@cyte.co.za';

/** Signing in with this address fails the way a service outage would. */
export const FIXTURE_FAILING_EMAIL = 'outage@cyte.co.za';

/** Resolves as a valid invitation and is then refused on acceptance. */
export const FIXTURE_REFUSED_TOKEN = 'refused-token';

/**
 * One invitation per outcome, so every state the accept screen has to render
 * can be reached by visiting a URL. The dates are the export's own.
 */
export const FIXTURE_INVITATIONS: readonly Invitation[] = [
  {
    token: 'valid-token',
    email: 'lerato.khumalo@cyte.co.za',
    organisation: 'Treasury Risk',
    role: 'Member',
    invitedBy: 'Thandi Mokoena',
    sentAt: '2026-09-18T09:00:00.000Z',
    expiresAt: '2026-09-25T09:00:00.000Z',
    status: 'valid'
  },
  {
    token: 'expired-token',
    email: 'd.jacobs@cyte.co.za',
    organisation: 'Treasury Risk',
    role: 'Member',
    invitedBy: 'Thandi Mokoena',
    sentAt: '2026-09-08T09:00:00.000Z',
    expiresAt: '2026-09-15T09:00:00.000Z',
    status: 'expired'
  },
  {
    token: FIXTURE_REFUSED_TOKEN,
    email: 'k.botha@cyte.co.za',
    organisation: 'Treasury Risk',
    role: 'Member',
    invitedBy: 'Thandi Mokoena',
    sentAt: '2026-09-20T09:00:00.000Z',
    expiresAt: '2026-09-27T09:00:00.000Z',
    status: 'valid'
  },
  {
    token: 'revoked-token',
    email: 'p.naidoo@cyte.co.za',
    organisation: 'Treasury Risk',
    role: 'Member',
    invitedBy: 'Thandi Mokoena',
    sentAt: '2026-09-19T09:00:00.000Z',
    expiresAt: '2026-09-26T09:00:00.000Z',
    status: 'revoked'
  }
];

/**
 * Authentication for a console with no authentication.
 *
 * It checks a string against a constant. That is the whole of it, and it is
 * enough to drive every state the four screens have to render, which is what
 * feature 19 is for. Feature 14 replaces this with Supabase Auth behind the
 * same `AUTH` token.
 */
@Injectable()
export class FixtureAuthProvider implements AuthProvider {
  signIn(email: string, password: string): Observable<Session | AuthFailure> {
    const address = email.trim().toLowerCase();

    if (address === FIXTURE_FAILING_EMAIL) {
      return new Observable((subscriber) => subscriber.error(new Error('auth service down')));
    }

    return of(address === FIXTURE_EMAIL && password === FIXTURE_PASSWORD
      ? FIXTURE_SESSION
      : 'denied');
  }

  requestPasswordReset(email: string): Observable<void> {
    if (email.trim().toLowerCase() === FIXTURE_UNREACHABLE_EMAIL) {
      return new Observable((subscriber) => subscriber.error(new Error('mail service down')));
    }

    // Answers the same way for an unknown address as for a known one. Telling
    // a caller which addresses exist is the one thing a reset form must not do,
    // and the design's copy is written that way too.
    return of(undefined);
  }

  /**
   * Accepts any password that reaches it, because there is no recovery session
   * to check against. The screen's own rules list is what a visitor sees here,
   * and Supabase is what enforces anything in feature 14.
   */
  setPassword(_password: string): Observable<Session | AuthFailure> {
    return of(FIXTURE_SESSION);
  }

  invitation(token: string): Observable<Invitation> {
    const found = FIXTURE_INVITATIONS.find((invitation) => invitation.token === token);

    return of(found ?? unknownInvitation(token));
  }

  acceptInvitation(
    token: string,
    fullName: string,
    _password: string
  ): Observable<Session | AuthFailure> {
    const found = FIXTURE_INVITATIONS.find((invitation) => invitation.token === token);

    if (found === undefined || found.status !== 'valid') {
      return of('denied');
    }

    // Valid when it was read, refused when it was used. The window between the
    // two is where an administrator revoking an invitation actually lands.
    if (found.token === FIXTURE_REFUSED_TOKEN) {
      return of('unavailable');
    }

    return of({
      email: found.email,
      fullName: fullName.trim(),
      organisation: found.organisation,
      role: found.role
    });
  }
}

/**
 * A token nobody issued still has to render a screen, so it becomes an
 * invitation with `unknown` status rather than an error. Its fields are empty
 * because there is no record to read them from.
 */
function unknownInvitation(token: string): Invitation {
  return {
    token,
    email: '',
    organisation: '',
    role: '',
    invitedBy: '',
    sentAt: '',
    expiresAt: '',
    status: 'unknown'
  };
}
