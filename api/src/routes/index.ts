import { Router } from 'express';
import { healthRouter } from './health.js';
import { createMacroRouter, type MacroDeps } from './macro.js';

export type ApiDeps = MacroDeps;

export function createApiRouter(deps: ApiDeps = {}): Router {
  const apiRouter = Router();

  apiRouter.use('/health', healthRouter);
  apiRouter.use('/macro', createMacroRouter(deps));

  return apiRouter;
}
