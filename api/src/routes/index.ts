import { Router } from 'express';
import { createAdminRouter, type AdminDeps } from './admin.js';
import { healthRouter } from './health.js';
import { createMacroRouter, type MacroDeps } from './macro.js';
import { createSavedQueriesRouter, type SavedQueryDeps } from './saved-queries.js';

export type ApiDeps = MacroDeps & SavedQueryDeps & AdminDeps;

export function createApiRouter(deps: ApiDeps = {}): Router {
  const apiRouter = Router();

  apiRouter.use('/health', healthRouter);
  apiRouter.use('/macro', createMacroRouter(deps));
  apiRouter.use('/saved-queries', createSavedQueriesRouter(deps));
  apiRouter.use('/admin/users', createAdminRouter(deps));

  return apiRouter;
}
