import { describe, expect, it, vi } from 'vitest';

import type { MacroSettings } from '../config.js';
import { createMacroClient } from './macro-client.js';
import type { TokenProvider } from './token-provider.js';

const settings: MacroSettings = {
  auth0Domain: 'cyte.eu.auth0.com',
  auth0ClientId: 'client-id',
  auth0ClientSecret: 'super-secret-value',
  auth0Audience: 'https://core.example/api',
  coreApiBaseUrl: 'https://core.example',
};

/** A token provider that hands out a numbered token and records invalidations. */
function tokens(): TokenProvider & { issued: number; invalidations: number } {
  const state = {
    issued: 0,
    invalidations: 0,
    async getToken() {
      state.issued += 1;
      return `token-${state.issued}`;
    },
    invalidate() {
      state.invalidations += 1;
    },
  };

  return state;
}

type FakeFetch = ReturnType<typeof vi.fn<typeof globalThis.fetch>>;

function responding(...responses: Response[]): FakeFetch {
  let index = 0;
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
    // Throws once the queue is exhausted rather than replaying the last entry:
    // a reused Response fails opaquely on its second body read, which would
    // mask an assertion failure instead of reporting one.
    const response = responses[index];
    index += 1;
    if (response === undefined) {
      throw new Error(`fetch called ${index} time(s), only ${responses.length} queued`);
    }
    return response;
  }) as unknown as FakeFetch;
}

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

const called = (fetch: FakeFetch, index = 0) => {
  const call = fetch.mock.calls[index];
  if (call === undefined) {
    throw new Error(`fetch was not called ${index + 1} time(s)`);
  }
  const [url, init] = call;
  return {
    url: String(url),
    headers: (init?.headers ?? {}) as Record<string, string>,
    method: init?.method,
  };
};

