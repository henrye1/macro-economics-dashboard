import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import type { RequestHandler } from 'express';

import { config } from '../config.js';

/**
 * What the API is willing to believe about the caller.
 *
 * Every field comes from a signature-verified token. Feature 15 composes role
 * checks on top of this and must not widen it: anything a visitor can write for
 * themselves belongs nowhere near an authorization decision.
 */
export interface AuthContext {
  readonly userId: string;
  readonly email: string;
  /** From `app_metadata`, which only an administrator can set. Never `user_metadata`. */
  readonly role: string | null;
  readonly organisation: string | null;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

/**
 * Refused before any handler runs.
 *
 * `errorHandler` relays the message verbatim below 500 and this service is
 * public, so every message here is a fixed string. Never interpolate a token, a
 * claim, a URL or a caught error: the caller is by definition unauthenticated,
 * and the difference between "expired" and "forged" is exactly the hint an
 * attacker wants.
 */
class AuthError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

export const NO_SESSION = 'This request carried no valid session.';
const NOT_CONFIGURED =
  'The service is not configured for authentication. Set the Supabase environment variables.';
const UNVERIFIABLE = 'The session could not be verified.';

/**
 * Open without a token, because a platform health check cannot hold one and a
 * service that fails its health check is down whatever its auth does. Compared
 * after the trailing slash is trimmed, so `/api/health/` is the same route.
 */
const OPEN_PATHS: ReadonlySet<string> = new Set(['/api/health']);

/**
 * `Bearer <token>`, case-insensitive on the scheme. One token, no spaces in it,
 * and nothing else on the line.
 */
const BEARER = /^Bearer\s+(\S+)\s*$/i;

/**
 * jose reports why a token failed through `code`. These prefixes are the
 * families that mean "this token is not acceptable", which is the caller's
 * problem and a 401. Anything else, a JWKS endpoint that will not answer above
 * all, is our problem and must not be reported as a bad credential.
 *
 * `ERR_JWKS_` is deliberately not a prefix here: that family also holds
 * `ERR_JWKS_TIMEOUT` and `ERR_JWKS_INVALID`, which are our outage. Only the two
 * that describe the token's `kid` are listed, so a token signed by a key the
 * project never published, or has since revoked, answers 401. An algorithm the
 * key set cannot verify at all, HS256 against an EC set, is the token's fault too.
 */
const TOKEN_FAILURE_CODES = [
  'ERR_JWT_',
  'ERR_JWS_',
  'ERR_JWK_',
  'ERR_JWKS_NO_MATCHING_KEY',
  'ERR_JWKS_MULTIPLE_MATCHING_KEYS',
  'ERR_JOSE_ALG_NOT_ALLOWED',
  'ERR_JOSE_NOT_SUPPORTED'
];

export interface AuthSeamDeps {
  /** Overrides `config.authConfigured`, which is read from the environment at import time. */
  configured?: boolean;
  /** Overrides `config.supabaseUrl`, and with it the expected issuer. */
  supabaseUrl?: string;
  /**
   * Where signing keys come from. Production resolves the project's published
   * JWKS; tests inject a local key set so the suite needs no network.
   */
  keys?: JWTVerifyGetKey;
}

/**
 * The auth seam, no longer a seam.
 *
 * Verification is local: the project's public keys are fetched once and cached
 * by jose, and no request costs a round trip to Supabase. Every path out of
 * here that is not a verified token denies, including the unconfigured one.
 * A `catch` that calls `next()` with no argument is the single mistake that
 * would silently undo this feature.
 */
export function createAuthSeam(deps: AuthSeamDeps = {}): RequestHandler {
  const supabaseUrl = (deps.supabaseUrl ?? config.supabaseUrl).replace(/\/+$/, '');
  const configured = deps.configured ?? config.authConfigured;
  const issuer = `${supabaseUrl}/auth/v1`;

  // Built once per app, and lazily: `createRemoteJWKSet` fetches on first use,
  // so an unconfigured service never builds one and never calls out.
  const keys =
    deps.keys ??
    (configured
      ? createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`))
      : undefined);

  return (req, res, next) => {
    if (OPEN_PATHS.has(trimSlash(req.path))) {
      next();
      return;
    }

    if (!configured || keys === undefined) {
      next(new AuthError(503, NOT_CONFIGURED));
      return;
    }

    const token = BEARER.exec(req.headers.authorization ?? '')?.[1];

    if (token === undefined) {
      next(new AuthError(401, NO_SESSION));
      return;
    }

    jwtVerify(token, keys, { issuer, audience: 'authenticated' })
      .then(({ payload }) => {
        const auth = toAuthContext(payload);

        if (auth === null) {
          // Signed by the right project and still identifies nobody. Not a
          // token we can make an authorization decision from.
          next(new AuthError(401, NO_SESSION));
          return;
        }

        req.auth = auth;
        next();
      })
      .catch((error: unknown) => {
        if (isTokenFailure(error)) {
          next(new AuthError(401, NO_SESSION));
          return;
        }

        // Our fault, not the caller's, so it is worth a server-side line and a
        // status that does not tell them to sign in again. The caught error
        // never reaches the response.
        console.error('Could not verify a session token', error);
        next(new AuthError(502, UNVERIFIABLE));
      });
  };
}

/** The real seam, built from the environment. */
export const authSeam: RequestHandler = createAuthSeam();

function trimSlash(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

function isTokenFailure(error: unknown): boolean {
  const code = (error as { code?: unknown })?.code;

  return typeof code === 'string' && TOKEN_FAILURE_CODES.some((prefix) => code.startsWith(prefix));
}

/**
 * The claims this service trusts, or null when the token identifies nobody.
 *
 * `payload.role` is deliberately not read: in a Supabase token that is the
 * Postgres role, which is `authenticated` for every signed-in visitor. The
 * product role lives in `app_metadata`, which the client SDK cannot write.
 */
function toAuthContext(payload: JWTPayload): AuthContext | null {
  const userId = payload.sub;

  if (typeof userId !== 'string' || userId === '') {
    return null;
  }

  const appMetadata = payload['app_metadata'];

  return {
    userId,
    email: readString(payload, 'email') ?? '',
    role: readString(appMetadata, 'role'),
    organisation: readString(appMetadata, 'organisation')
  };
}

function readString(source: unknown, key: string): string | null {
  if (typeof source !== 'object' || source === null) {
    return null;
  }

  const value = (source as Record<string, unknown>)[key];

  return typeof value === 'string' && value !== '' ? value : null;
}
