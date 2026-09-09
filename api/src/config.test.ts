import { describe, expect, it } from 'vitest';

import { isMacroConfigured, type MacroSettings } from './config.js';

const complete: MacroSettings = {
  auth0Domain: 'cyte.eu.auth0.com',
  auth0ClientId: 'client-id',
  auth0ClientSecret: 'client-secret',
  auth0Audience: 'https://core.example/api',
  coreApiBaseUrl: 'https://core.example',
};

describe('isMacroConfigured', () => {
  it('is true when every setting has a value', () => {
    expect(isMacroConfigured(complete)).toBe(true);
  });

  it('is false when any single setting is blank', () => {
    for (const key of Object.keys(complete) as (keyof MacroSettings)[]) {
      expect(isMacroConfigured({ ...complete, [key]: '' })).toBe(false);
    }
  });

  it('treats whitespace as blank, so a stray space is not a credential', () => {
    expect(isMacroConfigured({ ...complete, auth0ClientSecret: '   ' })).toBe(false);
  });

  it('is false for a wholly unconfigured service, which is this repo today', () => {
    expect(
      isMacroConfigured({
        auth0Domain: '',
        auth0ClientId: '',
        auth0ClientSecret: '',
        auth0Audience: '',
        coreApiBaseUrl: '',
      }),
    ).toBe(false);
  });
});
