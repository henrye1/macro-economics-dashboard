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
  /**
   * Sets `targetId`'s role, after checking every rule against the directory
   * as it stands now, not against anyone's token. Throws `RoleChangeError`
   * for a refusal and rethrows anything the client throws.
   */
  setRole(organisation: string, callerId: string, targetId: string, role: Role): Promise<AdminUser>;
}

export type RoleChangeRefusal = 'caller-not-admin' | 'not-found' | 'self' | 'last-admin';

/** A role change the rules refuse. The route maps `reason` to a fixed message. */
export class RoleChangeError extends Error {
  constructor(readonly reason: RoleChangeRefusal) {
    super(`Role change refused: ${reason}`);
    this.name = 'RoleChangeError';
  }
}

/** The slice of the Supabase admin client the directory uses, so tests can stub it. */
export interface AdminUsersClient {
  listUsers(params: { page: number; perPage: number }): Promise<{
    data: { users: User[] } | { users: [] };
    error: unknown;
  }>;
  updateUserById(
    id: string,
    attributes: { app_metadata: Record<string, unknown> }
  ): Promise<{ data: { user: User | null }; error: unknown }>;
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
  /**
   * The tail of each organisation's queue of role changes. One at a time per
   * organisation in this process, so two Administrators demoting each other
   * at once cannot both pass the last-Administrator check. Per process only:
   * see the feature 20b notes before running more than one instance.
   */
  const queues = new Map<string, Promise<unknown>>();

  function serialized<T>(organisation: string, work: () => Promise<T>): Promise<T> {
    const previous = queues.get(organisation) ?? Promise.resolve();
    const next = previous.then(work, work);
    const tail = next.catch(() => undefined);

    queues.set(organisation, tail);
    void tail.then(() => {
      if (queues.get(organisation) === tail) {
        queues.delete(organisation);
      }
    });

    return next;
  }

  async function changeRole(
    organisation: string,
    callerId: string,
    targetId: string,
    role: Role,
  ): Promise<AdminUser> {
    const members = (await everyUser(client)).filter((user) => inOrganisation(user, organisation));
    const roleOf = (user: User) => toAdminUser(user).role;

    // 2. The caller's authority as the directory sees it now. A token can be
    // up to an hour stale; a demotion must take effect for changes at once.
    const caller = members.find((user) => user.id === callerId);
    if (caller === undefined || roleOf(caller) !== 'Administrator') {
      throw new RoleChangeError('caller-not-admin');
    }

    // 3. Missing and "in another organisation" are deliberately the same.
    const target = members.find((user) => user.id === targetId);
    if (target === undefined) {
      throw new RoleChangeError('not-found');
    }

    // 4. Before the last-Administrator rule, so a self-change always says so.
    if (target.id === callerId) {
      throw new RoleChangeError('self');
    }

    const current = roleOf(target);

    // 5. Never leave the organisation without an Administrator.
    if (current === 'Administrator' && role === 'Member') {
      const others = members.filter(
        (user) => user.id !== target.id && roleOf(user) === 'Administrator',
      );

      if (others.length === 0) {
        throw new RoleChangeError('last-admin');
      }
    }

    // 6. Nothing to write.
    if (current === role) {
      return toAdminUser(target);
    }

    // 7. The whole existing app_metadata with only the role replaced, so the
    // organisation and provider survive whether Supabase merges or replaces.
    const { data, error } = await client.updateUserById(target.id, {
      app_metadata: { ...(target.app_metadata ?? {}), role },
    });

    if (error !== null && error !== undefined) {
      throw error;
    }

    if (data.user === null) {
      throw new Error('Supabase returned no user.');
    }

    return toAdminUser(data.user);
  }

  return {
    async listOrganisation(organisation) {
      const users = await everyUser(client);

      return users
        .filter((user) => inOrganisation(user, organisation))
        .map(toAdminUser)
        .sort(byName);
    },

    setRole(organisation, callerId, targetId, role) {
      return serialized(organisation, () => changeRole(organisation, callerId, targetId, role));
    },
  };
}

export function createSupabaseDirectory(url: string, serviceKey: string): UserDirectory {
  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return createDirectory(client.auth.admin);
}
