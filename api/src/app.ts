import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { createApiRouter, type ApiDeps } from './routes/index.js';
import { authSeam } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/error-handler.js';

/**
 * `deps` exists only so tests can drive the macro routes against a stub
 * upstream. It is optional, so `src/index.ts` keeps calling `createApp()`
 * unchanged.
 */
export function createApp(deps: ApiDeps = {}) {
  const app = express();

  app.use(
    cors({
      origin: config.corsOrigin,
      // The console is served from a different origin in production, so these
      // have to be exposed explicitly or the browser cannot read them. The
      // request builder shows all three, and ETag is the whole point of the
      // caching demo.
      exposedHeaders: ['ETag', 'Cache-Control', 'X-Total-Count'],
    }),
  );
  app.use(express.json());

  app.use(authSeam);
  app.use('/api', createApiRouter(deps));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
