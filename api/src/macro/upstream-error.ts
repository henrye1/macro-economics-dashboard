/**
 * A fault of ours while talking to Auth0 or the Core API. An upstream 400 or
 * 404 is a payload to relay, not an exception.
 *
 * `errorHandler` relays `err.message` verbatim below 500 and this service is
 * public, so every message is a fixed string chosen at the throw site. Never
 * interpolate an upstream URL, a caught error, a token or a secret.
 */
export class UpstreamError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'UpstreamError';
    this.status = status;
  }
}

/** The upstream, or the token endpoint, could not be reached or made sense of. */
export function badGateway(message: string): UpstreamError {
  return new UpstreamError(502, message);
}

/** The service has no credentials configured, so it cannot even try. */
export function notConfigured(): UpstreamError {
  return new UpstreamError(
    503,
    'The macro service is not configured. Set the Auth0 and Core API environment variables.',
  );
}
