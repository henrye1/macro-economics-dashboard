import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import type { RequestHandler } from 'express';

import { createApp } from '../app.js';
import type { SavedQueryRepository } from '../saved-queries/saved-query-repository.js';
import { firstPerName, type SavedQuery } from '../saved-queries/saved-query.schema.js';

const query = {
  indicators: ['NGDP_RPCH'],
  countries: ['ZAF'],
  yearFrom: 2018,
  yearTo: 2030,
  source: 'preferred',
  forecast: 'all',
  vintage: 'latest',
  page: 1,
  pageSize: 25,
};

const ALICE = 'a11ce000-0000-4000-8000-000000000001';
const BOB = 'b0b00000-0000-4000-8000-000000000002';

/**
 * An in-memory repository with the production one's rules: rows keyed by owner
 * and name, newest first, import keeps what is already held. `calls` records
 * every owner the routes asked about, which is what the scoping tests assert.
 */
function memoryRepository(now = () => '2026-10-06T09:00:00.000Z') {
  const rows = new Map<string, SavedQuery[]>();
  const owners: string[] = [];

  const held = (userId: string) => rows.get(userId) ?? [];
  const sorted = (entries: SavedQuery[]) =>
    [...entries].sort((a, b) => b.savedAt.localeCompare(a.savedAt) || a.name.localeCompare(b.name));

  const repository: SavedQueryRepository = {
    async list(userId) {
      owners.push(userId);
      return sorted(held(userId));
    },
    async save(userId, entry) {
      owners.push(userId);
      const saved = { ...entry, savedAt: now() };
      rows.set(userId, [saved, ...held(userId).filter((row) => row.name !== entry.name)]);
      return saved;
    },
    async import(userId, entries) {
      owners.push(userId);
      const names = new Set(held(userId).map((row) => row.name));
      const fresh = firstPerName(entries).filter((entry) => !names.has(entry.name));
      rows.set(userId, [...held(userId), ...fresh]);
      return sorted(held(userId));
    },
  };

  return { repository, rows, owners };
}

/**
 * Stands in for the auth seam: the `x-test-user` header becomes a verified
 * caller, and no header leaves `req.auth` unset, as an open path would.
 */
const testSeam: RequestHandler = (req, _res, next) => {
  const userId = req.header('x-test-user');

  if (userId !== undefined) {
    req.auth = { userId, email: `${userId}@example.com`, role: null, organisation: null };
  }

  next();
};

const servers: Server[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    servers.splice(0).map((server) => new Promise<void>((done) => server.close(() => done()))),
  );
});

