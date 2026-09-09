import 'dotenv/config';

/**
 * The five settings the macro passthrough needs. Grouped so a single predicate
 * can answer whether the service is usable, and so the answer is testable
 * without touching `process.env`.
 */
export interface MacroSettings {
  /** Auth0 tenant domain, without a scheme. */
  auth0Domain: string;
  auth0ClientId: string;
  auth0ClientSecret: string;
  /** The Core API's Auth0 audience. */
  auth0Audience: string;
  /** Origin of the Core API, without the `/api/macro` path. */
  coreApiBaseUrl: string;
}

/**
 * True only when every macro setting has a value.
 *
 * A partially configured service is worse than an unconfigured one: it fails
 * mid-request with a confusing upstream error instead of saying plainly that it
 * has no credentials. The macro routes answer `503` while this is false, which
 * keeps the service bootable and `/api/health` answering with no `.env` at all.
 */
export function isMacroConfigured(settings: MacroSettings): boolean {
  return [
    settings.auth0Domain,
    settings.auth0ClientId,
    settings.auth0ClientSecret,
    settings.auth0Audience,
    settings.coreApiBaseUrl,
  ].every((value) => value.trim() !== '');
}

const macro: MacroSettings = {
  auth0Domain: process.env.AUTH0_DOMAIN ?? '',
  auth0ClientId: process.env.AUTH0_CLIENT_ID ?? '',
  auth0ClientSecret: process.env.AUTH0_CLIENT_SECRET ?? '',
  auth0Audience: process.env.AUTH0_AUDIENCE ?? '',
  coreApiBaseUrl: process.env.CORE_API_BASE_URL ?? '',
};

export const config = {
  port: Number(process.env.PORT ?? 3000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:4200',
  ...macro,
  macroConfigured: isMacroConfigured(macro),
} as const;
