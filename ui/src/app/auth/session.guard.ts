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
 *
 * The result is safe to hand to the router. It is not a sanitiser for anything
 * that takes a full URL: this decides between an in-app path and the default
 * landing tab, and a caller with other plans should say so here first.
 */
export function safeReturnUrl(candidate: string | null | undefined): string {
  if (typeof candidate !== 'string') {
    return '/overview';
  }

  // Tab, newline and carriage return are stripped by the URL parser before it
  // parses, so a positional test on the raw string inspects a character the
  // parser will never see: `/<LF>/evil.test` reaches it as `//evil.test` and
  // resolves to a foreign origin. Reject them outright rather than try to
  // predict what is left after the strip.
  if (/[\t\n\r]/.test(candidate)) {
    return '/overview';
  }

  // Both slashes, because a backslash is an authority separator to the parser
  // even though Angular's own serialiser reads it as a path character.
  const second = candidate.charAt(1);
  const isOwnPath = candidate.startsWith('/') && second !== '/' && second !== '\\';

  return isOwnPath ? candidate : '/overview';
}
