import type { MacroSettings } from '../config.js';
import type { TokenProvider } from './token-provider.js';
import { badGateway } from './upstream-error.js';

/**
 * An allowlist rather than a copy: blind relaying would hand a browser any
 * `Set-Cookie` or auth header the upstream happened to send.
 */
export const RELAYED_HEADERS: readonly string[] = [
  'etag',
  'cache-control',
  'content-type',
  'x-total-count',
];

export interface UpstreamResponse {
  status: number;
  /** Lowercase header names, filtered to `RELAYED_HEADERS`. */
  headers: Record<string, string>;
  /** Raw text. A `304` carries none. */
  body: string;
}

export interface MacroRequestHeaders {
  ifNoneMatch?: string | undefined;
}

export interface MacroClient {
  /**
   * @param path   route path beginning with a slash, for example `/observations`
   * @param search verbatim query string including the `?`, or an empty string
   */
  get(path: string, search: string, headers?: MacroRequestHeaders): Promise<UpstreamResponse>;
}

export interface MacroClientDeps {
  fetch: typeof globalThis.fetch;
  tokenProvider: TokenProvider;
  config: MacroSettings;
}

/**
 * The Core API relay.
 *
 * The query string passes through byte for byte, because re-serialising it
 * would drop repeated parameters and change encodings. An upstream non-2xx is a
 * payload, not an exception: a 400 carries an RFC 7807 body whose `detail`
 * names the offending code, which is what the console exists to teach. Only our
 * own failures throw.
 */
export function createMacroClient({ fetch, tokenProvider, config }: MacroClientDeps): MacroClient {
  const base = `${config.coreApiBaseUrl.replace(/\/+$/, '')}/api/macro`;

  async function attempt(
    path: string,
    search: string,
    ifNoneMatch: string | undefined,
    token: string,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
    };

    // Only this one request header crosses over. Copying the caller's headers
    // wholesale would let them supply an Authorization of their own choosing.
    if (ifNoneMatch !== undefined && ifNoneMatch !== '') {
      headers['if-none-match'] = ifNoneMatch;
    }

    try {
      return await fetch(`${base}${path}${search}`, { method: 'GET', headers });
    } catch {
      // The caught error can carry the full upstream URL; the message must not.
      throw badGateway('Could not reach the Core API.');
    }
  }

  return {
    async get(path, search, headers = {}) {
      const { ifNoneMatch } = headers;

      let response = await attempt(path, search, ifNoneMatch, await tokenProvider.getToken());

      // One retry, and only one. The guide says to refresh on 401; a loop here
      // would hammer Auth0 whenever the credentials are genuinely wrong.
      if (response.status === 401) {
        tokenProvider.invalidate();
        response = await attempt(path, search, ifNoneMatch, await tokenProvider.getToken());
      }

      // Still refused, or refused for want of permission: that is this
      // service's M2M credential, not the visitor's session. Relaying it as a
      // 401 would tell the console the visitor is signed out, and it would sign
      // every visitor out. A 403 is not retried: a new token carries the same
      // permissions.
      if (response.status === 401 || response.status === 403) {
        throw badGateway(CREDENTIALS_REFUSED);
      }

      return read(response);
    },
  };
}

/** Fixed: names no upstream detail, token, client or URL. */
const CREDENTIALS_REFUSED = 'The Core API rejected the service credentials.';

async function read(response: Response): Promise<UpstreamResponse> {
  const headers: Record<string, string> = {};

  for (const name of RELAYED_HEADERS) {
    const value = response.headers.get(name);
    if (value !== null) {
      headers[name] = value;
    }
  }

  let body = '';
  if (response.status !== 304) {
    try {
      body = await response.text();
    } catch {
      throw badGateway('Could not read the Core API response.');
    }
  }

  return { status: response.status, headers, body };
}
