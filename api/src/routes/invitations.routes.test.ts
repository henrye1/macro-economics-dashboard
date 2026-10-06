import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import type { RequestHandler } from 'express';

import { createApp } from '../app.js';
import {
  RoleChangeError,
  type Invitation,
  type RoleChangeRefusal,
  type UserDirectory,
} from '../admin/user-directory.js';

const ADMIN_ID = 'a11ce000-0000-4000-8000-000000000001';
const INVITE_ID = 'b0b00000-0000-4000-8000-000000000002';

const PENDING: Invitation = {
  id: INVITE_ID,
  email: 'naledi@treasuryrisk.co.za',
  role: 'Member',
  invitedBy: 'Thandi Mokoena',
  sentAt: '2026-10-06T08:00:00.000Z',
  expiresAt: '2026-10-07T08:00:00.000Z',
  status: 'pending',
};

type Call = { op: string; organisation: string; callerId?: string; arg?: unknown };

/** A fake directory that records every call and can refuse with one reason. */
function fakeDirectory(refuse?: RoleChangeRefusal) {
  const calls: Call[] = [];
  const answer = <T>(value: T): Promise<T> =>
    refuse === undefined ? Promise.resolve(value) : Promise.reject(new RoleChangeError(refuse));

  const directory: UserDirectory = {
    listOrganisation: () => Promise.reject(new Error('not expected')),
    setRole: () => Promise.reject(new Error('not expected')),
    async listInvitations(organisation) {
      calls.push({ op: 'list', organisation });
      return [PENDING];
    },
    invite(organisation, callerId, email, role) {
      calls.push({ op: 'invite', organisation, callerId, arg: { email, role } });
      return answer({ ...PENDING, email, role });
    },
    revoke(organisation, callerId, id) {
      calls.push({ op: 'revoke', organisation, callerId, arg: id });
      return answer(undefined);
    },
    resend(organisation, callerId, id) {
      calls.push({ op: 'resend', organisation, callerId, arg: id });
      return answer({ ...PENDING, id: 'c0ffee00-0000-4000-8000-000000000003' });
    },
  };

  return { directory, calls };
}

/** `x-test-role` and `x-test-org` become the verified claims; no role, no `req.auth`. */
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

  return `http://127.0.0.1:${address.port}/api/admin/invitations`;
}

const ADMIN = { role: 'Administrator', org: 'Treasury Risk' };

