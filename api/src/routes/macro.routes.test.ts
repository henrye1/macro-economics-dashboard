import { afterEach, describe, expect, it, vi } from 'vitest';
import { request as httpRequest, type Server } from 'node:http';

import { createApp } from '../app.js';
import type { MacroClient, UpstreamResponse } from '../macro/macro-client.js';

/**
 * A stub upstream. Records what the routes asked for and answers with whatever
 * the test queued, so these assertions are about the relay and nothing else.
 */
function stubClient(response: Partial<UpstreamResponse> = {}) {
  const calls: {
    path: string;
    search: string;
    ifNoneMatch?: string | undefined;
    /** Every header key the route chose to forward, so the allowlist is observable. */
    headerKeys: string[];
  }[] = [];

  const client: MacroClient = {
    async get(path, search, headers) {
      calls.push({
        path,
        search,
        ifNoneMatch: headers?.ifNoneMatch,
        headerKeys: Object.keys(headers ?? {}),
      });
      return {
        status: response.status ?? 200,
        headers: response.headers ?? { 'content-type': 'application/json' },
        body: response.body ?? '{"data":[]}',
      };
    },
  };

  return { client, calls };
}

/** A client that fails the way an unreachable upstream does. */
const failingClient: MacroClient = {
  async get() {
    throw Object.assign(new Error('Could not reach the Core API.'), { status: 502 });
  },
};

const servers: Server[] = [];

/** Boots the app on an ephemeral port and returns a fetch bound to it. */
async function serve(deps?: Parameters<typeof createApp>[0]) {
  const app = createApp(deps);

  const server = await new Promise<Server>((resolve) => {
    const started = app.listen(0, () => resolve(started));
  });

  servers.push(server);

  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('expected a TCP address');
  }

  const base = `http://127.0.0.1:${address.port}`;

  return (path: string, init?: RequestInit) => fetch(`${base}${path}`, init);
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    servers.splice(0).map((server) => new Promise<void>((done) => server.close(() => done()))),
  );
});

const READ_ROUTES = ['countries', 'indicators', 'observations', 'series', 'vintages'] as const;

