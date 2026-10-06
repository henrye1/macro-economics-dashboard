import { createClient, type User } from '@supabase/supabase-js';

import { resolveRole, type Role } from '../middleware/roles.js';

/**
 * One person as the Administration page shows them. Nothing else from the
 * Supabase user leaves this module: no other metadata, no factors, no
 * identities.
 */
export interface AdminUser {
  readonly id: string;
  readonly email: string;
  /** From `user_metadata`, which the user can write. Display only. */
  readonly fullName: string;
  readonly role: Role;
  /** ISO 8601, or null for someone who has never signed in. */
  readonly lastSignInAt: string | null;
}

/**
 * The user directory, one organisation at a time.
 *
 * The production implementation holds the service role key, which can list
 * every user in the project, so the organisation filter here is the tenant
 * boundary. Routes pass `req.auth.organisation` and nothing else.
 */
export interface UserDirectory {
  listOrganisation(organisation: string): Promise<AdminUser[]>;
}

/** The slice of the Supabase admin client the directory uses, so tests can stub it. */
export interface AdminUsersClient {
  listUsers(params: { page: number; perPage: number }): Promise<{
    data: { users: User[] } | { users: [] };
    error: unknown;
  }>;
}

const PER_PAGE = 1000;

function readString(source: unknown, key: string): string | null {
  if (typeof source !== 'object' || source === null) {
    return null;
  }

  const value = (source as Record<string, unknown>)[key];

  return typeof value === 'string' && value !== '' ? value : null;
}

/**
 * Whether `user` belongs to `organisation`: an exact, case-sensitive match on
 * `app_metadata.organisation`, which only an administrator can set. An empty
 * or missing organisation on either side never matches.
 */
export function inOrganisation(user: User, organisation: string): boolean {
  if (organisation === '') {
    return false;
  }

  return readString(user.app_metadata, 'organisation') === organisation;
}

export function toAdminUser(user: User): AdminUser {
  const email = user.email ?? '';
  const lastSignIn = user.last_sign_in_at;

  return {
    id: user.id,
    email,
    fullName: readString(user.user_metadata, 'full_name') ?? email.split('@')[0] ?? '',
    role: resolveRole({
      userId: user.id,
      email,
      role: readString(user.app_metadata, 'role'),
      organisation: readString(user.app_metadata, 'organisation'),
    }),
    lastSignInAt:
      typeof lastSignIn === 'string' && lastSignIn !== ''
        ? new Date(lastSignIn).toISOString()
        : null,
  };
}

/** Name, then email, so the order is stable for two people with one name. */
export function byName(a: AdminUser, b: AdminUser): number {
  return a.fullName.localeCompare(b.fullName) || a.email.localeCompare(b.email);
}

/** Every user in the project, page by page, until a page comes back short. */
async function everyUser(client: AdminUsersClient): Promise<User[]> {
  const users: User[] = [];

  for (let page = 1; ; page += 1) {
    const { data, error } = await client.listUsers({ page, perPage: PER_PAGE });

    if (error !== null && error !== undefined) {
      // Logged by the route, never returned.
      throw error;
    }

    users.push(...data.users);

    if (data.users.length < PER_PAGE) {
      return users;
    }
  }
}

export function createDirectory(client: AdminUsersClient): UserDirectory {
  return {
    async listOrganisation(organisation) {
      const users = await everyUser(client);

      return users
        .filter((user) => inOrganisation(user, organisation))
        .map(toAdminUser)
        .sort(byName);
    },
  };
}

export function createSupabaseDirectory(url: string, serviceKey: string): UserDirectory {
  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return createDirectory(client.auth.admin);
}
