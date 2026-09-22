import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';

import { routes } from './app.routes';
import { AUTH } from './core/auth.provider';
import { FixtureAuthProvider } from './core/fixtures/fixture-auth.provider';
import { MACRO_DATA } from './core/macro-data.provider';
import { HttpMacroDataProvider } from './core/http/http-macro-data.provider';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
    provideHttpClient(withFetch()),
    // The real service. `FixtureMacroDataProvider` stays in the tree as the
    // test double every page spec uses; nothing but this line chose it.
    { provide: MACRO_DATA, useClass: HttpMacroDataProvider },
    // The fixture is the real implementation until feature 14 puts Supabase
    // Auth behind this token. Nothing but this line chose it.
    { provide: AUTH, useClass: FixtureAuthProvider },
  ]
};