describe('/api/macro', () => {
  describe('when configured', () => {
    it('maps each read route to the matching upstream path', async () => {
      for (const route of READ_ROUTES) {
        const { client, calls } = stubClient();
        const request = await serve({ macroClient: client, macroConfigured: true });

        const response = await request(`/api/macro/${route}`);

        expect(response.status).toBe(200);
        expect(calls).toEqual([
          { path: `/${route}`, search: '', ifNoneMatch: undefined, headerKeys: ['ifNoneMatch'] },
        ]);
      }
    });

    it('maps the revisions route under its vintage id', async () => {
      const { client, calls } = stubClient();
      const request = await serve({ macroClient: client, macroConfigured: true });

      await request('/api/macro/vintages/14/revisions');

      expect(calls[0]?.path).toBe('/vintages/14/revisions');
    });

    it('hands the query string over untouched, repeats and encoding included', async () => {
      const { client, calls } = stubClient();
      const request = await serve({ macroClient: client, macroConfigured: true });
      const search = '?indicators=A&indicators=B&vintage=WEO%2010.0.0&q=&pageSize=25';

      await request(`/api/macro/observations${search}`);

      expect(calls[0]?.search).toBe(search);
    });

    it('forwards the caller If-None-Match', async () => {
      const { client, calls } = stubClient();
      const request = await serve({ macroClient: client, macroConfigured: true });

      await request('/api/macro/observations', { headers: { 'if-none-match': 'W/"v14"' } });

      expect(calls[0]?.ifNoneMatch).toBe('W/"v14"');
    });

    it('forwards no header the caller supplies beyond If-None-Match', async () => {
      const { client, calls } = stubClient();
      const request = await serve({ macroClient: client, macroConfigured: true });

      // A caller trying to supply their own upstream credentials, plus noise.
      await request('/api/macro/observations', {
        headers: {
          authorization: 'Bearer caller-chosen-token',
          cookie: 'session=theirs',
          'x-forwarded-host': 'evil.example',
        },
      });

      expect(calls[0]?.headerKeys).toEqual(['ifNoneMatch']);
      expect(calls[0]?.ifNoneMatch).toBeUndefined();
    });

    it('relays the upstream status, body and headers unchanged', async () => {
      const { client } = stubClient({
        status: 200,
        headers: {
          'content-type': 'application/json',
          etag: 'W/"v14"',
          'cache-control': 'private, max-age=3600',
          'x-total-count': '56',
        },
        body: '{"data":[{"year":2024}],"meta":{"totalCount":56}}',
      });
      const request = await serve({ macroClient: client, macroConfigured: true });

      const response = await request('/api/macro/observations');

      expect(response.status).toBe(200);
      expect(response.headers.get('etag')).toBe('W/"v14"');
      expect(response.headers.get('cache-control')).toBe('private, max-age=3600');
      expect(response.headers.get('x-total-count')).toBe('56');
      expect(await response.text()).toBe('{"data":[{"year":2024}],"meta":{"totalCount":56}}');
    });

    it('relays a 304 with no body', async () => {
      const { client } = stubClient({ status: 304, headers: { etag: 'W/"v14"' }, body: '' });
      const request = await serve({ macroClient: client, macroConfigured: true });

      const response = await request('/api/macro/observations', {
        headers: { 'if-none-match': 'W/"v14"' },
      });

      expect(response.status).toBe(304);
      expect(response.headers.get('etag')).toBe('W/"v14"');
      expect(await response.text()).toBe('');
    });

    it('relays a problem document with its status and content type intact', async () => {
      const problem = '{"title":"Unknown indicator","status":400,"detail":"Unknown code \'GDP\'"}';
      const { client } = stubClient({
        status: 400,
        headers: { 'content-type': 'application/problem+json' },
        body: problem,
      });
      const request = await serve({ macroClient: client, macroConfigured: true });

      const response = await request('/api/macro/observations?indicators=GDP');

      expect(response.status).toBe(400);
      expect(response.headers.get('content-type')).toContain('application/problem+json');
      // The detail naming the offending code survives: this is the whole point.
      expect(await response.text()).toBe(problem);
    });

    it('relays a 200 with empty data as a success', async () => {
      const { client } = stubClient({ body: '{"data":[],"meta":{"totalCount":0}}' });
      const request = await serve({ macroClient: client, macroConfigured: true });

      const response = await request('/api/macro/observations');

      expect(response.status).toBe(200);
      expect((JSON.parse(await response.text()) as { data: unknown[] }).data).toEqual([]);
    });

    it('exposes the caching headers to a cross-origin console', async () => {
      const { client } = stubClient();
      const request = await serve({ macroClient: client, macroConfigured: true });

      const response = await request('/api/macro/countries');
      const exposed = response.headers.get('access-control-expose-headers') ?? '';

      for (const header of ['ETag', 'Cache-Control', 'X-Total-Count']) {
        expect(exposed).toContain(header);
      }
    });
  });

  describe('vintage id validation', () => {
    it.each(['abc', '-1', '0', '1.5', '1e3', '%20'])(
      'rejects /vintages/%s/revisions with a 400 and never calls upstream',
      async (id) => {
        const { client, calls } = stubClient();
        const request = await serve({ macroClient: client, macroConfigured: true });

        const response = await request(`/api/macro/vintages/${id}/revisions`);

        expect(response.status).toBe(400);
        expect(calls).toEqual([]);
      },
    );

    it('says what is wrong without echoing the input', async () => {
      const { client } = stubClient();
      const request = await serve({ macroClient: client, macroConfigured: true });

      const response = await request('/api/macro/vintages/abc/revisions');

      expect(await response.json()).toEqual({
        error: 'The vintage id must be a positive integer.',
      });
    });
  });

  describe('when the service has no credentials', () => {
    it('answers 503 on every macro route', async () => {
      for (const route of READ_ROUTES) {
        const { client, calls } = stubClient();
        const request = await serve({ macroClient: client, macroConfigured: false });

        const response = await request(`/api/macro/${route}`);

        expect(response.status).toBe(503);
        expect(calls).toEqual([]);
      }
    });

    it('answers 503 on the revisions route too', async () => {
      const request = await serve({ macroConfigured: false });

      expect((await request('/api/macro/vintages/14/revisions')).status).toBe(503);
    });

    it('says so plainly, without naming a variable value', async () => {
      const request = await serve({ macroConfigured: false });

      const body = await (await request('/api/macro/countries')).json();

      expect(body).toEqual({
        error:
          'The macro service is not configured. Set the Auth0 and Core API environment variables.',
      });
    });

    it('leaves /api/health answering, so the service still boots', async () => {
      const request = await serve({ macroConfigured: false });

      const response = await request('/api/health');

      expect(response.status).toBe(200);
      expect(((await response.json()) as { status: string }).status).toBe('ok');
    });
  });

  describe('when the upstream cannot be reached', () => {
    it('answers 502 with a message that leaks nothing', async () => {
      const request = await serve({ macroClient: failingClient, macroConfigured: true });

      const response = await request('/api/macro/countries');
      const body = await response.text();

      expect(response.status).toBe(502);
      // The whole protection is that the throw site chose a fixed string. The
      // error handler relays `err.message` verbatim below 500, so asserting the
      // exact expected body is the assertion that can actually fail.
      expect(JSON.parse(body)).toEqual({ error: 'Could not reach the Core API.' });
    });

    it('keeps an unexpected fault at 500 with no detail, per the error handler', async () => {
      const exploding: MacroClient = {
        async get() {
          throw new Error('connection string postgres://user:secret@host failed');
        },
      };
      // The handler logs a 500 on purpose; silence it without hiding a failure
      // from the rest of the file if an assertion below throws.
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const request = await serve({ macroClient: exploding, macroConfigured: true });

      const response = await request('/api/macro/countries');
      const body = await response.text();

      expect(response.status).toBe(500);
      expect(body).not.toContain('postgres');
      expect(body).not.toContain('secret');
    });
  });

  it('runs with no injected deps at all, on the real configuration', async () => {
    // Exercises the production wiring: the real config has no credentials in
    // this repository, so the macro routes must say so and health must not care.
    const request = await serve();

    expect((await request('/api/macro/countries')).status).toBe(503);
    expect((await request('/api/health')).status).toBe(200);
  });

  it('still 404s an unknown path under /api', async () => {
    const request = await serve({ macroConfigured: true });

    expect((await request('/api/macro/nope')).status).toBe(404);
  });
});

