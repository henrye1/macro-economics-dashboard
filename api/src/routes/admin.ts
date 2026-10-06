import { Router } from 'express';

import { createSupabaseDirectory, type UserDirectory } from '../admin/user-directory.js';
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
 * organisation, a user, a Supabase error or the key.
 */
class AdminError extends Error {
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

/**
 * `/api/admin/users`: the people in the caller's own organisation.
 *
 * The organisation is `req.auth.organisation`, from the verified token, and
 * nothing else. Nothing in the request can widen it.
 */
export function createAdminRouter(deps: AdminDeps = {}): Router {
  const router = Router();

  const configured = deps.adminConfigured ?? config.adminConfigured;

  // Built only when it can work, so an unconfigured service never makes a
  // client from blank settings.
  const directory =
    deps.userDirectory ??
    (configured ? createSupabaseDirectory(config.supabaseUrl, config.supabaseServiceKey) : null);

  // First, so an anonymous caller gets 401 and a Member 403 before anything
  // here says whether the service or their organisation is set up.
  router.use(requireRole('Administrator'));

  router.use((_req, _res, next) => {
    if (configured && directory !== null) {
      next();
      return;
    }

    next(new AdminError(503, NOT_CONFIGURED));
  });

  router.get('/', (req, res, next) => {
    // `requireRole` has already refused a request without `req.auth`.
    const organisation = req.auth!.organisation;

    if (organisation === null || organisation === '') {
      next(new AdminError(403, NO_ORGANISATION));
      return;
    }

    directory!
      .listOrganisation(organisation)
      .then((users) => {
        res.json({ data: users });
      })
      .catch((error: unknown) => {
        console.error('Admin user directory request failed', error);
        next(new AdminError(502, UNREACHABLE));
      });
  });

  return router;
}