async function serve(deps: Parameters<typeof createApp>[0]) {
  const app = createApp({ authSeam: testSeam, savedQueriesConfigured: true, ...deps });

  const server = await new Promise<Server>((resolve) => {
    const started = app.listen(0, () => resolve(started));
  });
  servers.push(server);

  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('expected a TCP address');
  }

  const base = `http://127.0.0.1:${address.port}/api/saved-queries`;

  return (path: string, init: { method?: string; user?: string; body?: unknown } = {}) =>
    fetch(`${base}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        ...(init.user === undefined ? {} : { 'x-test-user': init.user }),
        ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
}

const entry = (name: string, savedAt: string): SavedQuery => ({
  name,
  query,
  vintageIds: [12],
  savedAt,
});

describe('/api/saved-queries', () => {
  it('lists only the caller’s queries, newest first', async () => {
    const memory = memoryRepository();
    memory.rows.set(ALICE, [
      entry('Older', '2026-10-01T00:00:00.000Z'),
      entry('Newer', '2026-10-05T00:00:00.000Z'),
    ]);
    memory.rows.set(BOB, [entry('Bob’s', '2026-10-06T00:00:00.000Z')]);
    const request = await serve({ savedQueryRepository: memory.repository });

    const response = await request('/', { user: ALICE });

    expect(response.status).toBe(200);
    expect(((await response.json()) as { data: SavedQuery[] }).data.map((row: SavedQuery) => row.name)).toEqual([
      'Newer',
      'Older',
    ]);
    expect(memory.owners).toEqual([ALICE]);
  });

  it('saves by name with the server’s time, replacing an entry of that name', async () => {
    const memory = memoryRepository();
    memory.rows.set(ALICE, [entry('Q1', '2026-10-01T00:00:00.000Z')]);
    const request = await serve({ savedQueryRepository: memory.repository });

    const response = await request('/', {
      method: 'PUT',
      user: ALICE,
      body: { name: '  Q1  ', query, vintageIds: [14] },
    });

    expect(response.status).toBe(200);
    expect(((await response.json()) as { data: SavedQuery }).data).toEqual({
      name: 'Q1',
      query,
      vintageIds: [14],
      savedAt: '2026-10-06T09:00:00.000Z',
    });
    expect(memory.rows.get(ALICE)).toHaveLength(1);
  });

  it('ignores an owner named in the body', async () => {
    const memory = memoryRepository();
    const request = await serve({ savedQueryRepository: memory.repository });

    await request('/', {
      method: 'PUT',
      user: ALICE,
      body: { name: 'Mine', query, vintageIds: [], userId: BOB, user_id: BOB },
    });
    await request('/import', {
      method: 'POST',
      user: ALICE,
      body: { data: [{ ...entry('Imported', '2026-10-02T00:00:00.000Z'), userId: BOB }], userId: BOB },
    });

    expect(memory.owners).toEqual([ALICE, ALICE]);
    expect(memory.rows.has(BOB)).toBe(false);
    expect(memory.rows.get(ALICE)?.map((row) => row.name)).toEqual(['Mine', 'Imported']);
  });

  it('imports with each entry’s own time, keeps the account’s version on a clash, and lists', async () => {
    const memory = memoryRepository();
    memory.rows.set(ALICE, [{ ...entry('Shared', '2026-10-04T00:00:00.000Z'), vintageIds: [99] }]);
    const request = await serve({ savedQueryRepository: memory.repository });

    const response = await request('/import', {
      method: 'POST',
      user: ALICE,
      body: {
        data: [
          entry('Shared', '2026-10-01T00:00:00.000Z'),
          entry('Local', '2026-10-02T00:00:00.000Z'),
        ],
      },
    });

    expect(response.status).toBe(200);
    expect(((await response.json()) as { data: SavedQuery[] }).data).toEqual([
      { ...entry('Shared', '2026-10-04T00:00:00.000Z'), vintageIds: [99] },
      entry('Local', '2026-10-02T00:00:00.000Z'),
    ]);
  });

  it('imports an empty list as a plain listing', async () => {
    const memory = memoryRepository();
    const request = await serve({ savedQueryRepository: memory.repository });

    const response = await request('/import', { method: 'POST', user: ALICE, body: { data: [] } });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [] });
  });

  describe('refusals', () => {
    it.each<[string, string, string, unknown]>([
      ['a save with no name', 'PUT', '/', { name: ' ', query, vintageIds: [] }],
      ['a save with a malformed query', 'PUT', '/', { name: 'X', query: { ...query, page: '1' }, vintageIds: [] }],
      ['a save with no body', 'PUT', '/', undefined],
      ['an import that is not a list', 'POST', '/import', { data: 'everything' }],
      ['an import with a bad timestamp', 'POST', '/import', { data: [entry('X', 'later')] }],
    ])('answers 400 with only the fixed message for %s', async (_label, method, path, body) => {
      const memory = memoryRepository();
      const request = await serve({ savedQueryRepository: memory.repository });

      const response = await request(path, { method, user: ALICE, body });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'The saved query is not valid.' });
      expect(memory.owners).toEqual([]);
    });

    it('answers 401 when no verified caller reached the router', async () => {
      const memory = memoryRepository();
      const request = await serve({ savedQueryRepository: memory.repository });

      const response = await request('/');

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'This request carried no valid session.' });
      expect(memory.owners).toEqual([]);
    });

    it('answers 503 when the service has no saved-query settings', async () => {
      const request = await serve({ savedQueriesConfigured: false });

      const response = await request('/', { user: ALICE });

      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        error: 'Saved queries are not configured on this service.',
      });
    });

    it('answers 502 when the store fails, logging the cause and returning none of it', async () => {
      const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const failing: SavedQueryRepository = {
        list: () => Promise.reject(new Error('relation "saved_queries" does not exist; key=secret')),
        save: () => Promise.reject(new Error('boom')),
        import: () => Promise.reject(new Error('boom')),
      };
      const request = await serve({ savedQueryRepository: failing });

      const response = await request('/', { user: ALICE });
      const text = await response.text();

      expect(response.status).toBe(502);
      expect(JSON.parse(text)).toEqual({ error: 'Saved queries could not be reached.' });
      expect(text).not.toContain('saved_queries');
      expect(text).not.toContain('secret');
      expect(logged).toHaveBeenCalledTimes(1);
    });
  });
});

/**
 * The seam as `createApp` really mounts it. Unconfigured on a clean checkout
 * (503) and configured on a developer's (401): either way it refuses.
 */
describe('the real auth seam, mounted ahead of saved queries', () => {
  it('refuses a request with no bearer token', async () => {
    const app = createApp({ savedQueryRepository: memoryRepository().repository, savedQueriesConfigured: true });
    const server = await new Promise<Server>((resolve) => {
      const started = app.listen(0, () => resolve(started));
    });
    servers.push(server);

    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected a TCP address');
    }

    const response = await fetch(`http://127.0.0.1:${address.port}/api/saved-queries`, {
      headers: { 'x-test-user': ALICE },
    });

    expect([401, 503]).toContain(response.status);
  });
});
