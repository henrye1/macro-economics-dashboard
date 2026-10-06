import { describe, expect, it } from 'vitest';

import {
  isAuthConfigured,
  isMacroConfigured,
  isSavedQueriesConfigured,
  parseConsoleUrl,
  parseInviteLinkTtlHours,
  type MacroSettings,
} from './config.js';

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

describe('isAuthConfigured', () => {
  it('is true once the project URL has a value', () => {
    expect(isAuthConfigured({ supabaseUrl: 'https://project.supabase.co' })).toBe(true);
  });

  it('is false when the project URL is blank', () => {
    expect(isAuthConfigured({ supabaseUrl: '' })).toBe(false);
  });

  it('treats whitespace as blank, so a stray space is not a project', () => {
    expect(isAuthConfigured({ supabaseUrl: '   ' })).toBe(false);
  });
});

describe('isSavedQueriesConfigured', () => {
  const both = { supabaseUrl: 'https://project.supabase.co', supabaseServiceKey: 'service-key' };

  it('is true when the URL and the service key both have a value', () => {
    expect(isSavedQueriesConfigured(both)).toBe(true);
  });

  it('is false when either is blank', () => {
    expect(isSavedQueriesConfigured({ ...both, supabaseUrl: '' })).toBe(false);
    expect(isSavedQueriesConfigured({ ...both, supabaseServiceKey: '' })).toBe(false);
  });

  it('treats whitespace as blank', () => {
    expect(isSavedQueriesConfigured({ ...both, supabaseServiceKey: '   ' })).toBe(false);
  });
});

describe('parseConsoleUrl', () => {
  it('trims trailing slashes and whitespace', () => {
    expect(parseConsoleUrl(' https://console.example/ ')).toBe('https://console.example');
    expect(parseConsoleUrl('https://console.example//')).toBe('https://console.example');
  });

  it('defaults to the local console', () => {
    expect(parseConsoleUrl(undefined)).toBe('http://localhost:4200');
    expect(parseConsoleUrl('  ')).toBe('http://localhost:4200');
  });
});

describe('parseInviteLinkTtlHours', () => {
  it('reads a positive number of hours', () => {
    expect(parseInviteLinkTtlHours('1')).toBe(1);
    expect(parseInviteLinkTtlHours('0.5')).toBe(0.5);
  });

  it.each([undefined, '', '0', '-3', 'a day'])('falls back to 24 for %j', (value) => {
    expect(parseInviteLinkTtlHours(value)).toBe(24);
  });
});
