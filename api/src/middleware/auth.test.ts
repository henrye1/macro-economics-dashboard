import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SignJWT, errors, exportJWK, generateKeyPair, createLocalJWKSet, type JWTVerifyGetKey } from 'jose';
import type { NextFunction, Request, Response } from 'express';

import { createAuthSeam, type AuthContext } from './auth.js';

const SUPABASE_URL = 'https://project.supabase.co';
const ISSUER = `${SUPABASE_URL}/auth/v1`;

/**
 * A key pair generated in the test process, so the suite proves real signature
 * verification without a network call and without a checked-in key. `keys`
 * stands in for the project's published JWKS; `sign` is the project.
 */
let keys: JWTVerifyGetKey;
let sign: (claims: Record<string, unknown>, options?: SignOptions) => Promise<string>;

interface SignOptions {
  readonly issuer?: string;
  readonly audience?: string;
  readonly expiresAt?: number;
  /** A second key nobody published, for the forged-token case. */
  readonly stranger?: boolean;
  /** The header `kid`. Real Supabase tokens always carry one; defaults to the published key's. */
  readonly kid?: string;
}

const PROJECT_KID = 'project-key';

beforeAll(async () => {
  const project = await generateKeyPair('ES256');
  const stranger = await generateKeyPair('ES256');
  const publicJwk = { ...(await exportJWK(project.publicKey)), alg: 'ES256', kid: PROJECT_KID };

  keys = createLocalJWKSet({ keys: [publicJwk] });

  sign = (claims, options = {}) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'ES256', kid: options.kid ?? PROJECT_KID })
      .setIssuedAt()
      .setIssuer(options.issuer ?? ISSUER)
      .setAudience(options.audience ?? 'authenticated')
      .setExpirationTime(options.expiresAt ?? '1h')
      .sign(options.stranger === true ? stranger.privateKey : project.privateKey);
});

/** The claims a signed-in Supabase visitor actually arrives with. */
function visitor(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sub: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    email: 'thandi.mokoena@cyte.co.za',
    // The Postgres role, which every signed-in visitor carries and which must
    // never be mistaken for the product role below.
    role: 'authenticated',
    app_metadata: { role: 'Administrator', organisation: 'Treasury Risk' },
    user_metadata: { full_name: 'Thandi Mokoena', role: 'Owner' },
    ...overrides
  };
}

function run(
  handler: ReturnType<typeof createAuthSeam>,
  request: Partial<Request> = {}
): Promise<{ req: Request; error: unknown; passed: boolean }> {
  const req = { path: '/api/macro/countries', headers: {}, ...request } as Request;
  const res = { status: vi.fn(), json: vi.fn(), end: vi.fn() } as unknown as Response;

  return new Promise((resolve) => {
    const next: NextFunction = (error?: unknown) => {
      resolve({ req, error, passed: error === undefined });
      // Nothing may be written to the response by this middleware: refusal
      // travels through `errorHandler`, which owns the one response shape.
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    };

    handler(req, res, next);
  });
}

const seam = () => createAuthSeam({ configured: true, supabaseUrl: SUPABASE_URL, keys });

function bearer(token: string): Partial<Request> {
  return { path: '/api/macro/countries', headers: { authorization: `Bearer ${token}` } } as Partial<Request>;
}

function status(error: unknown): number | undefined {
  return (error as { status?: number })?.status;
}

