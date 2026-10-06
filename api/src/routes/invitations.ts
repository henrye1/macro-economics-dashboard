import { Router } from 'express';
import { z } from 'zod';

import { config } from '../config.js';
import { AdminError, adminGuards, callerOrganisation, failure, resolveAdmin, type AdminDeps } from './admin-common.js';

const INVALID = 'The invitation is not valid.';

/** Not "person": an invitation that is not pending in this organisation. */
const NOT_FOUND = { 'not-found': 'That invitation is not in your organisation.' } as const;

const idSchema = z.uuid();

/** An email and a role. Anything else, an organisation above all, is stripped. */
const inviteBodySchema = z.object({
  email: z
    .string()
    .transform((value) => value.trim().toLowerCase())
    .pipe(z.email().max(254)),
  role: z.enum(['Member', 'Administrator']),
});

export interface InvitationDeps extends AdminDeps {
  /** Overrides `config.inviteLinkTtlHours` for the hint the form shows. */
  inviteLinkTtlHours?: number;
}

/**
 * `/api/admin/invitations`: who the caller's organisation is still waiting for.
 *
 * Every route trusts only `req.auth.organisation` and `req.auth.userId`, and
 * every mutation re-checks the caller live in the directory.
 */
export function createInvitationsRouter(deps: InvitationDeps = {}): Router {
  const router = Router();
  const { configured, directory } = resolveAdmin(deps);
  const ttlHours = deps.inviteLinkTtlHours ?? config.inviteLinkTtlHours;

  router.use(...adminGuards(configured, directory));

  router.get('/', (req, res, next) => {
    const organisation = callerOrganisation(req, next);
    if (organisation === null) {
      return;
    }

    directory!
      .listInvitations(organisation)
      .then((invitations) => {
        res.json({ data: invitations, expiresInHours: ttlHours });
      })
      .catch((error: unknown) => next(failure('Admin invitation list failed', NOT_FOUND)(error)));
  });

  router.post('/', (req, res, next) => {
    const organisation = callerOrganisation(req, next);
    if (organisation === null) {
      return;
    }

    const body = inviteBodySchema.safeParse(req.body);
    if (!body.success) {
      next(new AdminError(400, INVALID));
      return;
    }

    directory!
      .invite(organisation, req.auth!.userId, body.data.email, body.data.role)
      .then((invitation) => {
        res.status(201).json({ data: invitation });
      })
      .catch((error: unknown) => next(failure('Admin invitation failed', NOT_FOUND)(error)));
  });

  router.delete('/:id', (req, res, next) => {
    const organisation = callerOrganisation(req, next);
    if (organisation === null) {
      return;
    }

    const id = idSchema.safeParse(req.params.id);
    if (!id.success) {
      next(new AdminError(400, INVALID));
      return;
    }

    directory!
      .revoke(organisation, req.auth!.userId, id.data)
      .then(() => {
        res.status(204).end();
      })
      .catch((error: unknown) => next(failure('Admin invitation revoke failed', NOT_FOUND)(error)));
  });

  router.post('/:id/resend', (req, res, next) => {
    const organisation = callerOrganisation(req, next);
    if (organisation === null) {
      return;
    }

    const id = idSchema.safeParse(req.params.id);
    if (!id.success) {
      next(new AdminError(400, INVALID));
      return;
    }

    directory!
      .resend(organisation, req.auth!.userId, id.data)
      .then((invitation) => {
        res.status(201).json({ data: invitation });
      })
      .catch((error: unknown) => next(failure('Admin invitation resend failed', NOT_FOUND)(error)));
  });

  return router;
}
