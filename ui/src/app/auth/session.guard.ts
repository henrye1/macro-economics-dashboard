import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { SessionStore } from '../core/session.store';

/**
 * Sends a visitor with no session to sign-in, carrying where they were going.
 *
 * **This is not access control.** It reads a `localStorage` entry the visitor
 * can write, and the API behind `/api/macro` checks nothing either. It decides
 * which screen to show, and feature 14 is where a session starts meaning
 * something.
 */
export const sessionGuard: CanActivateFn = (_route, state) => {
  const router = inject(Router);

  if (inject(SessionStore).signedIn()) {
    return true;
  }

  return router.createUrlTree(['/sign-in'], {
    queryParams: { returnUrl: state.url }
  });
};

/**
 * Where sign-in should land, given a `returnUrl` that arrived in the address
 * bar and is therefore attacker-supplied.
 *
 * Only a path on this origin is allowed through. `//evil.test` and
 * `https://evil.test` are both valid relative-looking URLs to a browser, and
 * either would turn our own sign-in form into an open redirect.
 */
export function safeReturnUrl(candidate: string | null | undefined): string {
  if (typeof candidate !== 'string') {
    return '/overview';
  }

  // A backslash counts as an authority separator to the URL parser, so
  // `/\\evil.test` is a foreign origin to anything that resolves it even though
  // Angular's own serialiser reads it as a path segment. Rejecting both slashes
  // keeps the guarantee in this function rather than in the router's wildcard.
  const second = candidate.charAt(1);
  const isOwnPath = candidate.startsWith('/') && second !== '/' && second !== '\\';

  return isOwnPath ? candidate : '/overview';
}
