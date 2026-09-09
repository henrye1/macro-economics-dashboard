import type { RequestHandler } from 'express';

/**
 * The auth seam. Deliberately does nothing yet: feature 14 verifies the JWT
 * here and feature 15 composes role checks on top, so neither has to reshape
 * the app. Until then anyone who can reach the API can spend the M2M quota,
 * which the project overview records as an accepted gap.
 */
export const authSeam: RequestHandler = (_req, _res, next) => {
  next();
};
