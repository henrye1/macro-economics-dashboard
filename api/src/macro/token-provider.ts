import type { MacroSettings } from '../config.js';
import { badGateway } from './upstream-error.js';

/**
 * Refresh this many seconds before the token actually expires, so a request
 * that is already in flight upstream cannot be holding an expired token.
 */
export const TOKEN_EXPIRY_MARGIN_SECONDS = 60;

export interface TokenProvider {
  getToken(): Promise<string>;
  /** Drop the cached token, so the next `getToken()` fetches a fresh one. */
  invalidate(): void;
}

export interface TokenProviderDeps {
  fetch: typeof globalThis.fetch;
  config: MacroSettings;
  /** Injected so expiry is testable without waiting or faking timers. */
  now?: () => number;
}

interface CachedToken {
  token: string;
  expiresAtMs: number;
}

/**
 * The Auth0 client-credentials grant, cached in memory.
 *
 * Concurrent callers share one in-flight request. The naive
 * check-cache-then-fetch passes every sequential test and then fires one token
 * request per concurrent caller under load, which invites an Auth0 rate limit.
 */
export function createTokenProvider({
  fetch,
  config,
  now = Date.now,
}: TokenProviderDeps): TokenProvider {
  let cached: CachedToken | null = null;
  let inFlight: Promise<string> | null = null;

  async function requestToken(): Promise<string> {
    let response: Response;

    try {
      response = await fetch(`https://${config.auth0Domain}/oauth/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'client_credentials',
          client_id: config.auth0ClientId,
          client_secret: config.auth0ClientSecret,
          audience: config.auth0Audience,
        }),
      });
    } catch {
      // The caught error can carry the request URL; the message must not.
      throw badGateway('Could not reach the authentication service.');
    }

    if (!response.ok) {
      throw badGateway('The authentication service rejected the service credentials.');
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw badGateway('The authentication service returned an unreadable response.');
    }

    const grant = readGrant(payload);
    if (grant === null) {
      throw badGateway('The authentication service returned an unexpected response.');
    }

    cached = {
      token: grant.token,
      expiresAtMs: now() + ttlSeconds(grant.expiresIn) * 1000,
    };

    return grant.token;
  }

  return {
    async getToken(): Promise<string> {
      if (cached !== null && now() < cached.expiresAtMs) {
        return cached.token;
      }

      if (inFlight === null) {
        inFlight = requestToken().finally(() => {
          inFlight = null;
        });
      }

      return inFlight;
    },

    invalidate(): void {
      cached = null;
    },
  };
}

/**
 * `expires_in` is assumed to be seconds, per the Auth0 client-credentials
 * contract in CONSUMER-GUIDE.md section 2. Confirm against a real tenant.
 *
 * A lifetime shorter than the margin would otherwise compute a cache window in
 * the past and refetch on every single call, so short lifetimes fall back to
 * half of whatever was granted.
 */
function ttlSeconds(expiresIn: number): number {
  const withMargin = expiresIn - TOKEN_EXPIRY_MARGIN_SECONDS;
  return withMargin > 0 ? withMargin : Math.max(Math.floor(expiresIn / 2), 1);
}

function readGrant(payload: unknown): { token: string; expiresIn: number } | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const { access_token: token, expires_in: expiresIn } = payload as Record<string, unknown>;

  if (typeof token !== 'string' || token === '') {
    return null;
  }

  if (typeof expiresIn !== 'number' || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    return null;
  }

  return { token, expiresIn };
}
