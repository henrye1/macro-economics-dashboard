import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { createApiRouter, type ApiDeps } from './routes/index.js';
import { authSeam } from './middleware/auth.js';
import type { RequestHandler } from 'express';
import { errorHandler, notFound } from './middleware/error-handler.js';

export interface AppDeps extends ApiDeps {
  /**
   * Overrides the real auth seam. Route tests pass one that admits everybody so
   * they can stay about relaying; `middleware/auth.test.ts` is where admission
   * itself is proved, against locally signed tokens.
   */
  authSeam?: RequestHandler;
}

/**
 * `deps` exists only so tests can drive the macro routes against a stub
 * upstream. It is optional, so `src/index.ts` keeps calling `createApp()`
 * unchanged.
 */
export function createApp(deps: AppDeps = {}) {
  const app = express();

  app.use(
    cors({
      origin: config.corsOrigin,
      // Only a cross-origin caller needs these exposed, and the console is
      // never one: `ui/proxy.conf.json` in development and the `/api/*`
      // rewrite in `render.yaml` in production keep its requests on its own
      // origin. They stay exposed so a direct caller can still read the three
      // headers the request builder shows, ETag above all.
      exposedHeaders: ['ETag', 'Cache-Control', 'X-Total-Count'],
    }),
  );
  app.use(express.json());

  app.use(deps.authSeam ?? authSeam);
  app.use('/api', createApiRouter(deps));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
