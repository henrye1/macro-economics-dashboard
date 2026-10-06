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
/**
 * A pending invitation: the invited user who has not yet accepted. There is no
 * invitations table; `app_metadata` and `invited_at` hold all of this.
 */
export interface Invitation {
  readonly id: string;
  readonly email: string;
  readonly role: Role;
  /** The inviter's name when they are in the same organisation, else ''. */
  readonly invitedBy: string;
  readonly sentAt: string;
  readonly expiresAt: string;
  readonly status: 'pending' | 'expired';
}

export interface UserDirectory {
  /** Everyone in the organisation except pending invitees. */
  listOrganisation(organisation: string): Promise<AdminUser[]>;
  /** The organisation's pending invitations, newest first. */
  listInvitations(organisation: string): Promise<Invitation[]>;
  /** Supabase sends the email. Refuses an email that already has an account. */
  invite(organisation: string, callerId: string, email: string, role: Role): Promise<Invitation>;
  /** Deletes the pending invitee, which kills the link. */
  revoke(organisation: string, callerId: string, id: string): Promise<void>;
  /** Deletes and re-invites, so the answer carries a new id. */
  resend(organisation: string, callerId: string, id: string): Promise<Invitation>;
  /**
   * Sets `targetId`'s role, after checking every rule against the directory
   * as it stands now, not against anyone's token. Throws `RoleChangeError`
   * for a refusal and rethrows anything the client throws.
   */
  setRole(organisation: string, callerId: string, targetId: string, role: Role): Promise<AdminUser>;
}

export type RoleChangeRefusal =
  | 'caller-not-admin'
  | 'not-found'
  | 'self'
  | 'last-admin'
  | 'already-registered'
  | 'rate-limited';

/** A change the rules refuse. The route maps `reason` to a fixed message. */
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
  inviteUserByEmail(
    email: string,
    options: { redirectTo: string }
  ): Promise<{ data: { user: User | null }; error: unknown }>;
  deleteUser(id: string): Promise<{ error: unknown }>;
}