describe('createMacroClient', () => {
  const build = (fetch: FakeFetch, tokenProvider: TokenProvider = tokens()) =>
    createMacroClient({ fetch, tokenProvider, config: settings });

  it('builds the upstream URL under /api/macro and sends the bearer token', async () => {
    const fetch = responding(json({ data: [] }));

    await build(fetch).get('/observations', '?indicators=GDP_GROWTH_REAL');

    const call = called(fetch);
    expect(call.url).toBe('https://core.example/api/macro/observations?indicators=GDP_GROWTH_REAL');
    expect(call.method).toBe('GET');
    expect(call.headers['authorization']).toBe('Bearer token-1');
  });

  it('tolerates a trailing slash on the configured base URL', async () => {
    const fetch = responding(json({ data: [] }));
    const client = createMacroClient({
      fetch,
      tokenProvider: tokens(),
      config: { ...settings, coreApiBaseUrl: 'https://core.example//' },
    });

    await client.get('/countries', '');

    expect(called(fetch).url).toBe('https://core.example/api/macro/countries');
  });

  it('passes the query string through byte for byte', async () => {
    const fetch = responding(json({ data: [] }));
    // Repeated keys, encoded characters and an empty value: re-serialising via a
    // parsed query object would quietly change all three.
    const search = '?indicators=A&indicators=B&vintage=WEO%2010.0.0%202026-04-14&q=&pageSize=25';

    await build(fetch).get('/series', search);

    expect(called(fetch).url).toBe(`https://core.example/api/macro/series${search}`);
  });

  it('forwards If-None-Match and relays a 304 with no body', async () => {
    const fetch = responding(
      new Response(null, { status: 304, headers: { etag: 'W/"v14"' } }),
    );

    const result = await build(fetch).get('/observations', '', { ifNoneMatch: 'W/"v14"' });

    expect(called(fetch).headers['if-none-match']).toBe('W/"v14"');
    expect(result.status).toBe(304);
    expect(result.body).toBe('');
    expect(result.headers['etag']).toBe('W/"v14"');
  });

  it('omits If-None-Match when the caller sent none', async () => {
    const fetch = responding(json({ data: [] }));

    await build(fetch).get('/observations', '');

    expect(called(fetch).headers['if-none-match']).toBeUndefined();
  });

  it('relays ETag, Cache-Control and X-Total-Count', async () => {
    const fetch = responding(
      json(
        { data: [] },
        {
          headers: {
            'content-type': 'application/json',
            etag: 'W/"v14"',
            'cache-control': 'private, max-age=3600',
            'x-total-count': '56',
          },
        },
      ),
    );

    const result = await build(fetch).get('/observations', '');

    expect(result.headers).toEqual({
      'content-type': 'application/json',
      etag: 'W/"v14"',
      'cache-control': 'private, max-age=3600',
      'x-total-count': '56',
    });
  });

  it('drops headers outside the allowlist rather than relaying them to a browser', async () => {
    const fetch = responding(
      json(
        { data: [] },
        {
          headers: {
            'content-type': 'application/json',
            'set-cookie': 'session=leak',
            authorization: 'Bearer upstream-token',
            'x-internal-trace': 'abc',
          },
        },
      ),
    );

    const result = await build(fetch).get('/countries', '');

    expect(Object.keys(result.headers)).toEqual(['content-type']);
  });

  it('returns an upstream 400 problem document verbatim rather than throwing', async () => {
    const problem = {
      type: 'https://cyte.example/problems/unknown-indicator',
      title: 'Unknown indicator',
      status: 400,
      detail: "Unknown indicator code 'GDP_GROWTH'",
    };
    const fetch = responding(
      new Response(JSON.stringify(problem), {
        status: 400,
        headers: { 'content-type': 'application/problem+json' },
      }),
    );

    const result = await build(fetch).get('/observations', '?indicators=GDP_GROWTH');

    expect(result.status).toBe(400);
    expect(result.headers['content-type']).toBe('application/problem+json');
    expect(JSON.parse(result.body)).toEqual(problem);
  });

  it('relays a 200 with empty data as the success it is', async () => {
    const fetch = responding(json({ data: [], meta: { totalCount: 0 } }));

    const result = await build(fetch).get('/observations', '');

    expect(result.status).toBe(200);
    expect(JSON.parse(result.body).data).toEqual([]);
  });

  it('relays an upstream 5xx without dressing it up', async () => {
    const fetch = responding(new Response('upstream exploded', { status: 503 }));

    const result = await build(fetch).get('/vintages', '');

    expect(result.status).toBe(503);
    expect(result.body).toBe('upstream exploded');
  });

  describe('the 401 retry', () => {
    it('refreshes the token once and retries once', async () => {
      const provider = tokens();
      const fetch = responding(
        new Response('{"error":"expired"}', { status: 401 }),
        json({ data: ['after retry'] }),
      );

      const result = await build(fetch, provider).get('/countries', '');

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(provider.invalidations).toBe(1);
      expect(called(fetch, 0).headers['authorization']).toBe('Bearer token-1');
      expect(called(fetch, 1).headers['authorization']).toBe('Bearer token-2');
      expect(result.status).toBe(200);
      expect(JSON.parse(result.body).data).toEqual(['after retry']);
    });

    it('gives up after the single retry and fails as a bad gateway, never a 401', async () => {
      const provider = tokens();
      const fetch = responding(
        new Response('{"error":"client super-secret-value revoked"}', { status: 401 }),
        new Response('{"error":"client super-secret-value revoked"}', { status: 401 }),
        json({ data: ['never reached'] }),
      );

      const failure = await build(fetch, provider)
        .get('/countries', '')
        .then(
          () => null,
          (error: unknown) => error as { status?: number; message?: string },
        );

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(provider.invalidations).toBe(1);
      // The service's credential, not the visitor's session: a 401 here would
      // sign every visitor out of the console.
      expect(failure?.status).toBe(502);
      expect(failure?.message).toBe('The Core API rejected the service credentials.');
      expect(failure?.message).not.toContain('super-secret-value');
    });

    it('fails a 403 as a bad gateway at once, without refreshing the token', async () => {
      const provider = tokens();
      const fetch = responding(new Response('{"error":"insufficient scope"}', { status: 403 }), json({ data: [] }));

      const failure = await build(fetch, provider)
        .get('/countries', '')
        .then(
          () => null,
          (error: unknown) => error as { status?: number; message?: string },
        );

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(provider.invalidations).toBe(0);
      expect(failure?.status).toBe(502);
      expect(failure?.message).toBe('The Core API rejected the service credentials.');
    });

    it.each([400, 404])('relays a %i without retrying', async (status) => {
      const provider = tokens();
      const fetch = responding(new Response('{"title":"Bad"}', { status }), json({ data: [] }));

      const result = await build(fetch, provider).get('/countries', '');

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(provider.invalidations).toBe(0);
      expect(result.status).toBe(status);
      expect(result.body).toBe('{"title":"Bad"}');
    });

    it('forwards If-None-Match on the retry too', async () => {
      const fetch = responding(
        new Response('{}', { status: 401 }),
        new Response(null, { status: 304 }),
      );

      await build(fetch).get('/observations', '', { ifNoneMatch: 'W/"v14"' });

      expect(called(fetch, 1).headers['if-none-match']).toBe('W/"v14"');
    });
  });

  describe('when the upstream is unreachable', () => {
    it('reports a 502 naming neither the token, the secret nor the URL', async () => {
      const fetch = vi.fn(async () => {
        throw new Error('connect ECONNREFUSED https://core.example/api/macro/countries');
      }) as unknown as FakeFetch;

      try {
        await build(fetch).get('/countries', '');
        throw new Error('expected get to reject');
      } catch (caught) {
        const error = caught as Error & { status?: number };

        expect(error.status).toBe(502);
        expect(error.message).toBe('Could not reach the Core API.');
        expect(error.message).not.toContain('core.example');
        expect(error.message).not.toContain('token-');
        expect(error.message).not.toContain('super-secret-value');
      }
    });
  });
});
