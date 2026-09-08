import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';

import { routes } from './app.routes';
import { MACRO_DATA } from './core/macro-data.provider';
import { FixtureMacroDataProvider } from './core/fixtures/fixture-macro-data.provider';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
    provideHttpClient(withFetch()),
    // Feature 8 swaps this one line for the real HTTP-backed provider.
    { provide: MACRO_DATA, useClass: FixtureMacroDataProvider },
  ]
};
