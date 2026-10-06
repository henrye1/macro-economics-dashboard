import { describe, expect, it } from 'vitest';
import type { User } from '@supabase/supabase-js';

import {
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
    };

    await expect(createDirectory(failing).listOrganisation('Treasury Risk')).rejects.toThrow(
      'service unavailable',
    );
  });
});
