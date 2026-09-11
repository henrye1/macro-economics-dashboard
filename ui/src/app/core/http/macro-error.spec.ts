import { HttpErrorResponse } from '@angular/common/http';

import { MacroRequestError, macroErrorMessage, toMacroRequestError } from './macro-error';

function errorResponse(status: number, error: unknown): HttpErrorResponse {
  return new HttpErrorResponse({ status, error, url: '/api/macro/observations' });
}

describe('toMacroRequestError', () => {
  it('takes the detail from a problem document', () => {
    const mapped = toMacroRequestError(
      errorResponse(400, {
        title: 'Bad Request',
        status: 400,
        detail: 'Unknown indicator code(s): NOPE.',
        instance: '/api/macro/observations'
      })
    );

    expect(mapped).toBeInstanceOf(MacroRequestError);
    expect(mapped.status).toBe(400);
    expect(mapped.detail).toBe('Unknown indicator code(s): NOPE.');
    expect(mapped.message).toBe('Unknown indicator code(s): NOPE.');
  });

  it('yields a null detail for each non-problem body', () => {
    const cases: readonly [string, unknown][] = [
      ['null body', null],
      ['a bare string', 'Internal Server Error'],
      ['an HTML page', '<html><body>502</body></html>'],
      ['a JSON array', [{ detail: 'nope' }]],
      ['an object with no detail', { title: 'Unauthorized', status: 401 }],
      ['a non-string detail', { detail: 42 }],
      ['an empty detail', { detail: '' }]
    ];

    for (const [label, body] of cases) {
      const mapped = toMacroRequestError(errorResponse(500, body));

      expect(mapped.detail).withContext(label).toBeNull();
    }
  });

  it('preserves 401, 404 and 500 with a null detail when the body is not a problem', () => {
    for (const status of [401, 404, 500]) {
      const mapped = toMacroRequestError(errorResponse(status, 'plain text'));

      expect(mapped.status).withContext(`status ${status}`).toBe(status);
      expect(mapped.detail).withContext(`status ${status}`).toBeNull();
    }
  });

  it('maps a transport failure to status 0 with a null detail', () => {
    const mapped = toMacroRequestError(
      new HttpErrorResponse({
        status: 0,
        error: new ProgressEvent('error'),
        url: '/api/macro/countries'
      })
    );

    expect(mapped.status).toBe(0);
    expect(mapped.detail).toBeNull();
  });

  it('never puts the response body in the message when there is no detail', () => {
    const secretish = 'upstream said: token=abc123';
    const mapped = toMacroRequestError(errorResponse(502, secretish));

    expect(mapped.message).not.toContain(secretish);
    expect(mapped.message).toBe('Macro request failed with status 502');
  });

  it('is a real Error, so catchError and instanceof both work', () => {
    const mapped = toMacroRequestError(errorResponse(400, { detail: 'nope' }));

    expect(mapped instanceof Error).toBeTrue();
    expect(mapped.name).toBe('MacroRequestError');
  });
});

describe('macroErrorMessage', () => {
  const fallback = 'Observations are unavailable.';

  it('prefers the problem detail when the service supplied one', () => {
    const error = new MacroRequestError(400, 'Unknown indicator code(s): NOPE.');

    expect(macroErrorMessage(error, fallback)).toBe('Unknown indicator code(s): NOPE.');
  });

  it('falls back to the tab wording when the error carries no detail', () => {
    expect(macroErrorMessage(new MacroRequestError(500, null), fallback)).toBe(fallback);
    expect(macroErrorMessage(new MacroRequestError(0, null), fallback)).toBe(fallback);
  });

  it('falls back for any error that is not a MacroRequestError', () => {
    expect(macroErrorMessage(new TypeError('undefined is not a function'), fallback)).toBe(
      fallback
    );
    expect(macroErrorMessage('boom', fallback)).toBe(fallback);
    expect(macroErrorMessage(undefined, fallback)).toBe(fallback);
    expect(macroErrorMessage(null, fallback)).toBe(fallback);
  });

  it('never leaks a non-macro error message into the UI', () => {
    const leaky = new Error('connect ECONNREFUSED 10.0.0.4:5432');

    expect(macroErrorMessage(leaky, fallback)).toBe(fallback);
  });
});
