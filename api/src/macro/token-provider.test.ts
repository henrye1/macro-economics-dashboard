import { describe, expect, it, vi } from 'vitest';

import type { MacroSettings } from '../config.js';
import { TOKEN_EXPIRY_MARGIN_SECONDS, createTokenProvider } from './token-provider.js';

const settings: MacroSettings = {
  auth0Domain: 'cyte.eu.auth0.com',
  auth0ClientId: 'client-id',
  auth0ClientSecret: 'super-secret-value',
  auth0Audience: 'https://core.example/api',
  coreApiBaseUrl: 'https://core.example',
};

/** A fake Auth0 that hands out a numbered token each time it is called. */
function grantingFetch(expiresIn = 3600) {
  let issued = 0;

  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
    issued += 1;
    return new Response(
      JSON.stringify({ access_token: `token-${issued}`, expires_in: expiresIn, token_type: 'Bearer' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  });
}

/** A clock the test moves by hand. */
function clock(startMs = 1_000_000) {
  let value = startMs;
  return {
    now: () => value,
    advanceSeconds: (seconds: number) => {
      value += seconds * 1000;
    },
  };
}

describe('createTokenProvider', () => {
  it('sends the client-credentials grant to the tenant token endpoint', async () => {
    const fetch = grantingFetch();
    const provider = createTokenProvider({ fetch, config: settings });

    expect(await provider.getToken()).toBe('token-1');

    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe('https://cyte.eu.auth0.com/oauth/token');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      grant_type: 'client_credentials',
      client_id: 'client-id',
      client_secret: 'super-secret-value',
      audience: 'https://core.example/api',
    });
  });

  it('reuses the cached token across sequential calls', async () => {
    const fetch = grantingFetch();
    const provider = createTokenProvider({ fetch, config: settings });

    expect(await provider.getToken()).toBe('token-1');
    expect(await provider.getToken()).toBe('token-1');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('makes one request for concurrent callers, not one each', async () => {
    const fetch = grantingFetch();
    const provider = createTokenProvider({ fetch, config: settings });

    const tokens = await Promise.all([
      provider.getToken(),
      provider.getToken(),
      provider.getToken(),
    ]);

    expect(tokens).toEqual(['token-1', 'token-1', 'token-1']);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('refreshes once the cached token is inside the expiry margin', async () => {
    const fetch = grantingFetch(3600);
    const time = clock();
    const provider = createTokenProvider({ fetch, config: settings, now: time.now });

    expect(await provider.getToken()).toBe('token-1');

    // Still inside the cache window.
    time.advanceSeconds(3600 - TOKEN_EXPIRY_MARGIN_SECONDS - 1);
    expect(await provider.getToken()).toBe('token-1');
    expect(fetch).toHaveBeenCalledTimes(1);

    // Now past it, a full margin before Auth0 would have expired the token.
    time.advanceSeconds(2);
    expect(await provider.getToken()).toBe('token-2');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('still caches a lifetime shorter than the margin rather than refetching every call', async () => {
    const fetch = grantingFetch(30);
    const time = clock();
    const provider = createTokenProvider({ fetch, config: settings, now: time.now });

    expect(await provider.getToken()).toBe('token-1');
    time.advanceSeconds(10);
    expect(await provider.getToken()).toBe('token-1');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('fetches a fresh token after invalidate, which is the 401 retry path', async () => {
    const fetch = grantingFetch();
    const provider = createTokenProvider({ fetch, config: settings });

    expect(await provider.getToken()).toBe('token-1');
    provider.invalidate();

    expect(await provider.getToken()).toBe('token-2');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  describe('failure', () => {
    const rejects = async (fetch: typeof globalThis.fetch) => {
      const provider = createTokenProvider({ fetch, config: settings });

      try {
        await provider.getToken();
      } catch (error) {
        return error as Error & { status?: number };
      }

      throw new Error('expected getToken to reject');
    };

    it('reports a 502 when the token endpoint is unreachable', async () => {
      const error = await rejects(
        vi.fn(async () => {
          throw new Error(`connect ECONNREFUSED https://cyte.eu.auth0.com/oauth/token`);
        }),
      );

      expect(error.status).toBe(502);
      expect(error.message).toBe('Could not reach the authentication service.');
    });

    it('reports a 502 when the credentials are rejected', async () => {
      const error = await rejects(
        vi.fn(async () => new Response('{"error":"access_denied"}', { status: 401 })),
      );

      expect(error.status).toBe(502);
    });

    it('reports a 502 for an unreadable body', async () => {
      const error = await rejects(vi.fn(async () => new Response('not json', { status: 200 })));

      expect(error.status).toBe(502);
    });

    it('reports a 502 when the grant is missing a usable token', async () => {
      for (const payload of [
        {},
        { access_token: '', expires_in: 3600 },
        { access_token: 'ok' },
        { access_token: 'ok', expires_in: 0 },
        { access_token: 'ok', expires_in: 'soon' },
      ]) {
        const error = await rejects(
          vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })),
        );

        expect(error.status).toBe(502);
      }
    });

    it('never names the secret, the token or the URL in a message', async () => {
      const failures: (typeof globalThis.fetch)[] = [
        vi.fn(async () => {
          throw new Error('connect ECONNREFUSED cyte.eu.auth0.com');
        }),
        vi.fn(async () => new Response('{"error":"access_denied"}', { status: 401 })),
        vi.fn(async () => new Response('not json', { status: 200 })),
        vi.fn(async () => new Response('{"access_token":"leaked-token"}', { status: 200 })),
      ];

      for (const fetch of failures) {
        const { message } = await rejects(fetch);

        expect(message).not.toContain('super-secret-value');
        expect(message).not.toContain('leaked-token');
        expect(message).not.toContain('auth0.com');
        expect(message).not.toContain('client-id');
      }
    });

    it('does not cache a failure, so the next call tries again', async () => {
      let attempt = 0;
      const fetch = vi.fn(async () => {
        attempt += 1;
        return attempt === 1
          ? new Response('nope', { status: 500 })
          : new Response(JSON.stringify({ access_token: 'token-ok', expires_in: 3600 }), {
              status: 200,
            });
      });

      const provider = createTokenProvider({ fetch, config: settings });

      await expect(provider.getToken()).rejects.toThrow();
      expect(await provider.getToken()).toBe('token-ok');
    });
  });
});
