import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import type { RequestHandler } from 'express';

import { createApp } from '../app.js';
import {
  RoleChangeError,
  type AdminUser,
  type RoleChangeRefusal,
  type UserDirectory,
} from '../admin/user-directory.js';

/** The invitation half of the directory, unused by these routes. */
const noInvitations = {
  listInvitations: () => Promise.reject(new Error('not expected')),
  invite: () => Promise.reject(new Error('not expected')),
  revoke: () => Promise.reject(new Error('not expected')),
  resend: () => Promise.reject(new Error('not expected')),
};

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
function fakeDirectory(refuse?: RoleChangeRefusal) {
  const asked: string[] = [];
  const changes: { organisation: string; callerId: string; targetId: string; role: string }[] = [];
  const directory: UserDirectory = {
    ...noInvitations,
    async listOrganisation(organisation) {
      asked.push(organisation);
      return people[organisation] ?? [];
    },
    async setRole(organisation, callerId, targetId, role) {
      changes.push({ organisation, callerId, targetId, role });
      if (refuse !== undefined) {
        throw new RoleChangeError(refuse);
      }
      return { ...people['Treasury Risk']![1]!, id: targetId, role };
    },
  };

  return { directory, asked, changes };
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

  return (
    as: { role?: string; org?: string } = {},
    search = '',
    init: { method?: string; body?: unknown } = {},
  ) =>
    fetch(`${base}${search}`, {
      method: init.method ?? 'GET',
      headers: {
        ...(as.role === undefined ? {} : { 'x-test-role': as.role }),
        ...(as.org === undefined ? {} : { 'x-test-org': as.org }),
        ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
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
    ...noInvitations,
        listOrganisation: () => Promise.reject(new Error('JWT secret=abc rejected by GoTrue')),
        setRole: () => Promise.reject(new Error('not expected')),
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

describe('PUT /api/admin/users/:id/role', () => {
  const TARGET = 'b0b00000-0000-4000-8000-000000000002';
  const ADMIN_CALLER = { role: 'Administrator', org: 'Treasury Risk' };

  const put = (
    request: Awaited<ReturnType<typeof serve>>,
    body: unknown,
    as: { role?: string; org?: string } = ADMIN_CALLER,
    path = `/${TARGET}/role`,
  ) => request(as, path, { method: 'PUT', body });

  it('changes the role and answers with the updated person', async () => {
    const fake = fakeDirectory();
    const request = await serve({ userDirectory: fake.directory });

    const response = await put(request, { role: 'Administrator' });

    expect(response.status).toBe(200);
    expect(((await response.json()) as { data: AdminUser }).data).toMatchObject({
      id: TARGET,
      role: 'Administrator',
    });
    expect(fake.changes).toEqual([
      { organisation: 'Treasury Risk', callerId: ADMIN_ID, targetId: TARGET, role: 'Administrator' },
    ]);
  });

  it('trusts only the verified organisation and caller, never the body or query', async () => {
    const fake = fakeDirectory();
    const request = await serve({ userDirectory: fake.directory });

    await put(
      request,
      { role: 'Member', organisation: 'Elsewhere', callerId: 'x', userId: 'x' },
      ADMIN_CALLER,
      `/${TARGET}/role?organisation=Elsewhere&callerId=x`,
    );

    expect(fake.changes).toEqual([
      { organisation: 'Treasury Risk', callerId: ADMIN_ID, targetId: TARGET, role: 'Member' },
    ]);
  });

  it.each<[RoleChangeRefusal, number, string]>([
    ['caller-not-admin', 403, 'Your account is no longer an Administrator.'],
    ['self', 403, "You can't change your own role."],
    ['not-found', 404, 'That person is not in your organisation.'],
    ['last-admin', 409, 'This would leave your organisation without an Administrator.'],
  ])('maps a %s refusal to %i with its fixed message', async (reason, status, message) => {
    const request = await serve({ userDirectory: fakeDirectory(reason).directory });

    const response = await put(request, { role: 'Member' });

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: message });
  });

  it.each<[string, string, unknown]>([
    ['an id that is not a uuid', '/not-a-uuid/role', { role: 'Member' }],
    ['an unknown role', `/${TARGET}/role`, { role: 'Owner' }],
    ['a near-miss role', `/${TARGET}/role`, { role: 'administrator' }],
    ['no body', `/${TARGET}/role`, undefined],
  ])('answers 400 for %s, without asking the directory', async (_label, path, body) => {
    const fake = fakeDirectory();
    const request = await serve({ userDirectory: fake.directory });

    const response = await put(request, body, ADMIN_CALLER, path);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'The role change is not valid.' });
    expect(fake.changes).toEqual([]);
  });

  it('answers 403 for a Member, without asking the directory', async () => {
    const fake = fakeDirectory();
    const request = await serve({ userDirectory: fake.directory });

    const response = await put(
      request,
      { role: 'Administrator' },
      { role: 'Member', org: 'Treasury Risk' },
    );

    expect(response.status).toBe(403);
    expect(fake.changes).toEqual([]);
  });

  it('answers 401 with no session and 403 with no organisation', async () => {
    const fake = fakeDirectory();
    const request = await serve({ userDirectory: fake.directory });

    expect((await put(request, { role: 'Member' }, {})).status).toBe(401);
    const orphan = await put(request, { role: 'Member' }, { role: 'Administrator' });
    expect(orphan.status).toBe(403);
    expect(await orphan.json()).toEqual({ error: 'This account has no organisation to administer.' });
    expect(fake.changes).toEqual([]);
  });

  it('answers 503 when unconfigured', async () => {
    const request = await serve({ adminConfigured: false });

    expect((await put(request, { role: 'Member' })).status).toBe(503);
  });

  it('answers 502 when the write fails, logging once and returning nothing of it', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failing: UserDirectory = {
    ...noInvitations,
      listOrganisation: () => Promise.resolve([]),
      setRole: () => Promise.reject(new Error('GoTrue 500 service_role key=abc')),
    };
    const request = await serve({ userDirectory: failing });

    const response = await put(request, { role: 'Member' });
    const text = await response.text();

    expect(response.status).toBe(502);
    expect(JSON.parse(text)).toEqual({ error: 'The user directory could not be reached.' });
    expect(text).not.toContain('GoTrue');
    expect(logged).toHaveBeenCalledTimes(1);
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
