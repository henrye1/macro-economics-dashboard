import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import type { RequestHandler } from 'express';

import { createApp } from '../app.js';
import type { AdminUser, UserDirectory } from '../admin/user-directory.js';

const ADMIN_ID = 'a11ce000-0000-4000-8000-000000000001';

const people: Record<string, AdminUser[]> = {
  'Treasury Risk': [
    { id: ADMIN_ID, email: 'thandi@tr.co.za', fullName: 'Thandi Mokoena', role: 'Administrator', lastSignInAt: '2026-10-06T07:45:21.000Z' },
    { id: 'p', email: 'pieter@tr.co.za', fullName: 'Pieter van der Merwe', role: 'Member', lastSignInAt: null },
  ],
  Elsewhere: [
    { id: 'x', email: 'x@elsewhere.co.za', fullName: 'Someone Else', role: 'Administrator', lastSignInAt: null },
  ],
};

/** A fake directory that records which organisation it was asked about. */
function fakeDirectory() {
  const asked: string[] = [];
  const directory: UserDirectory = {
    async listOrganisation(organisation) {
      asked.push(organisation);
      return people[organisation] ?? [];
    },
  };

  return { directory, asked };
}

/**
 * Stands in for the auth seam. `x-test-role` and `x-test-org` become the
 * verified claims; no `x-test-role` leaves `req.auth` unset.
 */
const testSeam: RequestHandler = (req, _res, next) => {
  const role = req.header('x-test-role');

  if (role !== undefined) {
    const organisation = req.header('x-test-org');
    req.auth = {
      userId: ADMIN_ID,
      email: 'thandi@tr.co.za',
      role: role === '' ? null : role,
      organisation: organisation === undefined || organisation === '' ? null : organisation,
    };
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

async function listen(app: ReturnType<typeof createApp>): Promise<string> {
  const server = await new Promise<Server>((resolve) => {
    const started = app.listen(0, () => resolve(started));
  });
  servers.push(server);

  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('expected a TCP address');
  }

  return `http://127.0.0.1:${address.port}/api/admin/users`;
}

async function serve(deps: Parameters<typeof createApp>[0]) {
  const base = await listen(createApp({ authSeam: testSeam, adminConfigured: true, ...deps }));

  return (as: { role?: string; org?: string } = {}, search = '') =>
    fetch(`${base}${search}`, {
      headers: {
        ...(as.role === undefined ? {} : { 'x-test-role': as.role }),
        ...(as.org === undefined ? {} : { 'x-test-org': as.org }),
      },
    });
}

describe('GET /api/admin/users', () => {
  it('lists the Administrator’s own organisation', async () => {
    const fake = fakeDirectory();
    const request = await serve({ userDirectory: fake.directory });

    const response = await request({ role: 'Administrator', org: 'Treasury Risk' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: people['Treasury Risk'] });
    expect(fake.asked).toEqual(['Treasury Risk']);
  });

  it('takes the organisation from the verified session, never the request', async () => {
    const fake = fakeDirectory();
    const request = await serve({ userDirectory: fake.directory });

    const response = await request(
      { role: 'Administrator', org: 'Treasury Risk' },
      '?organisation=Elsewhere&org=Elsewhere',
    );

    expect(((await response.json()) as { data: AdminUser[] }).data.map((u) => u.id)).toEqual([
      ADMIN_ID,
      'p',
    ]);
    expect(fake.asked).toEqual(['Treasury Risk']);
  });

  describe('refusals', () => {
    it('answers 403 for a Member, without asking the directory', async () => {
      const fake = fakeDirectory();
      const request = await serve({ userDirectory: fake.directory });

      const response = await request({ role: 'Member', org: 'Treasury Risk' });

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: 'This account does not have permission for this request.',
      });
      expect(fake.asked).toEqual([]);
    });

    it('answers 403 for a caller with no role, who resolves to Member', async () => {
      const request = await serve({ userDirectory: fakeDirectory().directory });

      expect((await request({ role: '', org: 'Treasury Risk' })).status).toBe(403);
    });

    it('answers 401 when no verified caller reached the router', async () => {
      const fake = fakeDirectory();
      const request = await serve({ userDirectory: fake.directory });

      const response = await request();

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'This request carried no valid session.' });
      expect(fake.asked).toEqual([]);
    });

    it('answers 403 for an Administrator with no organisation', async () => {
      const fake = fakeDirectory();
      const request = await serve({ userDirectory: fake.directory });

      const response = await request({ role: 'Administrator' });

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: 'This account has no organisation to administer.',
      });
      expect(fake.asked).toEqual([]);
    });

    it('answers 503 when the service has no admin settings', async () => {
      const request = await serve({ adminConfigured: false });

      const response = await request({ role: 'Administrator', org: 'Treasury Risk' });

      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        error: 'Administration is not configured on this service.',
      });
    });

    it('answers 502 when the directory fails, logging the cause and returning none of it', async () => {
      const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const failing: UserDirectory = {
        listOrganisation: () => Promise.reject(new Error('JWT secret=abc rejected by GoTrue')),
      };
      const request = await serve({ userDirectory: failing });

      const response = await request({ role: 'Administrator', org: 'Treasury Risk' });
      const text = await response.text();

      expect(response.status).toBe(502);
      expect(JSON.parse(text)).toEqual({ error: 'The user directory could not be reached.' });
      expect(text).not.toContain('GoTrue');
      expect(text).not.toContain('secret');
      expect(logged).toHaveBeenCalledTimes(1);
    });
  });
});

/**
 * The seam as `createApp` really mounts it. Unconfigured on a clean checkout
 * (503) and configured on a developer's (401): either way it refuses a request
 * that carries no bearer token, whatever test headers it adds.
 */
describe('the real auth seam, mounted ahead of administration', () => {
  it('refuses a request with no bearer token', async () => {
    const base = await listen(
      createApp({ userDirectory: fakeDirectory().directory, adminConfigured: true }),
    );

    const response = await fetch(base, {
      headers: { 'x-test-role': 'Administrator', 'x-test-org': 'Treasury Risk' },
    });

    expect([401, 503]).toContain(response.status);
  });
});
