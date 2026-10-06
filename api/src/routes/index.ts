import { Router } from 'express';
import { healthRouter } from './health.js';
import { createMacroRouter, type MacroDeps } from './macro.js';
import { createSavedQueriesRouter, type SavedQueryDeps } from './saved-queries.js';

export type ApiDeps = MacroDeps & SavedQueryDeps;

export function createApiRouter(deps: ApiDeps = {}): Router {
  const apiRouter = Router();

  apiRouter.use('/health', healthRouter);
  apiRouter.use('/macro', createMacroRouter(deps));
  apiRouter.use('/saved-queries', createSavedQueriesRouter(deps));

  return apiRouter;
}
