import type { NextFunction, Request, RequestHandler } from 'express';

import {
  RoleChangeError,
  createSupabaseDirectory,
  type RoleChangeRefusal,
  type UserDirectory,
} from '../admin/user-directory.js';
import { config } from '../config.js';
import { requireRole } from '../middleware/roles.js';

export interface AdminDeps {
  /** Injected by tests. Production builds the Supabase one from `config`. */
  userDirectory?: UserDirectory;
  /** Overrides `config.adminConfigured`, which is read at import time. */
  adminConfigured?: boolean;
}

/**
 * Refused or failed. `errorHandler` relays the message verbatim below 500 and
 * this service is public, so every message is a fixed string: never an
 * organisation, a user, an email, a Supabase error or the key.
 */
export class AdminError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'AdminError';
    this.status = status;
  }
}

const NOT_CONFIGURED = 'Administration is not configured on this service.';
const NO_ORGANISATION = 'This account has no organisation to administer.';
const UNREACHABLE = 'The user directory could not be reached.';

/** Each refusal's status and fixed message. None names a person or organisation. */
export const REFUSALS: Record<RoleChangeRefusal, [number, string]> = {
  'caller-not-admin': [403, 'Your account is no longer an Administrator.'],
  self: [403, "You can't change your own role."],
  // The same answer for a missing user and one in another organisation, so a
  // response never confirms that someone exists elsewhere.
  'not-found': [404, 'That person is not in your organisation.'],
  'last-admin': [409, 'This would leave your organisation without an Administrator.'],
  // Unavoidably says the email has an account somewhere; nothing more.
  'already-registered': [409, "This email address can't be invited."],
  'rate-limited': [429, 'Too many invitations have been sent. Try again later.'],
};

/**
 * One directory for every admin router, so role changes and invitations share
 * one per-organisation queue. Built only when it can work, so an unconfigured
 * service never makes a client from blank settings.
 */
export function resolveAdmin(deps: AdminDeps): { configured: boolean; directory: UserDirectory | null } {
  const configured = deps.adminConfigured ?? config.adminConfigured;

  return {
    configured,
    directory:
      deps.userDirectory ??
      (configured
        ? createSupabaseDirectory(config.supabaseUrl, config.supabaseServiceKey, {
            consoleUrl: config.consoleUrl,
            inviteLinkTtlHours: config.inviteLinkTtlHours,
          })
        : null),
  };
}

/**
 * First `requireRole`, so an anonymous caller gets 401 and a Member 403 before
 * anything says whether the service is set up; then the 503.
 */
export function adminGuards(configured: boolean, directory: UserDirectory | null): RequestHandler[] {
  return [
    requireRole('Administrator'),
    (_req, _res, next) => {
      if (configured && directory !== null) {
        next();
        return;
      }

      next(new AdminError(503, NOT_CONFIGURED));
    },
  ];
}

/**
 * The verified organisation, or null after handing `next` the fixed `403`.
 * `requireRole` has already refused a request without `req.auth`.
 */
export function callerOrganisation(req: Request, next: NextFunction): string | null {
  const organisation = req.auth!.organisation;

  if (organisation === null || organisation === '') {
    next(new AdminError(403, NO_ORGANISATION));
    return null;
  }

  return organisation;
}

/**
 * A refusal becomes its fixed status and message, optionally reworded for the
 * route; anything else is ours, logged once and answered as a fixed `502`.
 */
export function failure(
  label: string,
  overrides: Partial<Record<RoleChangeRefusal, string>> = {},
): (error: unknown) => AdminError {
  return (error) => {
    if (error instanceof RoleChangeError) {
      const [status, message] = REFUSALS[error.reason];
      return new AdminError(status, overrides[error.reason] ?? message);
    }

    console.error(label, error);
    return new AdminError(502, UNREACHABLE);
  };
}
