import { Router, type Request, type Response } from 'express';

import { config } from '../config.js';
import { createMacroClient, type MacroClient } from '../macro/macro-client.js';
import { createTokenProvider } from '../macro/token-provider.js';
import { notConfigured, UpstreamError } from '../macro/upstream-error.js';

export interface MacroDeps {
  /** Injected by tests. Production builds the real client from `config`. */
  macroClient?: MacroClient;
  /**
   * Overrides `config.macroConfigured`. Tests set it explicitly because the real
   * value is read from the environment at import time, and this repository has
   * no credentials.
   */
  macroConfigured?: boolean;
}

/** The five read routes the overview names, in the guide's order. */
const READ_ROUTES: readonly string[] = [
  'countries',
  'indicators',
  'observations',
  'series',
  'vintages',
];

/**
 * The `/api/macro` passthrough.
 *
 * Handlers stay thin on purpose: work out the upstream path, hand the verbatim
 * query string to the client, and copy the answer onto the response. Nothing
 * here inspects or reshapes a payload; the Core API owns every meaning.
 */
export function createMacroRouter(deps: MacroDeps = {}): Router {
  const router = Router();

  const client =
    deps.macroClient ??
    createMacroClient({
      fetch: globalThis.fetch,
      tokenProvider: createTokenProvider({ fetch: globalThis.fetch, config }),
      config,
    });

  // Saying so plainly beats a confusing upstream failure. `/api/health` is
  // unaffected, so the service still boots and passes a platform health check.
  const configured = deps.macroConfigured ?? config.macroConfigured;

  router.use((_req, _res, next) => {
    if (configured) {
      next();
      return;
    }

    next(notConfigured());
  });

  for (const route of READ_ROUTES) {
    router.get(`/${route}`, (req, res, next) => {
      relay(client, `/${route}`, req, res).catch(next);
    });
  }

  router.get('/vintages/:id/revisions', (req, res, next) => {
    // The only client-supplied value that reaches a URL we build, so the only
    // one that needs validating. Everything else lives in the opaque query
    // string, where the Core API owns its own 400s.
    const id = vintageId(req.params.id);

    if (id === null) {
      next(new UpstreamError(400, 'The vintage id must be a positive integer.'));
      return;
    }

    relay(client, `/vintages/${id}/revisions`, req, res).catch(next);
  });

  return router;
}

async function relay(
  client: MacroClient,
  path: string,
  req: Request,
  res: Response,
): Promise<void> {
  const upstream = await client.get(path, searchOf(req), {
    ifNoneMatch: req.get('if-none-match'),
  });

  for (const [name, value] of Object.entries(upstream.headers)) {
    res.setHeader(name, value);
  }

  res.status(upstream.status);

  // `res.end`, never `res.send`. Express 5's `send` is not a byte relay: it
  // rewrites a response to 304 when `req.fresh`, invents an ETag over the
  // payload when none is set, and appends a charset to the relayed
  // Content-Type. The first of those silently discards a relayed 200 whenever
  // the caller's If-None-Match happens to match the upstream validator, which
  // it often will because guide section 6 derives the ETag from the vintages
  // rather than the body. A 304 has no body of its own.
  res.end(upstream.status === 304 ? undefined : upstream.body);
}

/**
 * The request's own query string, untouched.
 *
 * Read off the raw URL rather than rebuilt from `req.query`, which would drop
 * repeated parameters and re-encode values. `?indicators=A&indicators=B` has to
 * arrive upstream exactly as the consumer wrote it.
 */
function searchOf(req: Request): string {
  const start = req.originalUrl.indexOf('?');
  return start === -1 ? '' : req.originalUrl.slice(start);
}

function vintageId(raw: string | undefined): number | null {
  if (raw === undefined || !/^\d+$/.test(raw)) {
    return null;
  }

  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