async function serve(deps: Parameters<typeof createApp>[0]) {
  const base = await listen(
    createApp({ authSeam: testSeam, adminConfigured: true, inviteLinkTtlHours: 24, ...deps }),
  );

  return (
    path = '',
    init: { method?: string; body?: unknown; as?: { role?: string; org?: string } } = {},
  ) => {
    const as = init.as ?? ADMIN;
    return fetch(`${base}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        ...(as.role === undefined ? {} : { 'x-test-role': as.role }),
        ...(as.org === undefined ? {} : { 'x-test-org': as.org }),
        ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  };
}

describe('/api/admin/invitations', () => {
  describe('success', () => {
    it('lists the organisation’s invitations with the link lifetime', async () => {
      const fake = fakeDirectory();
      const request = await serve({ userDirectory: fake.directory });

      const response = await request();

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ data: [PENDING], expiresInHours: 24 });
      expect(fake.calls).toEqual([{ op: 'list', organisation: 'Treasury Risk' }]);
    });

    it('invites with a trimmed, lowercased email and answers 201', async () => {
      const fake = fakeDirectory();
      const request = await serve({ userDirectory: fake.directory });

      const response = await request('', {
        method: 'POST',
        body: { email: '  Kagiso@TreasuryRisk.co.za ', role: 'Administrator' },
      });

      expect(response.status).toBe(201);
      expect(((await response.json()) as { data: Invitation }).data.email).toBe('kagiso@treasuryrisk.co.za');
      expect(fake.calls).toEqual([
        {
          op: 'invite',
          organisation: 'Treasury Risk',
          callerId: ADMIN_ID,
          arg: { email: 'kagiso@treasuryrisk.co.za', role: 'Administrator' },
        },
      ]);
    });

    it('revokes with 204 and no body', async () => {
      const fake = fakeDirectory();
      const request = await serve({ userDirectory: fake.directory });

      const response = await request(`/${INVITE_ID}`, { method: 'DELETE' });

      expect(response.status).toBe(204);
      expect(await response.text()).toBe('');
      expect(fake.calls[0]).toMatchObject({ op: 'revoke', arg: INVITE_ID, callerId: ADMIN_ID });
    });

    it('resends with 201 and the new invitation', async () => {
      const fake = fakeDirectory();
      const request = await serve({ userDirectory: fake.directory });

      const response = await request(`/${INVITE_ID}/resend`, { method: 'POST' });

      expect(response.status).toBe(201);
      expect(((await response.json()) as { data: Invitation }).data.id).not.toBe(INVITE_ID);
    });

    it('trusts only the verified organisation and caller', async () => {
      const fake = fakeDirectory();
      const request = await serve({ userDirectory: fake.directory });

      await request('?organisation=Elsewhere', {
        method: 'POST',
        body: { email: 'k@tr.co.za', role: 'Member', organisation: 'Elsewhere', invited_by: 'x' },
      });

      expect(fake.calls).toEqual([
        {
          op: 'invite',
          organisation: 'Treasury Risk',
          callerId: ADMIN_ID,
          arg: { email: 'k@tr.co.za', role: 'Member' },
        },
      ]);
    });
  });

  describe('refusals', () => {
    it.each<[RoleChangeRefusal, number, string]>([
      ['caller-not-admin', 403, 'Your account is no longer an Administrator.'],
      ['not-found', 404, 'That invitation is not in your organisation.'],
      ['already-registered', 409, "This email address can't be invited."],
      ['rate-limited', 429, 'Too many invitations have been sent. Try again later.'],
    ])('maps %s to %i with its fixed message on every mutation', async (reason, status, message) => {
      const request = await serve({ userDirectory: fakeDirectory(reason).directory });

      for (const [path, method, body] of [
        ['', 'POST', { email: 'k@tr.co.za', role: 'Member' }],
        [`/${INVITE_ID}`, 'DELETE', undefined],
        [`/${INVITE_ID}/resend`, 'POST', undefined],
      ] as const) {
        const response = await request(path, { method, body });
        expect(response.status).toBe(status);
        expect(await response.json()).toEqual({ error: message });
      }
    });

    it.each<[string, string, string, unknown]>([
      ['an invalid email', '', 'POST', { email: 'not-an-email', role: 'Member' }],
      ['an email over 254 characters', '', 'POST', { email: `${'a'.repeat(250)}@x.co`, role: 'Member' }],
      ['an unknown role', '', 'POST', { email: 'k@tr.co.za', role: 'Owner' }],
      ['no body', '', 'POST', undefined],
      ['a revoke id that is not a uuid', '/nope', 'DELETE', undefined],
      ['a resend id that is not a uuid', '/nope/resend', 'POST', undefined],
    ])('answers 400 for %s, without asking the directory', async (_label, path, method, body) => {
      const fake = fakeDirectory();
      const request = await serve({ userDirectory: fake.directory });

      const response = await request(path, { method, body });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'The invitation is not valid.' });
      expect(fake.calls).toEqual([]);
    });

    it('answers 403 for a Member, 401 with no session, and 403 with no organisation', async () => {
      const fake = fakeDirectory();
      const request = await serve({ userDirectory: fake.directory });

      expect((await request('', { as: { role: 'Member', org: 'Treasury Risk' } })).status).toBe(403);
      expect((await request('', { as: {} })).status).toBe(401);
      const orphan = await request('', { as: { role: 'Administrator' } });
      expect(orphan.status).toBe(403);
      expect(await orphan.json()).toEqual({ error: 'This account has no organisation to administer.' });
      expect(fake.calls).toEqual([]);
    });

    it('answers 503 when unconfigured', async () => {
      const request = await serve({ adminConfigured: false });

      expect((await request()).status).toBe(503);
    });

    it('answers 502 when the directory fails, logging once and returning nothing of it', async () => {
      const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const failing: UserDirectory = {
        ...fakeDirectory().directory,
        invite: () => Promise.reject(new Error('GoTrue 500 service_role key=abc')),
      };
      const request = await serve({ userDirectory: failing });

      const response = await request('', { method: 'POST', body: { email: 'k@tr.co.za', role: 'Member' } });
      const text = await response.text();

      expect(response.status).toBe(502);
      expect(JSON.parse(text)).toEqual({ error: 'The user directory could not be reached.' });
      expect(text).not.toContain('GoTrue');
      expect(logged).toHaveBeenCalledTimes(1);
    });
  });
});

/** The seam as `createApp` really mounts it: no bearer, no invitations. */
describe('the real auth seam, mounted ahead of invitations', () => {
  it('refuses a request with no bearer token', async () => {
    const base = await listen(createApp({ userDirectory: fakeDirectory().directory, adminConfigured: true }));

    const response = await fetch(base, { headers: { 'x-test-role': 'Administrator', 'x-test-org': 'Treasury Risk' } });

    expect([401, 503]).toContain(response.status);
  });
});
