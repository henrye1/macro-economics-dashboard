import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type { Session as SupabaseSession, SupabaseClient, User } from '@supabase/supabase-js';

import { routes } from '../../app.routes';
import { AUTH } from '../auth.provider';
import { FixtureAuthProvider } from '../fixtures/fixture-auth.provider';
import { FixtureMacroDataProvider } from '../fixtures/fixture-macro-data.provider';
import { MACRO_DATA } from '../macro-data.provider';
import { SESSION_STORAGE, SessionStore } from '../session.store';
import { SUPABASE_CLIENT } from '../supabase/supabase.client';
import { authInterceptor } from './auth.interceptor';

/**
 * One turn of the task queue.
 *
 * The interceptor asks the client for a token before the request leaves, and
 * routes after a refusal, so both cross a real asynchronous boundary that a
 * spec has to let finish before it looks.
 */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve));
}

const TOKEN = 'header.payload.signature';

function clientWith(token: string | null) {
  const session =
    token === null
      ? null
      : ({ access_token: token, user: { id: 'c2a1', email: 'a@b.co' } as User } as SupabaseSession);

  return {
    auth: {
      getSession: () => Promise.resolve({ data: { session }, error: null }),
      signOut: jasmine.createSpy('signOut').and.resolveTo({ error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } })
    }
  } as unknown as SupabaseClient;
}

function setUp(client: SupabaseClient | null) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes),
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      { provide: SUPABASE_CLIENT, useValue: client },
      { provide: SESSION_STORAGE, useValue: null },
      { provide: MACRO_DATA, useClass: FixtureMacroDataProvider },
      { provide: AUTH, useClass: FixtureAuthProvider },
      FixtureAuthProvider
    ]
  });

  return {
    http: TestBed.inject(HttpClient),
    httpMock: TestBed.inject(HttpTestingController),
    router: TestBed.inject(Router),
    store: TestBed.inject(SessionStore)
  };
}

describe('authInterceptor', () => {
  afterEach(() => TestBed.resetTestingModule());

  describe('the header', () => {
    it('carries the access token to the relay', async () => {
      const { http, httpMock } = setUp(clientWith(TOKEN));

      http.get('/api/macro/countries').subscribe();
      await TestBed.inject(SessionStore).ready;

      const request = httpMock.expectOne('/api/macro/countries');

      expect(request.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
      request.flush({ data: [] });
      httpMock.verify();
    });

    it('leaves every other request alone, so no token travels where it is not needed', async () => {
      const { http, httpMock } = setUp(clientWith(TOKEN));

      http.get('/assets/config.json').subscribe();

      const request = httpMock.expectOne('/assets/config.json');

      expect(request.request.headers.has('Authorization')).toBeFalse();
      request.flush({});
      httpMock.verify();
    });

    it('sends no header when nobody is signed in', async () => {
      const { http, httpMock } = setUp(clientWith(null));

      http.get('/api/macro/countries').subscribe();
      await TestBed.inject(SessionStore).ready;

      const request = httpMock.expectOne('/api/macro/countries');

      expect(request.request.headers.has('Authorization')).toBeFalse();
      request.flush({ data: [] });
      httpMock.verify();
    });

    it('still sends the request when this build has no project', async () => {
      const { http, httpMock } = setUp(null);

      http.get('/api/macro/countries').subscribe();

      const request = httpMock.expectOne('/api/macro/countries');

      expect(request.request.headers.has('Authorization')).toBeFalse();
      request.flush({ data: [] });
      httpMock.verify();
    });
  });

  describe('a refusal from the relay', () => {
    it('signs the visitor out and sends them to sign-in, carrying where they were', async () => {
      const { http, httpMock, router, store } = setUp(clientWith(TOKEN));
      await router.navigateByUrl('/vintages');

      http.get('/api/macro/vintages').subscribe({ error: () => undefined });
      await store.ready;

      httpMock.expectOne('/api/macro/vintages').flush(
        { error: 'This request carried no valid session.' },
        { status: 401, statusText: 'Unauthorized' }
      );
      await settle();

      expect(store.signedIn()).toBeFalse();
      expect(router.url).toBe('/sign-in?returnUrl=%2Fvintages');
    });

    it('re-raises, so the page still shows its own failure state', async () => {
      const { http, httpMock, store } = setUp(clientWith(TOKEN));
      let raised: unknown = null;

      http.get('/api/macro/countries').subscribe({ error: (error: unknown) => (raised = error) });
      await store.ready;

      httpMock
        .expectOne('/api/macro/countries')
        .flush({ error: 'no' }, { status: 401, statusText: 'Unauthorized' });

      expect(raised).not.toBeNull();
    });

    it('leaves other failures to the page, without signing anybody out', async () => {
      const { http, httpMock, router, store } = setUp(clientWith(TOKEN));
      await router.navigateByUrl('/vintages');
      store.signIn({ email: 'a@b.co', fullName: 'A', organisation: 'B', role: 'Member' });

      http.get('/api/macro/vintages').subscribe({ error: () => undefined });
      await settle();

      httpMock
        .expectOne('/api/macro/vintages')
        .flush({ error: 'upstream' }, { status: 502, statusText: 'Bad Gateway' });

      // A 502 is the service failing, not the session. Signing the visitor out
      // would lose their place for something a retry fixes.
      expect(store.signedIn()).toBeTrue();
      expect(router.url).toBe('/vintages');
    });
  });
});
