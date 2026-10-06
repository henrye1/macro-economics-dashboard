import { describe, expect, it, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

import {
  RoleChangeError,
  createDirectory,
  inOrganisation,
  isPendingInvitee,
  toAdminUser,
  toInvitation,
  type AdminUsersClient,
} from './user-directory.js';

/** For stubs that never invite or delete: calling either is a test failure. */
const unusedInviteMethods = {
  async inviteUserByEmail(): Promise<never> {
    throw new Error('not expected');
  },
  async deleteUser(): Promise<never> {
    throw new Error('not expected');
  },
};

function user(overrides: Partial<User> = {}): User {
  return {
    id: 'a11ce000-0000-4000-8000-000000000001',
    aud: 'authenticated',
    created_at: '2026-01-01T00:00:00Z',
    email: 'thandi.mokoena@treasuryrisk.co.za',
    app_metadata: { role: 'Administrator', organisation: 'Treasury Risk', provider: 'email' },
    user_metadata: { full_name: 'Thandi Mokoena' },
    last_sign_in_at: '2026-10-06T07:45:21.123456+00:00',
    ...overrides,
  } as User;
}

describe('toAdminUser', () => {
  it('maps a user to exactly the documented fields', () => {
    const mapped = toAdminUser(
      user({ phone: '+27 82 000 0000', identities: [], factors: [] } as Partial<User>),
    );

    expect(mapped).toEqual({
      id: 'a11ce000-0000-4000-8000-000000000001',
      email: 'thandi.mokoena@treasuryrisk.co.za',
      fullName: 'Thandi Mokoena',
      role: 'Administrator',
      lastSignInAt: '2026-10-06T07:45:21.123Z',
    });
  });

  it('falls back to the email before @ when there is no full name', () => {
    expect(toAdminUser(user({ user_metadata: {} })).fullName).toBe('thandi.mokoena');
    expect(toAdminUser(user({ user_metadata: { full_name: '' } })).fullName).toBe('thandi.mokoena');
  });

  it('resolves the role from app_metadata, never user_metadata', () => {
    expect(
      toAdminUser(
        user({ app_metadata: { organisation: 'Treasury Risk' }, user_metadata: { role: 'Administrator' } }),
      ).role,
    ).toBe('Member');
    expect(toAdminUser(user({ app_metadata: { role: 'administrator' } })).role).toBe('Member');
  });

  it('reports never having signed in as null', () => {
    expect(toAdminUser(user({ last_sign_in_at: undefined })).lastSignInAt).toBeNull();
  });
});

describe('inOrganisation', () => {
  it('matches the organisation exactly', () => {
    expect(inOrganisation(user(), 'Treasury Risk')).toBe(true);
  });

  it.each(['treasury risk', 'Treasury Risk ', 'Treasury'])('does not match %j', (organisation) => {
    expect(inOrganisation(user(), organisation)).toBe(false);
  });

  it('never matches a missing or empty organisation on either side', () => {
    expect(inOrganisation(user({ app_metadata: {} }), 'Treasury Risk')).toBe(false);
    expect(inOrganisation(user({ app_metadata: { organisation: '' } }), '')).toBe(false);
    expect(inOrganisation(user(), '')).toBe(false);
  });

  it('ignores an organisation the user wrote for themselves', () => {
    expect(
      inOrganisation(
        user({ app_metadata: {}, user_metadata: { organisation: 'Treasury Risk' } }),
        'Treasury Risk',
      ),
    ).toBe(false);
  });
});

describe('createDirectory', () => {
  /** A stubbed admin client serving `all` in pages of `perPage`. */
  function client(all: User[]) {
    const pages: number[] = [];

    const stub: AdminUsersClient = {
      ...unusedInviteMethods,
      async listUsers({ page, perPage }) {
        pages.push(page);
        return { data: { users: all.slice((page - 1) * perPage, page * perPage) }, error: null };
      },
      async updateUserById() {
        throw new Error('not expected');
      },
    };

    return { stub, pages };
  }

  it('reads every page, keeps only the organisation and sorts by name then email', async () => {
    const many = Array.from({ length: 1000 }, (_, i) =>
      user({ id: `other-${i}`, email: `x${i}@elsewhere.co.za`, app_metadata: { organisation: 'Elsewhere' } }),
    );
    const ours = [
      user({ id: 'b', email: 'b@treasuryrisk.co.za', user_metadata: { full_name: 'Zola' } }),
      user({ id: 'c', email: 'c@treasuryrisk.co.za', user_metadata: { full_name: 'Ayesha' } }),
      user({ id: 'a', email: 'a@treasuryrisk.co.za', user_metadata: { full_name: 'Ayesha' } }),
    ];
    const { stub, pages } = client([...many, ...ours]);

    const listed = await createDirectory(stub).listOrganisation('Treasury Risk');

    expect(pages).toEqual([1, 2]);
    expect(listed.map((entry) => entry.id)).toEqual(['a', 'c', 'b']);
  });

  it('throws the client error for the route to log', async () => {
    const failing: AdminUsersClient = {
      ...unusedInviteMethods,
      async listUsers() {
        return { data: { users: [] }, error: new Error('service unavailable') };
      },
      async updateUserById() {
        throw new Error('not expected');
      },
    };

    await expect(createDirectory(failing).listOrganisation('Treasury Risk')).rejects.toThrow(
      'service unavailable',
    );
  });
});

describe('setRole', () => {
  const ORG = 'Treasury Risk';
  const CALLER = 'caller-0000';

  function person(id: string, role: string | undefined, organisation: string = ORG): User {
    return user({
      id,
      email: `${id}@treasuryrisk.co.za`,
      user_metadata: { full_name: id },
      app_metadata: { provider: 'email', organisation, ...(role === undefined ? {} : { role }) },
    });
  }

  /**
   * A stateful stub: `updateUserById` replaces `app_metadata` wholesale, the
   * harsher of the two behaviours Supabase could have, and each call yields a
   * turn so concurrent calls genuinely interleave.
   */
  function project(people: User[]) {
    const users = new Map(people.map((entry) => [entry.id, entry]));
    const writes: { id: string; app_metadata: Record<string, unknown> }[] = [];

    const stub: AdminUsersClient = {
      ...unusedInviteMethods,
      async listUsers() {
        await Promise.resolve();
        return { data: { users: [...users.values()] }, error: null };
      },
      async updateUserById(id, { app_metadata }) {
        await Promise.resolve();
        writes.push({ id, app_metadata });
        const updated = { ...users.get(id)!, app_metadata } as User;
        users.set(id, updated);
        return { data: { user: updated }, error: null };
      },
    };

    return { directory: createDirectory(stub), writes, users };
  }

  async function refusal(promise: Promise<unknown>): Promise<string | undefined> {
    try {
      await promise;
      return undefined;
    } catch (error) {
      expect(error).toBeInstanceOf(RoleChangeError);
      return (error as RoleChangeError).reason;
    }
  }

  it('promotes a Member, keeping every other app_metadata field', async () => {
    const { directory, writes } = project([person(CALLER, 'Administrator'), person('pieter', 'Member')]);

    const updated = await directory.setRole(ORG, CALLER, 'pieter', 'Administrator');

    expect(updated.role).toBe('Administrator');
    expect(updated.id).toBe('pieter');
    expect(writes).toEqual([
      { id: 'pieter', app_metadata: { provider: 'email', organisation: ORG, role: 'Administrator' } },
    ]);
  });

  it('demotes an Administrator while another remains', async () => {
    const { directory } = project([person(CALLER, 'Administrator'), person('johan', 'Administrator')]);

    expect((await directory.setRole(ORG, CALLER, 'johan', 'Member')).role).toBe('Member');
  });

  it('writes nothing when the role already matches', async () => {
    const { directory, writes } = project([person(CALLER, 'Administrator'), person('lerato', 'Member')]);

    expect((await directory.setRole(ORG, CALLER, 'lerato', 'Member')).role).toBe('Member');
    expect(writes).toEqual([]);
  });

  it('treats a user with no role as a Member being promoted', async () => {
    const { directory, writes } = project([person(CALLER, 'Administrator'), person('sipho', undefined)]);

    await directory.setRole(ORG, CALLER, 'sipho', 'Administrator');

    expect(writes[0]?.app_metadata).toEqual({ provider: 'email', organisation: ORG, role: 'Administrator' });
  });

  it('refuses a caller the directory no longer calls an Administrator', async () => {
    const { directory, writes } = project([person(CALLER, 'Member'), person('pieter', 'Member')]);

    expect(await refusal(directory.setRole(ORG, CALLER, 'pieter', 'Administrator'))).toBe(
      'caller-not-admin',
    );
    expect(writes).toEqual([]);
  });

  it('refuses a caller who has left the organisation', async () => {
    const { directory } = project([person(CALLER, 'Administrator', 'Elsewhere'), person('pieter', 'Member')]);

    expect(await refusal(directory.setRole(ORG, CALLER, 'pieter', 'Administrator'))).toBe(
      'caller-not-admin',
    );
  });

  it('answers not-found for a missing target and for one in another organisation alike', async () => {
    const { directory, writes } = project([
      person(CALLER, 'Administrator'),
      person('outsider', 'Member', 'Elsewhere'),
    ]);

    expect(await refusal(directory.setRole(ORG, CALLER, 'nobody', 'Administrator'))).toBe('not-found');
    expect(await refusal(directory.setRole(ORG, CALLER, 'outsider', 'Administrator'))).toBe(
      'not-found',
    );
    expect(writes).toEqual([]);
  });

  it('refuses a change to your own role, even one that would also orphan the organisation', async () => {
    const { directory } = project([person(CALLER, 'Administrator')]);

    expect(await refusal(directory.setRole(ORG, CALLER, CALLER, 'Member'))).toBe('self');
  });

  it('cannot reach last-admin through the earlier rules, because the caller is always one left', async () => {
    // Rule 2 makes the caller a live Administrator and rule 4 keeps them from
    // being the target, so demoting anyone else always leaves the caller. The
    // last-admin rule stays as a backstop should either rule ever change.
    const { directory } = project([person(CALLER, 'Administrator'), person('johan', 'Administrator')]);

    await directory.setRole(ORG, CALLER, 'johan', 'Member');

    // Johan, now a Member, cannot then demote the caller.
    expect(await refusal(directory.setRole(ORG, 'johan', CALLER, 'Member'))).toBe('caller-not-admin');
  });

  it('lets only one of two simultaneous demotions through, so an Administrator always remains', async () => {
    const { directory, users } = project([person('a', 'Administrator'), person('b', 'Administrator')]);

    const results = await Promise.allSettled([
      directory.setRole(ORG, 'a', 'b', 'Member'),
      directory.setRole(ORG, 'b', 'a', 'Member'),
    ]);

    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
    expect((results[1] as PromiseRejectedResult).reason.reason).toBe('caller-not-admin');
    const admins = [...users.values()].filter((entry) => entry.app_metadata.role === 'Administrator');
    expect(admins.map((entry) => entry.id)).toEqual(['a']);
  });

  it('keeps serving the queue after a refusal', async () => {
    const { directory } = project([person(CALLER, 'Administrator'), person('pieter', 'Member')]);

    await refusal(directory.setRole(ORG, CALLER, 'nobody', 'Member'));

    expect((await directory.setRole(ORG, CALLER, 'pieter', 'Administrator')).role).toBe('Administrator');
  });

  it('rethrows a client failure on write', async () => {
    const failing: AdminUsersClient = {
      ...unusedInviteMethods,
      async listUsers() {
        return { data: { users: [person(CALLER, 'Administrator'), person('pieter', 'Member')] }, error: null };
      },
      async updateUserById() {
        return { data: { user: null }, error: new Error('rate limited') };
      },
    };

    await expect(
      createDirectory(failing).setRole(ORG, CALLER, 'pieter', 'Administrator'),
    ).rejects.toThrow('rate limited');
  });
});

describe('invitations', () => {
  const ORG = 'Treasury Risk';
  const ADMIN = 'aaaaaaaa-0000-4000-8000-000000000001';
  const NOW = new Date('2026-10-06T12:00:00.000Z');

  function member(id: string, overrides: Partial<User> = {}): User {
    return user({
      id,
      email: `${id}@treasuryrisk.co.za`,
      user_metadata: { full_name: id === ADMIN ? 'Thandi Mokoena' : id },
      app_metadata: { provider: 'email', organisation: ORG, role: 'Member' },
      email_confirmed_at: '2026-01-01T00:00:00Z',
      last_sign_in_at: '2026-10-01T00:00:00Z',
      ...overrides,
    });
  }

  function invitee(id: string, invitedAt: string, overrides: Partial<User> = {}): User {
    return user({
      id,
      email: `${id}@treasuryrisk.co.za`,
      user_metadata: {},
      app_metadata: { provider: 'email', organisation: ORG, role: 'Member', invited_by: ADMIN },
      invited_at: invitedAt,
      email_confirmed_at: undefined,
      last_sign_in_at: undefined,
      ...overrides,
    });
  }

  const admin = () => member(ADMIN, { app_metadata: { provider: 'email', organisation: ORG, role: 'Administrator' } });

  /**
   * A stateful project. `inviteUserByEmail` creates an unconfirmed user with
   * only provider metadata, as Supabase does; failures can be queued.
   */
  function project(
    people: User[],
    fail: { stamp?: boolean; invite?: unknown; delete?: boolean | 'reject'; hold?: Promise<void> } = {},
  ) {
    const users = new Map(people.map((entry) => [entry.id, entry]));
    const calls: string[] = [];
    const reads = { count: 0 };
    let seq = 0;

    const stub: AdminUsersClient = {
      async listUsers() {
        reads.count += 1;
        await Promise.resolve();
        return { data: { users: [...users.values()] }, error: null };
      },
      async updateUserById(id, { app_metadata }) {
        calls.push(`update:${id}`);
        if (fail.stamp) {
          return { data: { user: null }, error: new Error('stamp failed') };
        }
        const updated = { ...users.get(id)!, app_metadata } as User;
        users.set(id, updated);
        return { data: { user: updated }, error: null };
      },
      async inviteUserByEmail(email, { redirectTo }) {
        calls.push(`invite:${email}:${redirectTo}`);
        if (fail.invite !== undefined) {
          return { data: { user: null }, error: fail.invite };
        }
        seq += 1;
        const created = user({
          id: `new-${seq}`,
          email,
          user_metadata: {},
          app_metadata: { provider: 'email' },
          invited_at: NOW.toISOString(),
          email_confirmed_at: undefined,
          last_sign_in_at: undefined,
        });
        users.set(created.id, created);
        return { data: { user: created }, error: null };
      },
      async deleteUser(id) {
        calls.push(`delete:${id}`);
        // A write that waits, so a test can see whether anything else runs
        // while it is in flight.
        await fail.hold;
        if (fail.delete === 'reject') {
          throw new Error('delete rejected');
        }
        if (fail.delete) {
          return { error: new Error('delete failed') };
        }
        users.delete(id);
        return { error: null };
      },
    };

    const directory = createDirectory(stub, {
      consoleUrl: 'https://console.example',
      inviteLinkTtlHours: 24,
      now: () => NOW,
    });

    return { directory, users, calls, reads };
  }

  async function refusal(promise: Promise<unknown>): Promise<string | undefined> {
    try {
      await promise;
      return undefined;
    } catch (error) {
      expect(error).toBeInstanceOf(RoleChangeError);
      return (error as RoleChangeError).reason;
    }
  }

  /** A promise the test resolves when it chooses. */
  function deferred() {
    let release!: () => void;
    const promise = new Promise<void>((resolve) => {
      release = resolve;
    });
    return { promise, release };
  }

  /** Lets every already-queued continuation run. */
  async function drain(): Promise<void> {
    for (let i = 0; i < 20; i += 1) {
      await Promise.resolve();
    }
  }

  describe('isPendingInvitee', () => {
    it('is an invited user who has neither confirmed nor signed in', () => {
      expect(isPendingInvitee(invitee('x', '2026-10-06T00:00:00Z'))).toBe(true);
    });

    it('is not a confirmed or signed-in user, nor one never invited', () => {
      expect(isPendingInvitee(invitee('x', '2026-10-06T00:00:00Z', { email_confirmed_at: '2026-10-06T01:00:00Z' }))).toBe(false);
      expect(isPendingInvitee(invitee('x', '2026-10-06T00:00:00Z', { last_sign_in_at: '2026-10-06T01:00:00Z' }))).toBe(false);
      expect(isPendingInvitee(member('y'))).toBe(false);
    });
  });

  describe('toInvitation', () => {
    it('maps to exactly the documented fields, expiring after the TTL', () => {
      expect(toInvitation(invitee('x', '2026-10-06T00:00:00Z'), 'Thandi Mokoena', 24, NOW)).toEqual({
        id: 'x',
        email: 'x@treasuryrisk.co.za',
        role: 'Member',
        invitedBy: 'Thandi Mokoena',
        sentAt: '2026-10-06T00:00:00.000Z',
        expiresAt: '2026-10-07T00:00:00.000Z',
        status: 'pending',
      });
    });

    it('is expired at exactly the expiry instant and after', () => {
      const sent = '2026-10-05T12:00:00.000Z';
      expect(toInvitation(invitee('x', sent), '', 24, NOW).status).toBe('expired');
      expect(toInvitation(invitee('x', sent), '', 24, new Date(NOW.getTime() - 1)).status).toBe('pending');
    });
  });

  describe('listing', () => {
    it('keeps pending invitees out of the Users list', async () => {
      const { directory } = project([admin(), invitee('pending', '2026-10-06T00:00:00Z')]);

      expect((await directory.listOrganisation(ORG)).map((u) => u.id)).toEqual([ADMIN]);
    });

    it('lists the organisation’s invitations newest first, naming the inviter', async () => {
      const { directory } = project([
        admin(),
        invitee('older', '2026-10-05T00:00:00Z'),
        invitee('newer', '2026-10-06T06:00:00Z'),
        invitee('elsewhere', '2026-10-06T07:00:00Z', {
          app_metadata: { organisation: 'Elsewhere', role: 'Member', invited_by: ADMIN },
        }),
      ]);

      const listed = await directory.listInvitations(ORG);

      expect(listed.map((i) => [i.id, i.status, i.invitedBy])).toEqual([
        ['newer', 'pending', 'Thandi Mokoena'],
        ['older', 'expired', 'Thandi Mokoena'],
      ]);
    });

    it('names no inviter who is outside the organisation', async () => {
      const { directory } = project([
        admin(),
        member('stranger', { app_metadata: { organisation: 'Elsewhere', role: 'Administrator' } }),
        invitee('x', '2026-10-06T06:00:00Z', {
          app_metadata: { organisation: ORG, role: 'Member', invited_by: 'stranger' },
        }),
      ]);

      expect((await directory.listInvitations(ORG))[0]?.invitedBy).toBe('');
    });
  });

  describe('invite', () => {
    it('sends Supabase’s invite back to the console, then stamps role, organisation and inviter', async () => {
      const { directory, users, calls } = project([admin()]);

      const invitation = await directory.invite(ORG, ADMIN, 'kagiso@treasuryrisk.co.za', 'Administrator');

      expect(calls[0]).toBe('invite:kagiso@treasuryrisk.co.za:https://console.example/accept-invite');
      expect(users.get(invitation.id)?.app_metadata).toEqual({
        provider: 'email',
        role: 'Administrator',
        organisation: ORG,
        invited_by: ADMIN,
        invited_by_name: 'Thandi Mokoena',
      });
      expect(invitation).toMatchObject({ role: 'Administrator', invitedBy: 'Thandi Mokoena', status: 'pending' });
    });

    it('refuses an email that already has an account anywhere, in any case', async () => {
      const { directory, calls } = project([
        admin(),
        member('someone', { email: 'Taken@Elsewhere.co.za', app_metadata: { organisation: 'Elsewhere' } }),
      ]);

      expect(await refusal(directory.invite(ORG, ADMIN, 'taken@elsewhere.co.za', 'Member'))).toBe(
        'already-registered',
      );
      expect(calls).toEqual([]);
    });

    it('refuses a caller the directory no longer calls an Administrator', async () => {
      const { directory, calls } = project([member(ADMIN)]);

      expect(await refusal(directory.invite(ORG, ADMIN, 'k@treasuryrisk.co.za', 'Member'))).toBe('caller-not-admin');
      expect(calls).toEqual([]);
    });

    it('deletes the new user when stamping fails, so no invitee lingers without an organisation', async () => {
      const { directory, users, calls } = project([admin()], { stamp: true });

      await expect(directory.invite(ORG, ADMIN, 'k@treasuryrisk.co.za', 'Member')).rejects.toThrow('stamp failed');

      expect(calls.at(-1)).toBe('delete:new-1');
      expect([...users.keys()]).toEqual([ADMIN]);
    });

    it('logs a failed rollback once, naming the orphan, and still reports the stamp error', async () => {
      const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { directory, users } = project([admin()], { stamp: true, delete: true });

      await expect(directory.invite(ORG, ADMIN, 'k@treasuryrisk.co.za', 'Member')).rejects.toThrow('stamp failed');

      expect(logged).toHaveBeenCalledTimes(1);
      expect(String(logged.mock.calls[0]?.[0])).toBe(
        'Invite rollback failed; orphaned invitee new-1 has no organisation',
      );
      expect(users.has('new-1')).toBe(true);
      logged.mockRestore();
    });

    it('treats a rollback delete that rejects the same way, keeping the stamp error', async () => {
      const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { directory } = project([admin()], { stamp: true, delete: 'reject' });

      await expect(directory.invite(ORG, ADMIN, 'k@treasuryrisk.co.za', 'Member')).rejects.toThrow('stamp failed');

      expect(logged).toHaveBeenCalledTimes(1);
      logged.mockRestore();
    });

    it('logs nothing when the rollback works', async () => {
      const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { directory } = project([admin()], { stamp: true });

      await expect(directory.invite(ORG, ADMIN, 'k@treasuryrisk.co.za', 'Member')).rejects.toThrow('stamp failed');

      expect(logged).not.toHaveBeenCalled();
      logged.mockRestore();
    });

    it('turns Supabase’s rate limit into a refusal', async () => {
      const { directory } = project([admin()], { invite: { status: 429, message: 'email rate limit exceeded' } });

      expect(await refusal(directory.invite(ORG, ADMIN, 'k@treasuryrisk.co.za', 'Member'))).toBe('rate-limited');
    });

    it('rethrows any other client error', async () => {
      const { directory } = project([admin()], { invite: new Error('GoTrue down') });

      await expect(directory.invite(ORG, ADMIN, 'k@treasuryrisk.co.za', 'Member')).rejects.toThrow('GoTrue down');
    });
  });

  describe('revoke', () => {
    it('deletes a pending invitee in the organisation', async () => {
      const { directory, users } = project([admin(), invitee('pending', '2026-10-06T00:00:00Z')]);

      await directory.revoke(ORG, ADMIN, 'pending');

      expect(users.has('pending')).toBe(false);
    });

    it('answers not-found for a confirmed user, another organisation, or nobody, deleting nothing', async () => {
      const { directory, calls } = project([
        admin(),
        member('confirmed'),
        invitee('elsewhere', '2026-10-06T00:00:00Z', { app_metadata: { organisation: 'Elsewhere', role: 'Member' } }),
      ]);

      for (const id of ['confirmed', 'elsewhere', 'nobody']) {
        expect(await refusal(directory.revoke(ORG, ADMIN, id))).toBe('not-found');
      }
      expect(calls).toEqual([]);
    });

    it('refuses a caller who is no longer an Administrator', async () => {
      const { directory } = project([member(ADMIN), invitee('pending', '2026-10-06T00:00:00Z')]);

      expect(await refusal(directory.revoke(ORG, ADMIN, 'pending'))).toBe('caller-not-admin');
    });
  });

  describe('resend', () => {
    it('replaces the invitee with a fresh invitation, same email and role, new id', async () => {
      const { directory, users, calls } = project([
        admin(),
        invitee('old', '2026-10-01T00:00:00Z', {
          app_metadata: { provider: 'email', organisation: ORG, role: 'Administrator', invited_by: ADMIN },
        }),
      ]);

      const fresh = await directory.resend(ORG, ADMIN, 'old');

      expect(calls.slice(0, 2)).toEqual([
        'delete:old',
        'invite:old@treasuryrisk.co.za:https://console.example/accept-invite',
      ]);
      expect(users.has('old')).toBe(false);
      expect(fresh).toMatchObject({ id: 'new-1', email: 'old@treasuryrisk.co.za', role: 'Administrator', status: 'pending' });
      // The resender is the new inviter, by id and by name.
      expect(users.get('new-1')?.app_metadata).toMatchObject({ invited_by: ADMIN, invited_by_name: 'Thandi Mokoena' });
    });

    it('answers not-found for anything but a pending invitee in the organisation', async () => {
      const { directory, calls } = project([admin(), member('confirmed')]);

      expect(await refusal(directory.resend(ORG, ADMIN, 'confirmed'))).toBe('not-found');
      expect(calls).toEqual([]);
    });
  });

  it('holds an invite until a revoke in the same organisation has finished writing', async () => {
    const gate = deferred();
    const { directory, calls, reads } = project([admin(), invitee('pending', '2026-10-06T00:00:00Z')], {
      hold: gate.promise,
    });

    const revoking = directory.revoke(ORG, ADMIN, 'pending');
    const inviting = directory.invite(ORG, ADMIN, 'k@treasuryrisk.co.za', 'Member');
    await drain();

    // The revoke has read and is mid-write; the invite has not even read.
    expect(calls).toEqual(['delete:pending']);
    expect(reads.count).toBe(1);

    gate.release();
    await Promise.all([revoking, inviting]);

    expect(calls).toEqual([
      'delete:pending',
      'invite:k@treasuryrisk.co.za:https://console.example/accept-invite',
      'update:new-1',
    ]);
  });

  it('does not hold one organisation behind another', async () => {
    const OTHER = 'Elsewhere';
    const OTHER_ADMIN = 'bbbbbbbb-0000-4000-8000-000000000002';
    const gate = deferred();
    const { directory, calls } = project(
      [
        admin(),
        invitee('pending', '2026-10-06T00:00:00Z'),
        member(OTHER_ADMIN, { app_metadata: { provider: 'email', organisation: OTHER, role: 'Administrator' } }),
      ],
      { hold: gate.promise },
    );

    const revoking = directory.revoke(ORG, ADMIN, 'pending');
    const inviting = directory.invite(OTHER, OTHER_ADMIN, 'k@elsewhere.co.za', 'Member');
    await drain();

    // The other organisation's invite went ahead while the revoke waits.
    expect(calls).toContain('invite:k@elsewhere.co.za:https://console.example/accept-invite');

    gate.release();
    await Promise.all([revoking, inviting]);
  });
});
