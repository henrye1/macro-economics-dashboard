import type { Request, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { errorHandler, notFound } from './error-handler.js';

interface ResponseStub {
  statusCode: number | undefined;
  body: unknown;
  headers: Record<string, string>;
  status(code: number): ResponseStub;
  json(payload: unknown): ResponseStub;
  setHeader(name: string, value: string): ResponseStub;
}

function responseStub(): ResponseStub {
  return {
    statusCode: undefined,
    body: undefined,
    headers: {},
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

afterEach(() => vi.restoreAllMocks());

describe('notFound', () => {
  it('answers 404 and names the path that missed', () => {
    const res = responseStub();

    notFound(
      { originalUrl: '/api/macro/nope' } as Request,
      res as unknown as Response,
      () => undefined
    );

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'Not Found', path: '/api/macro/nope' });
    expect(res.headers['x-error-source']).toBeUndefined();
  });
});

describe('errorHandler', () => {
  it('uses the status carried by the error', () => {
    const res = responseStub();

    errorHandler(
      { status: 400, message: 'unknown indicator code ZZZ' },
      {} as Request,
      res as unknown as Response,
      () => undefined
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'unknown indicator code ZZZ' });
    expect(res.headers['x-error-source']).toBe('api');
  });

  it('marks its own 502 sentence so the console can show it', () => {
    const res = responseStub();

    errorHandler(
      { status: 502, message: 'The Core API rejected the service credentials.' },
      {} as Request,
      res as unknown as Response,
      () => undefined
    );

    expect(res.statusCode).toBe(502);
    expect(res.headers['x-error-source']).toBe('api');
  });

  it('never leaks the internal message on a 500', () => {
    const res = responseStub();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    errorHandler(
      new Error('connection string postgres://user:secret@host failed'),
      {} as Request,
      res as unknown as Response,
      () => undefined
    );

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'Internal Server Error' });
    expect(JSON.stringify(res.body)).not.toContain('secret');
    // The generic text explains nothing, so the console keeps its own wording.
    expect(res.headers['x-error-source']).toBeUndefined();
  });

  it('treats a non-numeric status as a 500', () => {
    const res = responseStub();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    errorHandler(
      { status: 'teapot', message: 'nope' },
      {} as Request,
      res as unknown as Response,
      () => undefined
    );

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'Internal Server Error' });
  });

  it('logs server faults and stays quiet on client errors', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    errorHandler(
      { status: 404, message: 'unknown vintage' },
      {} as Request,
      responseStub() as unknown as Response,
      () => undefined
    );
    expect(logged).not.toHaveBeenCalled();

    errorHandler(
      new Error('boom'),
      {} as Request,
      responseStub() as unknown as Response,
      () => undefined
    );
    expect(logged).toHaveBeenCalledTimes(1);
  });
});
