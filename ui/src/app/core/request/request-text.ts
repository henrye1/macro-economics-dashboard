import { toMacroParams } from '../http/macro-params';
import type { ObservationsQuery } from '../macro-contracts';

/**
 * The Core API host, as a placeholder.
 *
 * `CONSUMER-GUIDE.md` writes it the same way, and the project overview lists
 * `CORE_API_BASE_URL` among the secrets and records the host as deliberately
 * unnamed. The browser has no way to learn it, and inventing one here would put
 * a URL on screen that nobody can reach.
 */
export const CORE_API_HOST = '<core-api-host>';

/** The console's own passthrough, which is what `Send request` actually calls. */
export const PROXY_BASE = '/api/macro';

export type RequestEndpoint = 'observations' | 'series';

export interface RequestEndpointSpec {
  readonly endpoint: RequestEndpoint;
  /** As the select renders it. */
  readonly label: string;
}

/**
 * The two routes the working query answers.
 *
 * Not the other three the passthrough serves: `/countries` and `/vintages` were
 * observed at feature 8 to ignore `pageSize` entirely, and none of them take
 * `indicators` or a year range, so the URL on screen would show parameters the
 * service discards.
 */
export const REQUEST_ENDPOINTS: readonly RequestEndpointSpec[] = [
  { endpoint: 'observations', label: 'GET /api/macro/observations' },
  { endpoint: 'series', label: 'GET /api/macro/series' }
];

/**
 * The query string, serialised the way every other tab serialises it.
 *
 * `toMacroParams` is the single owner of comma-joining, omission and
 * percent-encoding. Building this string by hand is how the URL on screen would
 * come to differ from the request actually sent.
 */
function search(query: ObservationsQuery): string {
  const params = toMacroParams(query).toString();
  return params === '' ? '' : `?${params}`;
}

/** What a consumer would call, with the host left to be substituted. */
export function consumerUrl(endpoint: RequestEndpoint, query: ObservationsQuery): string {
  return `https://${CORE_API_HOST}${PROXY_BASE}/${endpoint}${search(query)}`;
}

/** What this console calls: same path and query, its own origin. */
export function proxyUrl(endpoint: RequestEndpoint, query: ObservationsQuery): string {
  return `${PROXY_BASE}/${endpoint}${search(query)}`;
}

/**
 * The path alone, with no query string.
 *
 * The send passes this and hands the parameters to `HttpParams` separately, so
 * the encoding at request time is the same code path every other tab uses.
 * Embedding the query string in the URL would make it an opaque blob Angular
 * cannot inspect, and `proxyUrl` above would become a second serialiser.
 */
export function proxyPath(endpoint: RequestEndpoint): string {
  return `${PROXY_BASE}/${endpoint}`;
}

/**
 * The curl a consumer would paste, with their own token.
 *
 * `$TOKEN` is literal: this console holds a server-side M2M token that is never
 * the visitor's, and rendering any real credential here would be a leak with no
 * upside. The `If-None-Match` line appears only once a validator has actually
 * been seen, because a curl carrying an invented ETag teaches the wrong lesson.
 */
export function curlCommand(url: string, ifNoneMatch: string | null): string {
  const lines = [`curl -s "${url}"`, `  -H "Authorization: Bearer $TOKEN"`];

  if (ifNoneMatch !== null) {
    // Escaped, because an ETag is a quoted string and the shell would eat the
    // quotes otherwise.
    lines.push(`  -H "If-None-Match: ${ifNoneMatch.replace(/"/g, '\\"')}"`);
  }

  // The continuation marker belongs to every line but the last.
  return lines.map((line, index) => (index === lines.length - 1 ? line : `${line} \\`)).join('\n');
}
