import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

import { authSeam } from './auth.js';

describe('authSeam', () => {
  it('passes every request through and writes nothing', () => {
    const next = vi.fn();
    const res = {
      status: vi.fn(),
      json: vi.fn(),
      end: vi.fn(),
    } as unknown as Response;

    authSeam({} as Request, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
    expect(res.end).not.toHaveBeenCalled();
  });
});
