import { HttpClient, HttpErrorResponse, type HttpHeaders } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { toMacroParams } from '../http/macro-params';
import type { ObservationsQuery } from '../macro-contracts';
import { type RequestEndpoint, proxyPath, proxyUrl } from './request-text';

/**
 * The only three headers a browser can read here.
 *
 * `api/src/app.ts` exposes exactly these through CORS, so a fourth is not
 * merely absent — it is unreadable. Claiming one would be inventing evidence.
 */
export interface RelayedHeaders {
  readonly etag: string | null;
  readonly cacheControl: string | null;
  readonly totalCount: string | null;
}

export type SendResult =
  | {
      readonly kind: 'response';
      readonly status: number;
      readonly headers: RelayedHeaders;
      /** Empty for a `304`, which carries none. */
      readonly body: string;
      readonly elapsedMs: number;
    }
  | { readonly kind: 'unreachable'; readonly message: string };

/** Shown when the request never got an answer at all. */
const UNREACHABLE = 'The request did not reach the service.';

/**
 * Sends the working query as a real request and reports what came back.
 *
 * Deliberately not `MACRO_DATA`. That contract returns a parsed envelope and
 * hides status, headers and any error body, which is right for a result tab and
 * is exactly what this tab exists to show. A `400` here is the subject, not a
 * failure: its RFC 7807 `detail` names the offending code, and that is the
 * lesson the request builder teaches.
 */
@Injectable({ providedIn: 'root' })
export class RequestSendService {
  private readonly http = inject(HttpClient);

  /**
   * The validator last seen, with the request that produced it.
   *
   * Keyed on purpose. An `ETag` belongs to one request; sending it back for a
   * different query would ask "is *that* still current?" about something the
   * user never asked for, and a `304` would then be read as "your new query is
   * unchanged". `LastResultMeta` guards its provenance the same way.
   */
  private held: { readonly requestKey: string; readonly etag: string } | null = null;

  private readonly inFlight = signal(false);

  /** True for the whole round trip. */
  readonly busy = this.inFlight.asReadonly();

  /** The validator that would be sent for this request, or null. */
  heldEtag(endpoint: RequestEndpoint, query: ObservationsQuery): string | null {
    const key = proxyUrl(endpoint, query);
    return this.held !== null && this.held.requestKey === key ? this.held.etag : null;
  }

  async send(endpoint: RequestEndpoint, query: ObservationsQuery): Promise<SendResult> {
    // The key is the full URL, so a changed query is a different request; the
    // send itself uses the path and lets HttpParams encode the rest.
    const requestKey = proxyUrl(endpoint, query);
    const ifNoneMatch = this.heldEtag(endpoint, query);
    const startedAt = performance.now();

    this.inFlight.set(true);

    try {
      // `responseType: 'text'`, so a body that is not JSON — an HTML error page
      // from something in front of the service — is shown rather than thrown.
      const response = await firstValueFrom(
        this.http.get(proxyPath(endpoint), {
          observe: 'response',
          responseType: 'text',
          params: toMacroParams(query),
          headers: ifNoneMatch === null ? {} : { 'if-none-match': ifNoneMatch }
        })
      );

      return this.record(
        requestKey,
        response.status,
        response.headers,
        response.body ?? '',
        startedAt
      );
    } catch (error: unknown) {
      // Angular routes everything outside 2xx here, including a 304. A 304 is
      // the successful answer this tab exists to demonstrate, so the status is
      // read rather than the channel it arrived on.
      if (error instanceof HttpErrorResponse && error.status > 0) {
        const body = error.status === 304 ? '' : (readErrorBody(error) ?? '');
        return this.record(requestKey, error.status, error.headers, body, startedAt);
      }

      return { kind: 'unreachable', message: UNREACHABLE };
    } finally {
      this.inFlight.set(false);
    }
  }

  private record(
    requestKey: string,
    status: number,
    headers: HttpHeaders,
    body: string,
    startedAt: number
  ): SendResult {
    const relayed = readHeaders(headers);

    // A 304 carries no ETag of its own; the held one is still the current
    // validator, so it stays. Any other answer replaces or clears it.
    if (status !== 304) {
      this.held = relayed.etag === null ? null : { requestKey, etag: relayed.etag };
    }

    return {
      kind: 'response',
      status,
      headers: relayed,
      body,
      elapsedMs: Math.round(performance.now() - startedAt)
    };
  }
}

function readHeaders(headers: HttpHeaders): RelayedHeaders {
  return {
    etag: headers.get('ETag'),
    cacheControl: headers.get('Cache-Control'),
    totalCount: headers.get('X-Total-Count')
  };
}

/** With `responseType: 'text'` the failing body arrives as a string. */
function readErrorBody(error: HttpErrorResponse): string | null {
  return typeof error.error === 'string' ? error.error : null;
}
