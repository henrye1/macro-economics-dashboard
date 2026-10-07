import type { ErrorRequestHandler, RequestHandler } from 'express';

export const notFound: RequestHandler = (req, res) => {
  res.status(404).json({ error: 'Not Found', path: req.originalUrl });
};

/**
 * Marks a response whose `error` sentence this service wrote itself. The
 * console shows `{ error }` only when this is present, because a relayed Core
 * API body can carry an `error` field too, and that is not ours to vouch for.
 */
export const ERROR_SOURCE_HEADER = 'X-Error-Source';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = typeof err?.status === 'number' ? err.status : 500;
  const message = status === 500 ? 'Internal Server Error' : String(err?.message ?? 'Error');

  if (status === 500) {
    console.error(err);
  } else {
    // Our own fixed sentence, which explains the failure. A 500's generic text
    // explains nothing, so it stays unmarked and the console keeps its own.
    res.setHeader(ERROR_SOURCE_HEADER, 'api');
  }

  res.status(status).json({ error: message });
};
