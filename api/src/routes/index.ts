import { Router } from 'express';
import { createAdminRouter } from './admin.js';
import { resolveAdmin, type AdminDeps } from './admin-common.js';
import { healthRouter } from './health.js';
import { createInvitationsRouter, type InvitationDeps } from './invitations.js';
import { createMacroRouter, type MacroDeps } from './macro.js';
import { createSavedQueriesRouter, type SavedQueryDeps } from './saved-queries.js';

export type ApiDeps = MacroDeps & SavedQueryDeps & AdminDeps & InvitationDeps;

export function createApiRouter(deps: ApiDeps = {}): Router {
  const apiRouter = Router();

  // One directory for both admin routers, so role changes and invitations in
  // an organisation wait in the same queue.
  const { configured, directory } = resolveAdmin(deps);
  const admin = { ...deps, adminConfigured: configured, userDirectory: directory ?? undefined };

  apiRouter.use('/health', healthRouter);
  apiRouter.use('/macro', createMacroRouter(deps));
  apiRouter.use('/saved-queries', createSavedQueriesRouter(deps));
  apiRouter.use('/admin/users', createAdminRouter(admin));
  apiRouter.use('/admin/invitations', createInvitationsRouter(admin));

  return apiRouter;
}