export interface DirectoryOptions {
  /** The console origin, no trailing slash. Invite links return to `/accept-invite` on it. */
  readonly consoleUrl?: string;
  /** The project's invite link lifetime. Display only; Supabase enforces it. */
  readonly inviteLinkTtlHours?: number;
  /** A seam for tests. */
  readonly now?: () => Date;
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

/**
 * Invited and never accepted: no confirmed email and no sign-in. Accepting an
 * invite confirms the email, so a confirmed user is never pending.
 */
export function isPendingInvitee(user: User): boolean {
  return (
    typeof user.invited_at === 'string' &&
    user.invited_at !== '' &&
    !user.email_confirmed_at &&
    !user.last_sign_in_at
  );
}

export function toInvitation(
  user: User,
  invitedByName: string,
  ttlHours: number,
  now: Date,
): Invitation {
  const sent = new Date(user.invited_at ?? user.created_at);
  const expires = new Date(sent.getTime() + ttlHours * 3_600_000);

  return {
    id: user.id,
    email: user.email ?? '',
    role: resolveRole({
      userId: user.id,
      email: user.email ?? '',
      role: readString(user.app_metadata, 'role'),
      organisation: readString(user.app_metadata, 'organisation'),
    }),
    invitedBy: invitedByName,
    sentAt: sent.toISOString(),
    expiresAt: expires.toISOString(),
    status: now.getTime() < expires.getTime() ? 'pending' : 'expired',
  };
}

/** A Supabase error that says the project's email rate limit was hit. */
function isRateLimited(error: unknown): boolean {
  return (error as { status?: unknown } | null)?.status === 429;
}

function check(error: unknown): void {
  if (error === null || error === undefined) {
    return;
  }

  if (isRateLimited(error)) {
    throw new RoleChangeError('rate-limited');
  }

  // Logged by the route, never returned.
  throw error;
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

export function createDirectory(
  client: AdminUsersClient,
  options: DirectoryOptions = {},
): UserDirectory {
  const consoleUrl = options.consoleUrl ?? 'http://localhost:4200';
  const ttlHours = options.inviteLinkTtlHours ?? 24;
  const now = options.now ?? (() => new Date());

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

  /** The organisation's users, refusing unless the caller is a live Administrator there. */
  async function asAdministrator(organisation: string, callerId: string) {
    const everyone = await everyUser(client);
    const members = everyone.filter((user) => inOrganisation(user, organisation));
    const caller = members.find((user) => user.id === callerId);

    if (caller === undefined || toAdminUser(caller).role !== 'Administrator') {
      throw new RoleChangeError('caller-not-admin');
    }

    return { everyone, members };
  }

  function invitationOf(user: User, members: readonly User[]): Invitation {
    const inviterId = readString(user.app_metadata, 'invited_by');
    const inviter = members.find((member) => member.id === inviterId);

    return toInvitation(user, inviter === undefined ? '' : toAdminUser(inviter).fullName, ttlHours, now());
  }

  /** The pending invitee `id` in `members`, or a not-found refusal. */
  function pendingIn(members: readonly User[], id: string): User {
    const target = members.find((user) => user.id === id);

    if (target === undefined || !isPendingInvitee(target)) {
      throw new RoleChangeError('not-found');
    }

    return target;
  }

  /**
   * Deletes a just-invited user whose stamping failed. If that fails too, the
   * user is left with no organisation, where no administrator can see or
   * revoke it, so an operator has to: one distinct line names it. The id stays
   * in the server log and never reaches a response.
   */
  async function rollBack(id: string): Promise<void> {
    let failure: unknown = null;

    try {
      failure = (await client.deleteUser(id)).error ?? null;
    } catch (error) {
      failure = error;
    }

    if (failure !== null) {
      console.error(`Invite rollback failed; orphaned invitee ${id} has no organisation`, failure);
    }
  }

  /**
   * Sends the invite, then stamps role, organisation and inviter. If stamping
   * fails the new user is deleted, so an invitee never lingers without an
   * organisation.
   */
  async function sendInvite(
    organisation: string,
    callerId: string,
    email: string,
    role: Role,
    members: User[],
  ): Promise<Invitation> {
    const invited = await client.inviteUserByEmail(email, {
      redirectTo: `${consoleUrl}/accept-invite`,
    });
    check(invited.error);

    const user = invited.data.user;
    if (user === null) {
      throw new Error('Supabase returned no invited user.');
    }

    // The inviter's name as it is now, so the invitee's screen can say who
    // invited them without a request it has no right to make. The card reads
    // the live inviter instead; this stamp is only for the invitee.
    const caller = members.find((member) => member.id === callerId);
    const invitedByName = caller === undefined ? '' : toAdminUser(caller).fullName;

    const stamped = await client.updateUserById(user.id, {
      app_metadata: {
        ...(user.app_metadata ?? {}),
        role,
        organisation,
        invited_by: callerId,
        invited_by_name: invitedByName,
      },
    });

    if ((stamped.error !== null && stamped.error !== undefined) || stamped.data.user === null) {
      await rollBack(user.id);
      check(stamped.error);
      throw new Error('Supabase returned no user after stamping the invitation.');
    }

    return invitationOf(stamped.data.user, members);
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
        .filter((user) => inOrganisation(user, organisation) && !isPendingInvitee(user))
        .map(toAdminUser)
        .sort(byName);
    },

    async listInvitations(organisation) {
      const members = (await everyUser(client)).filter((user) => inOrganisation(user, organisation));

      return members
        .filter(isPendingInvitee)
        .map((user) => invitationOf(user, members))
        .sort((a, b) => b.sentAt.localeCompare(a.sentAt) || a.email.localeCompare(b.email));
    },

    invite(organisation, callerId, email, role) {
      return serialized(organisation, async () => {
        const { everyone, members } = await asAdministrator(organisation, callerId);
        const wanted = email.toLowerCase();

        // Unique across the whole project, not just this organisation.
        if (everyone.some((user) => (user.email ?? '').toLowerCase() === wanted)) {
          throw new RoleChangeError('already-registered');
        }

        return sendInvite(organisation, callerId, email, role, members);
      });
    },

    revoke(organisation, callerId, id) {
      return serialized(organisation, async () => {
        const { members } = await asAdministrator(organisation, callerId);
        const target = pendingIn(members, id);

        const { error } = await client.deleteUser(target.id);
        check(error);
      });
    },

    resend(organisation, callerId, id) {
      return serialized(organisation, async () => {
        const { members } = await asAdministrator(organisation, callerId);
        const target = pendingIn(members, id);
        const role = toAdminUser(target).role;

        // Delete first: the old link dies with the old user. If the re-invite
        // then fails, the administrator can simply invite again.
        const deleted = await client.deleteUser(target.id);
        check(deleted.error);

        return sendInvite(
          organisation,
          callerId,
          target.email ?? '',
          role,
          members.filter((user) => user.id !== target.id),
        );
      });
    },

    setRole(organisation, callerId, targetId, role) {
      return serialized(organisation, () => changeRole(organisation, callerId, targetId, role));
    },
  };
}

export function createSupabaseDirectory(
  url: string,
  serviceKey: string,
  options: DirectoryOptions = {},
): UserDirectory {
  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return createDirectory(client.auth.admin, options);
}