/**
 * The relay's conditional-request behaviour, driven by `node:http`.
 *
 * These cannot use `fetch`: undici always attaches `cache-control: no-cache`,
 * which forces Express's `req.fresh` to false and hides the exact bug this
 * block exists to catch. A browser sends no such header.
 */
describe('/api/macro conditional requests, over raw HTTP', () => {
  const rawServers: Server[] = [];

  /** Boots the app and issues one GET with no headers beyond those given. */
  async function rawGet(
    deps: Parameters<typeof createApp>[0],
    path: string,
    headers: Record<string, string> = {},
  ): Promise<{ status: number; body: string; headers: Record<string, string | string[]> }> {
    const app = createApp(deps);
    const server = await new Promise<Server>((resolve) => {
      const started = app.listen(0, () => resolve(started));
    });
    rawServers.push(server);

    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected a TCP address');
    }

    return new Promise((resolve, reject) => {
      const request = httpRequest(
        { port: address.port, host: '127.0.0.1', path, method: 'GET', headers },
        (response) => {
          let body = '';
          response.on('data', (chunk) => {
            body += String(chunk);
          });
          response.on('end', () => {
            resolve({
              status: response.statusCode ?? 0,
              body,
              headers: response.headers as Record<string, string | string[]>,
            });
          });
        },
      );

      request.on('error', reject);
      request.end();
    });
  }

  afterEach(async () => {
    await Promise.all(
      rawServers.splice(0).map((server) => new Promise<void>((done) => server.close(() => done()))),
    );
  });

  it('relays a 200 in full even when the caller already holds its ETag', async () => {
    // The Core API derives its ETag from the underlying vintages, not from the
    // body, so one validator is shared across queries. A relayed 200 carrying an
    // ETag the caller happens to hold must stay a 200 with its rows intact.
    const { client } = stubClient({
      status: 200,
      headers: { 'content-type': 'application/json', etag: 'W/"v14"' },
      body: '{"data":[{"year":2024}]}',
    });

    const response = await rawGet(
      { macroClient: client, macroConfigured: true },
      '/api/macro/observations',
      { 'if-none-match': 'W/"v14"' },
    );

    expect(response.status).toBe(200);
    expect(response.body).toBe('{"data":[{"year":2024}]}');
  });

  it('never invents an ETag the Core API did not issue', async () => {
    const { client } = stubClient({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: '{"data":[]}',
    });

    const response = await rawGet(
      { macroClient: client, macroConfigured: true },
      '/api/macro/countries',
    );

    expect(response.status).toBe(200);
    expect(response.headers['etag']).toBeUndefined();
  });

  it('relays the Content-Type without appending a charset', async () => {
    const { client } = stubClient({
      status: 400,
      headers: { 'content-type': 'application/problem+json' },
      body: '{"detail":"Unknown code"}',
    });

    const response = await rawGet(
      { macroClient: client, macroConfigured: true },
      '/api/macro/observations?indicators=NOPE',
    );

    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toBe('application/problem+json');
  });

  it('still relays an upstream 304 as a bodyless 304', async () => {
    const { client } = stubClient({ status: 304, headers: { etag: 'W/"v14"' }, body: '' });

    const response = await rawGet(
      { macroClient: client, macroConfigured: true },
      '/api/macro/observations',
      { 'if-none-match': 'W/"v14"' },
    );

    expect(response.status).toBe(304);
    expect(response.body).toBe('');
    expect(response.headers['etag']).toBe('W/"v14"');
  });
});
