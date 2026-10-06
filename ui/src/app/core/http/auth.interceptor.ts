import { HttpErrorResponse, type HttpEvent, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, from, switchMap, throwError, type MonoTypeOperatorFunction } from 'rxjs';

import { SessionStore } from '../session.store';
import { SUPABASE_CLIENT } from '../supabase/supabase.client';

/**
 * Only the API routes that verify a session: the relay, the visitor's own
 * saved queries, and administration. Everything else the console fetches is
 * its own asset, and a token on a request that does not need one is a token in
 * one more log.
 */
const AUTHENTICATED = ['/api/macro', '/api/saved-queries', '/api/admin'];

/**
 * Carries the visitor's access token to the relay, and takes a refusal
 * seriously.
 *
 * The token is read from the Supabase client on each request rather than held
 * anywhere: the client refreshes it as it expires, and any copy of it here
 * would be the stale one. `getSession()` is the call that performs that
 * refresh, so it is also what keeps a long sitting cannot-be-bothered tab
 * working.
 *
 * A 401 means the token the API saw is not one it will accept, and no amount of
 * retrying changes that. The visitor is signed out and sent to the screen that
 * can fix it, carrying where they were, rather than left on a tab that renders
 * an error for a reason they cannot act on.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  if (!AUTHENTICATED.some((prefix) => isUnder(request.url, prefix))) {
    return next(request);
  }

  const client = inject(SUPABASE_CLIENT);
  const store = inject(SessionStore);
  const router = inject(Router);

  const refused: MonoTypeOperatorFunction<HttpEvent<unknown>> = catchError((error: unknown) => {
    if (error instanceof HttpErrorResponse && error.status === 401) {
      const returnUrl = router.url;

      store.signOut();
      void router.navigate(['/sign-in'], { queryParams: { returnUrl } });
    }

    // Re-raised either way. The pages own how a failure reads, and swallowing
    // it here would leave a tab spinning on a request that is over.
    return throwError(() => error);
  });

  if (client === null) {
    // No project in this build. The request still goes, and the API answers
    // 401 or 503, which is a truer thing to show than a silent nothing.
    return next(request).pipe(refused);
  }

  return from(client.auth.getSession()).pipe(
    switchMap(({ data }) => {
      const token = data.session?.access_token;

      return next(
        token === undefined
          ? request
          : request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      );
    }),
    refused
  );
};

/** `/api/macro` and `/api/macro/...`, but never `/api/macroeconomics`. */
function isUnder(url: string, prefix: string): boolean {
  return url === prefix || url.startsWith(`${prefix}/`) || url.startsWith(`${prefix}?`);
}
