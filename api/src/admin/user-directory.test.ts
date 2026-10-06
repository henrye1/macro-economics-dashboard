import { describe, expect, it } from 'vitest';
import type { User } from '@supabase/supabase-js';

import {
  RoleChangeError,
  createDirectory,
  inOrganisation,
  toAdminUser,
  type AdminUsersClient,
} from './user-directory.js';

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
