import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import express, { type NextFunction, type Request, type Response } from 'express';

import type { AuthContext } from './auth.js';
import { errorHandler } from './error-handler.js';
import { ROLES, requireRole, resolveRole, satisfies, type Role } from './roles.js';

function caller(role: string | null): AuthContext {
  return {
    userId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    email: 'thandi@example.com',
    role,
    organisation: 'Treasury Risk',
  };
}

describe('resolveRole', () => {
  it('recognises an exact Administrator', () => {
    expect(resolveRole(caller('Administrator'))).toBe('Administrator');
  });

  it('recognises Member', () => {
    expect(resolveRole(caller('Member'))).toBe('Member');
  });

  it.each([
    ['no role', null],
    ['an unknown name', 'Owner'],
    ['a case variant', 'administrator'],
    ['padding', ' Administrator'],
  ])('treats %s as Member', (_label, role) => {
    expect(resolveRole(caller(role))).toBe('Member');
  });
});

describe('satisfies', () => {
  it.each<[Role, Role, boolean]>([
    ['Administrator', 'Administrator', true],
    ['Administrator', 'Member', true],
    ['Member', 'Member', true],
    ['Member', 'Administrator', false],
  ])('%s against %s is %s', (held, required, expected) => {
    expect(satisfies(held, required)).toBe(expected);
  });

  it('ranks every role', () => {
    expect(ROLES).toEqual(['Member', 'Administrator']);
  });
});

describe('requireRole', () => {
  /** Runs the middleware once and reports what it handed to `next`. */
  function run(required: Role, auth: AuthContext | undefined) {
    const handed: unknown[] = [];
    const next: NextFunction = (error?: unknown) => {
      handed.push(error);
    };
    const req = { auth } as Request;
    const res = { status: vi.fn(), json: vi.fn() } as unknown as Response;

    requireRole(required)(req, res, next);

    expect(handed).toHaveLength(1);
    // Refusal travels through `errorHandler`; nothing is written here.
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
    return handed[0] as { status?: number; message?: string } | undefined;
  }

  it('refuses a request with no verified session as 401', () => {
    const error = run('Member', undefined);

    expect(error?.status).toBe(401);
    expect(error?.message).toBe('This request carried no valid session.');
  });

  it('refuses a role below the requirement as 403', () => {
    const error = run('Administrator', caller('Member'));

    expect(error?.status).toBe(403);
    expect(error?.message).toBe('This account does not have permission for this request.');
  });

  it('refuses a caller with no role where Administrator is required', () => {
    expect(run('Administrator', caller(null))?.status).toBe(403);
  });

  it('admits a role that reaches the requirement', () => {
    expect(run('Administrator', caller('Administrator'))).toBeUndefined();
    expect(run('Member', caller('Administrator'))).toBeUndefined();
    expect(run('Member', caller(null))).toBeUndefined();
  });
});

describe('requireRole over HTTP', () => {
  const servers: Server[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map((server) => new Promise<void>((done) => server.close(() => done()))),
    );
  });

  /**
   * A throwaway app: a stand-in seam that sets `req.auth`, one gated route, and
   * the real `errorHandler`, so the response shape is the one callers will see.
   */
  async function serve(auth: AuthContext | undefined) {
    const app = express();

    app.use((req, _res, next) => {
      req.auth = auth;
      next();
    });
    app.get('/gated', requireRole('Administrator'), (_req, res) => {
      res.json({ ok: true });
    });
    app.use(errorHandler);

    const server = await new Promise<Server>((resolve) => {
      const started = app.listen(0, () => resolve(started));
    });
    servers.push(server);

    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected a TCP address');
    }

    return fetch(`http://127.0.0.1:${address.port}/gated`);
  }

  it('answers 401 with only the fixed message when there is no session', async () => {
    const response = await serve(undefined);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'This request carried no valid session.' });
  });

  it('answers 403 with only the fixed message for a Member', async () => {
    const response = await serve(caller('Member'));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'This account does not have permission for this request.',
    });
  });

  it('reaches the handler for an Administrator', async () => {
    const response = await serve(caller('Administrator'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});
