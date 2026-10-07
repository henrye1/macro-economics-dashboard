import { HttpErrorResponse } from '@angular/common/http';

/**
 * A failed macro request, carrying only what the console is allowed to show.
 *
 * `detail` is the RFC 7807 explanation the service supplied. It is the reason
 * this type exists: a live `400` names the offending code
 * ("Unknown indicator code(s): NOPE."), and a flat "unavailable" throws that
 * away and leaves the user with nothing to act on.
 *
 * Nothing else from the response crosses this boundary. No raw body, no header,
 * no stack: a consumer that can only reach `status` and `detail` cannot leak
 * one by accident.
 */
export class MacroRequestError extends Error {
  /** HTTP status, or 0 when the request never reached the service. */
  readonly status: number;

  /** The problem's `detail`, or null when the body was not a problem document. */
  readonly detail: string | null;

  constructor(status: number, detail: string | null) {
    // The message never carries the body. `detail` is already the safe,
    // server-authored sentence; without one, the status alone is all we know.
    super(detail ?? `Macro request failed with status ${status}`);
    this.name = 'MacroRequestError';
    this.status = status;
    this.detail = detail;
  }
}

/** Set by the API's error handler on a sentence it wrote itself. */
const ERROR_SOURCE_HEADER = 'X-Error-Source';

/**
 * Reads the API's own `{ error }` sentence, or null.
 *
 * Only when the API marked the response as its own: a relayed Core API body
 * can carry an `error` field too, and that is upstream text the console must
 * not present as an explanation.
 */
function apiSentence(response: HttpErrorResponse): string | null {
  if (response.headers?.get(ERROR_SOURCE_HEADER) !== 'api') {
    return null;
  }

  const body = response.error;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return null;
  }

  const error = (body as { error?: unknown }).error;

  return typeof error === 'string' && error.length > 0 ? error : null;
}

/**
 * Reads the problem `detail` out of a parsed error body.
 *
 * A body counts as a problem document only when it is a non-array object with a
 * string `detail`. Everything else, an HTML error page, a bare string, a JSON
 * array, a problem document whose `detail` is not a string, yields null and the
 * consumer's own wording. Guessing at another field would put arbitrary
 * server text in the UI under the pretence that the service explained itself.
 */
function problemDetail(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return null;
  }

  const detail = (body as { detail?: unknown }).detail;

  return typeof detail === 'string' && detail.length > 0 ? detail : null;
}

/**
 * Maps an `HttpErrorResponse` onto a `MacroRequestError`.
 *
 * A transport failure, DNS, offline, CORS, a dropped connection, arrives with
 * `status` 0 and an `ErrorEvent` body, which carries no problem document. It
 * becomes status 0 with a null detail, which is exactly what the consumer needs
 * to fall back to its own wording.
 */
export function toMacroRequestError(response: HttpErrorResponse): MacroRequestError {
  // The Core API's problem first, then a sentence the API marked as its own.
  return new MacroRequestError(
    response.status,
    problemDetail(response.error) ?? apiSentence(response)
  );
}

/**
 * The sentence a tab should show for a failed request.
 *
 * When the service explained itself, that explanation is strictly better than
 * anything the console can write: a live `400` names the offending code, which
 * is the difference between "Observations are unavailable" and a defect the user
 * can actually fix. Otherwise the tab's own wording stands, because a `500` or a
 * dropped connection has nothing to add.
 *
 * The returned string is rendered through Angular interpolation only, which
 * escapes it. Never pass it to `innerHTML` or a `bypassSecurityTrust*` call.
 */
export function macroErrorMessage(error: unknown, fallback: string): string {
  return error instanceof MacroRequestError && error.detail !== null ? error.detail : fallback;
}
