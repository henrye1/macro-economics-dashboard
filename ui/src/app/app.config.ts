import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { AUTH } from './core/auth.provider';
import { FixtureAuthProvider } from './core/fixtures/fixture-auth.provider';
import { SupabaseAuthProvider } from './core/supabase/supabase-auth.provider';
import { authInterceptor } from './core/http/auth.interceptor';
import { MACRO_DATA } from './core/macro-data.provider';
import { HttpMacroDataProvider } from './core/http/http-macro-data.provider';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    // The real service. `FixtureMacroDataProvider` stays in the tree as the
    // test double every page spec uses; nothing but this line chose it.
    { provide: MACRO_DATA, useClass: HttpMacroDataProvider },
    // Supabase Auth, and nothing but this line chose it. The fixture is still
    // provided because two of the four methods delegate to it: Supabase models
    // a user and a password, not an invitation with an inviter and two dates,
    // and feature 20 is where those become real.
    FixtureAuthProvider,
    { provide: AUTH, useClass: SupabaseAuthProvider },
  ]
};
