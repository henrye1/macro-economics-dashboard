import { Router } from 'express';
import { z } from 'zod';

import { AdminError, adminGuards, callerOrganisation, failure, resolveAdmin, type AdminDeps } from './admin-common.js';

export type { AdminDeps } from './admin-common.js';

const INVALID_CHANGE = 'The role change is not valid.';

const userIdSchema = z.uuid();

/** Exactly a role. Anything else in the body, an organisation above all, is stripped. */
const roleBodySchema = z.object({
  role: z.enum(['Member', 'Administrator']),
});

/**
 * `/api/admin/users`: the people in the caller's own organisation.
 *
 * The organisation is `req.auth.organisation`, from the verified token, and
 * nothing else. Nothing in the request can widen it.
 */
export function createAdminRouter(deps: AdminDeps = {}): Router {
  const router = Router();
  const { configured, directory } = resolveAdmin(deps);

  router.use(...adminGuards(configured, directory));

  router.get('/', (req, res, next) => {
    const organisation = callerOrganisation(req, next);
    if (organisation === null) {
      return;
    }

    directory!
      .listOrganisation(organisation)
      .then((users) => {
        res.json({ data: users });
      })
      .catch((error: unknown) => next(failure('Admin user directory request failed')(error)));
  });

  router.put('/:id/role', (req, res, next) => {
    const organisation = callerOrganisation(req, next);
    if (organisation === null) {
      return;
    }

    const id = userIdSchema.safeParse(req.params.id);
    const body = roleBodySchema.safeParse(req.body);

    if (!id.success || !body.success) {
      next(new AdminError(400, INVALID_CHANGE));
      return;
    }

    directory!
      .setRole(organisation, req.auth!.userId, id.data, body.data.role)
      .then((user) => {
        res.json({ data: user });
      })
      .catch((error: unknown) => next(failure('Admin role change failed')(error)));
  });

  return router;
}
