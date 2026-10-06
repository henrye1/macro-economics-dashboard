import type { RequestHandler } from 'express';

import { NO_SESSION, type AuthContext } from './auth.js';

/**
 * The product roles, lowest rank first. `Administrator` can do everything a
 * `Member` can, so a check compares rank rather than names.
 */
export const ROLES = ['Member', 'Administrator'] as const;

export type Role = (typeof ROLES)[number];

/**
 * Refused by a role check. Carries `status` the way the auth seam's errors do,
 * so `errorHandler` relays the fixed message as `{ error }`.
 */
class RoleError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'RoleError';
    this.status = status;
  }
}

const FORBIDDEN = 'This account does not have permission for this request.';

/**
 * The caller's role, failing safe.
 *
 * Only an exact `Administrator` is one. No role, an unknown name and a case
 * variant all get the least privilege, so a typo in `app_metadata` can never
 * grant more than it should.
 */
export function resolveRole(auth: AuthContext): Role {
  return auth.role === 'Administrator' ? 'Administrator' : 'Member';
}

/** Whether a caller holding `held` may do what `required` demands. */
export function satisfies(held: Role, required: Role): boolean {
  return ROLES.indexOf(held) >= ROLES.indexOf(required);
}

/**
 * Admits only callers whose role reaches `required`. Mount it per route, after
 * the auth seam: `router.get(path, requireRole('Administrator'), handler)`.
 *
 * Every refusal goes to `next(error)`. A refusal that called `next()` with no
 * argument would silently undo the check.
 */
export function requireRole(required: Role): RequestHandler {
  return (req, _res, next) => {
    if (req.auth === undefined) {
      next(new RoleError(401, NO_SESSION));
      return;
    }

    if (!satisfies(resolveRole(req.auth), required)) {
      next(new RoleError(403, FORBIDDEN));
      return;
    }

    next();
  };
}
