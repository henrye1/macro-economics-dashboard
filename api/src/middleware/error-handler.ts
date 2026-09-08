import type { ErrorRequestHandler, RequestHandler } from 'express';

export const notFound: RequestHandler = (req, res) => {
  res.status(404).json({ error: 'Not Found', path: req.originalUrl });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = typeof err?.status === 'number' ? err.status : 500;
  const message = status === 500 ? 'Internal Server Error' : String(err?.message ?? 'Error');

  if (status === 500) {
    console.error(err);
  }

  res.status(status).json({ error: message });
};