describe('createAuthSeam', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('admits a token this project signed, and publishes only the claims it trusts', async () => {
    const { req, passed } = await run(seam(), bearer(await sign(visitor())));

    expect(passed).toBe(true);
    expect(req.auth).toEqual<AuthContext>({
      userId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      email: 'thandi.mokoena@cyte.co.za',
      role: 'Administrator',
      organisation: 'Treasury Risk'
    });
  });

  it('takes the role from app_metadata, never from the token role or user_metadata', async () => {
    const { req } = await run(
      seam(),
      bearer(await sign(visitor({ app_metadata: { role: 'Member', organisation: 'Treasury Risk' } })))
    );

    expect(req.auth?.role).toBe('Member');
  });

  it('leaves role and organisation null when an administrator set neither', async () => {
    const { req, passed } = await run(seam(), bearer(await sign(visitor({ app_metadata: {} }))));

    expect(passed).toBe(true);
    expect(req.auth?.role).toBeNull();
    expect(req.auth?.organisation).toBeNull();
  });

  it('refuses a request with no Authorization header', async () => {
    const { error, passed } = await run(seam());

    expect(passed).toBe(false);
    expect(status(error)).toBe(401);
  });

  it.each([
    ['an empty header', ''],
    ['another scheme', 'Basic abc'],
    ['a bare token', 'abc.def.ghi'],
    ['Bearer with nothing after it', 'Bearer '],
    ['two tokens', 'Bearer abc def']
  ])('refuses %s', async (_label, authorization) => {
    const { error } = await run(seam(), {
      path: '/api/macro/countries',
      headers: { authorization }
    } as Partial<Request>);

    expect(status(error)).toBe(401);
  });

  it('accepts a lowercase scheme, which is legal in the header', async () => {
    const token = await sign(visitor());
    const { passed } = await run(seam(), {
      path: '/api/macro/countries',
      headers: { authorization: `bearer ${token}` }
    } as Partial<Request>);

    expect(passed).toBe(true);
  });

  it('refuses a token signed by a key this project never published', async () => {
    const { error } = await run(seam(), bearer(await sign(visitor(), { stranger: true })));

    expect(status(error)).toBe(401);
  });

  it('refuses a token whose kid the key set does not hold, without logging it as our fault', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    // A revoked key, or another project's: the kid simply is not published.
    const { error } = await run(
      seam(),
      bearer(await sign(visitor(), { stranger: true, kid: 'retired-key' }))
    );

    expect(status(error)).toBe(401);
    expect(logged).not.toHaveBeenCalled();
  });

  it('refuses an HS256 token, which the asymmetric key set cannot verify', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const token = await new SignJWT(visitor())
      .setProtectedHeader({ alg: 'HS256', kid: PROJECT_KID })
      .setIssuedAt()
      .setIssuer(ISSUER)
      .setAudience('authenticated')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('a-legacy-shared-secret-of-sufficient-length'));
    const { error } = await run(seam(), bearer(token));

    expect(status(error)).toBe(401);
    expect(logged).not.toHaveBeenCalled();
  });

  it('refuses an expired token', async () => {
    const { error } = await run(
      seam(),
      bearer(await sign(visitor(), { expiresAt: Math.floor(Date.now() / 1000) - 60 }))
    );

    expect(status(error)).toBe(401);
  });

  it('refuses a token from another issuer', async () => {
    const { error } = await run(
      seam(),
      bearer(await sign(visitor(), { issuer: 'https://someone-else.supabase.co/auth/v1' }))
    );

    expect(status(error)).toBe(401);
  });

  it('refuses a token for another audience', async () => {
    const { error } = await run(seam(), bearer(await sign(visitor(), { audience: 'anon' })));

    expect(status(error)).toBe(401);
  });

  it('refuses a validly signed token that identifies nobody', async () => {
    const { error } = await run(seam(), bearer(await sign(visitor({ sub: undefined }))));

    expect(status(error)).toBe(401);
  });

  it('refuses nonsense in the token position without throwing', async () => {
    const { error } = await run(seam(), bearer('not-a-token'));

    expect(status(error)).toBe(401);
  });

  it('answers 502, not 401, when the key set itself cannot be reached', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const unreachable: JWTVerifyGetKey = () => Promise.reject(new Error('getaddrinfo ENOTFOUND'));
    const handler = createAuthSeam({ configured: true, supabaseUrl: SUPABASE_URL, keys: unreachable });
    const { error } = await run(handler, bearer(await sign(visitor())));

    // Our outage is not the visitor's bad credential, and telling them to sign
    // in again would be a lie.
    expect(status(error)).toBe(502);
  });

  it('keeps a key set that times out at 502, though its code shares the JWKS family', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const stalled: JWTVerifyGetKey = () => Promise.reject(new errors.JWKSTimeout());
    const handler = createAuthSeam({ configured: true, supabaseUrl: SUPABASE_URL, keys: stalled });
    const { error } = await run(handler, bearer(await sign(visitor())));

    expect(status(error)).toBe(502);
  });

  it('never carries the reason a token failed into the message', async () => {
    const { error: expired } = await run(
      seam(),
      bearer(await sign(visitor(), { expiresAt: Math.floor(Date.now() / 1000) - 60 }))
    );
    const { error: forged } = await run(seam(), bearer(await sign(visitor(), { stranger: true })));

    expect((expired as Error).message).toBe((forged as Error).message);
  });

  it('refuses everything with 503 when Supabase is not configured, rather than falling open', async () => {
    const handler = createAuthSeam({ configured: false, supabaseUrl: '' });
    const { error, passed } = await run(handler, bearer(await sign(visitor())));

    expect(passed).toBe(false);
    expect(status(error)).toBe(503);
  });

  it('leaves the health route open, with no token and with no configuration', async () => {
    const configured = await run(seam(), { path: '/api/health', headers: {} } as Partial<Request>);
    const unconfigured = await run(createAuthSeam({ configured: false, supabaseUrl: '' }), {
      path: '/api/health',
      headers: {}
    } as Partial<Request>);

    expect(configured.passed).toBe(true);
    expect(unconfigured.passed).toBe(true);
    expect(configured.req.auth).toBeUndefined();
  });

  it('treats a trailing slash on the health route as the same route', async () => {
    const { passed } = await run(seam(), { path: '/api/health/', headers: {} } as Partial<Request>);

    expect(passed).toBe(true);
  });

  it('does not open a path that merely starts with the health route', async () => {
    const { error } = await run(seam(), {
      path: '/api/healthcheck',
      headers: {}
    } as Partial<Request>);

    expect(status(error)).toBe(401);
  });
});
