import { Router, type NextFunction, type Request } from 'express';
import type { ZodType } from 'zod';

import { config } from '../config.js';
import { requireRole } from '../middleware/roles.js';
import {
  createSupabaseRepository,
  type SavedQueryRepository,
} from '../saved-queries/saved-query-repository.js';
import { importBodySchema, saveBodySchema } from '../saved-queries/saved-query.schema.js';

export interface SavedQueryDeps {
  /** Injected by tests. Production builds the Supabase one from `config`. */
  savedQueryRepository?: SavedQueryRepository;
  /** Overrides `config.savedQueriesConfigured`, which is read at import time. */
  savedQueriesConfigured?: boolean;
}

/**
 * Refused or failed. `errorHandler` relays the message verbatim below 500 and
 * this service is public, so every message is a fixed string: never the body,
 * a Zod issue, a SQL error or the key.
 */
class SavedQueryError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'SavedQueryError';
    this.status = status;
  }
}

const INVALID = 'The saved query is not valid.';
const NOT_CONFIGURED = 'Saved queries are not configured on this service.';
const UNREACHABLE = 'Saved queries could not be reached.';

/**
 * `/api/saved-queries`: the signed-in visitor's own saved queries.
 *
 * The owner is `req.auth.userId` and nothing else. A body can say whatever it
 * likes about a user; the schemas strip it and nothing here would read it.
 */
export function createSavedQueriesRouter(deps: SavedQueryDeps = {}): Router {
  const router = Router();

  const configured = deps.savedQueriesConfigured ?? config.savedQueriesConfigured;

  // Built only when it can work, so an unconfigured service never makes a
  // client from blank settings.
  const repository =
    deps.savedQueryRepository ??
    (configured ? createSupabaseRepository(config.supabaseUrl, config.supabaseServiceKey) : null);

  // Every verified visitor is at least a Member, so this admits all of them.
  // It is here for its other half: no `req.auth` at all is a 401, never an
  // owner of `undefined`.
  router.use(requireRole('Member'));

  router.use((_req, _res, next) => {
    if (configured && repository !== null) {
      next();
      return;
    }

    next(new SavedQueryError(503, NOT_CONFIGURED));
  });

  router.get('/', (req, res, next) => {
    run(next, async () => {
      res.json({ data: await repository!.list(owner(req)) });
    });
  });

  router.put('/', (req, res, next) => {
    const body = parse(saveBodySchema, req.body, next);
    if (body === undefined) {
      return;
    }

    run(next, async () => {
      res.json({ data: await repository!.save(owner(req), body) });
    });
  });

  router.post('/import', (req, res, next) => {
    const body = parse(importBodySchema, req.body, next);
    if (body === undefined) {
      return;
    }

    run(next, async () => {
      res.json({ data: await repository!.import(owner(req), body.data) });
    });
  });

  return router;
}

/** `requireRole` has already refused a request without one. */
function owner(req: Request): string {
  return req.auth!.userId;
}

/** The parsed body, or undefined after handing `next` a fixed `400`. */
function parse<T>(schema: ZodType<T>, body: unknown, next: NextFunction): T | undefined {
  const result = schema.safeParse(body);

  if (!result.success) {
    next(new SavedQueryError(400, INVALID));
    return undefined;
  }

  return result.data;
}

/**
 * Any repository failure is ours, not the caller's: logged here, answered as a
 * fixed `502`. The caught error never reaches the response.
 */
function run(next: NextFunction, work: () => Promise<void>): void {
  work().catch((error: unknown) => {
    console.error('Saved queries request failed', error);
    next(new SavedQueryError(502, UNREACHABLE));
  });
}
