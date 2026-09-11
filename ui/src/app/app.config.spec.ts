import { TestBed } from '@angular/core/testing';

import { appConfig } from './app.config';
import { FixtureMacroDataProvider } from './core/fixtures/fixture-macro-data.provider';
import { HttpMacroDataProvider } from './core/http/http-macro-data.provider';
import { MACRO_DATA } from './core/macro-data.provider';

/**
 * F-15: nothing read `appConfig`, so the one line this whole feature exists for
 * was untested.
 *
 * Every page spec supplies its own `MACRO_DATA`, which is correct for testing
 * page behaviour but means reverting the provider swap in `app.config.ts` would
 * have shipped the console on fixtures with a full green suite and a clean
 * build. This is the only spec that asserts what the real application is wired
 * to.
 */
describe('appConfig', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('binds MACRO_DATA to the real HTTP provider', () => {
    TestBed.configureTestingModule({ providers: [...appConfig.providers] });

    const provider = TestBed.inject(MACRO_DATA);

    expect(provider).toBeInstanceOf(HttpMacroDataProvider);
  });

  it('does not ship the fixture double', () => {
    TestBed.configureTestingModule({ providers: [...appConfig.providers] });

    // Stated separately from the assertion above: `HttpMacroDataProvider` does
    // not extend the fixture, so this cannot pass by inheritance.
    expect(TestBed.inject(MACRO_DATA)).not.toBeInstanceOf(FixtureMacroDataProvider);
  });

  it('provides HttpClient, which the real provider injects', () => {
    TestBed.configureTestingModule({ providers: [...appConfig.providers] });

    // The swap is only safe because the config also provides the client;
    // without it the provider would fail at first injection, not at build.
    expect(() => TestBed.inject(MACRO_DATA)).not.toThrow();
  });
});
