import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import type { ObservationsQuery } from '../macro-contracts';
import { RequestSendService, type SendResult } from './request-send.service';

function query(overrides: Partial<ObservationsQuery> = {}): ObservationsQuery {
  return { indicators: ['GDP_GROWTH_REAL'], countries: ['ZAF'], page: 1, pageSize: 25, ...overrides };
}

const ENVELOPE = '{"data":[],"meta":{"totalCount":0}}';

const ALL_HEADERS = {
  ETag: '"v14-p1"',
  'Cache-Control': 'private, max-age=3600',
  'X-Total-Count': '56'
};

describe('RequestSendService', () => {
  let service: RequestSendService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), RequestSendService]
    });

    service = TestBed.inject(RequestSendService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Sends, answers with the given flush, and resolves the outcome. */
  async function send(
    answer: (request: ReturnType<HttpTestingController['expectOne']>) => void,
    endpoint: 'observations' | 'series' = 'series',
    asked: ObservationsQuery = query()
  ): Promise<SendResult> {
    const pending = service.send(endpoint, asked);
    const request = http.expectOne((candidate) => candidate.url === `/api/macro/${endpoint}`);
    answer(request);
    return pending;
  }

  describe('the request', () => {
    it('gets the proxy path with the serialised query', async () => {
      const pending = service.send('series', query({ indicators: ['A', 'B'] }));
      const request = http.expectOne((candidate) => candidate.url === '/api/macro/series');

      expect(request.request.method).toBe('GET');
      expect(request.request.params.get('indicators')).toBe('A,B');
      // The browser cannot reach the Core API directly, so the send is always
      // the console's own passthrough.
      expect(request.request.url.startsWith('/api/macro/')).toBeTrue();

      request.flush(ENVELOPE);
      await pending;
    });

    it('sets no cache header of its own, so the browser revalidates normally', async () => {
      const pending = service.send('series', query());
      const request = http.expectOne((candidate) => candidate.url === '/api/macro/series');

      expect(request.request.headers.has('Cache-Control')).toBeFalse();
      expect(request.request.headers.has('If-None-Match')).toBeFalse();

      request.flush(ENVELOPE);
      await pending;
    });
  });

  describe('a response that arrived', () => {
    it('reports a 200 with all three relayed headers', async () => {
      const result = await send((request) =>
        request.flush(ENVELOPE, { status: 200, statusText: 'OK', headers: ALL_HEADERS })
      );

      expect(result).toEqual(
        jasmine.objectContaining({
          kind: 'response',
          status: 200,
          body: ENVELOPE,
          headers: {
            etag: '"v14-p1"',
            cacheControl: 'private, max-age=3600',
            totalCount: '56'
          }
        })
      );
    });

    it('reports nulls for headers the response did not carry, never a guess', async () => {
      const result = await send((request) => request.flush(ENVELOPE));

      expect(result).toEqual(
        jasmine.objectContaining({
          headers: { etag: null, cacheControl: null, totalCount: null }
        })
      );
    });

    it('returns a 400 problem body rather than swallowing it', async () => {
      // The point of this tab: the detail names the offending code.
      const problem = '{"title":"Bad Request","detail":"Unknown indicator code(s): NOPE."}';
      const result = await send((request) =>
        request.flush(problem, { status: 400, statusText: 'Bad Request' })
      );

      expect(result).toEqual(
        jasmine.objectContaining({ kind: 'response', status: 400, body: problem })
      );
    });

    it('reports a 5xx as a response, not as a broken request', async () => {
      const result = await send((request) =>
        request.flush('server fault', { status: 503, statusText: 'Service Unavailable' })
      );

      expect(result).toEqual(jasmine.objectContaining({ kind: 'response', status: 503 }));
    });

    it('measures the elapsed time rather than estimating it', async () => {
      const result = await send((request) => request.flush(ENVELOPE));

      expect(result.kind).toBe('response');
      if (result.kind === 'response') {
        expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('a 304', () => {
    it('is classified as a response, because Angular routes it through the error channel', async () => {
      const result = await send((request) =>
        request.flush(null, { status: 304, statusText: 'Not Modified' })
      );

      expect(result).toEqual(
        jasmine.objectContaining({ kind: 'response', status: 304, body: '' })
      );
    });
  });

  describe('a request that never arrived', () => {
    it('is classified unreachable, separately from any status', async () => {
      const result = await send((request) =>
        request.error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' })
      );

      expect(result).toEqual({ kind: 'unreachable', message: 'The request did not reach the service.' });
    });
  });

  describe('the held validator', () => {
    async function sendWithEtag(asked: ObservationsQuery = query()): Promise<void> {
      await send(
        (request) => request.flush(ENVELOPE, { status: 200, statusText: 'OK', headers: ALL_HEADERS }),
        'series',
        asked
      );
    }

    it('is sent back as If-None-Match on a repeat of the same request', async () => {
      await sendWithEtag();

      const pending = service.send('series', query());
      const repeat = http.expectOne((candidate) => candidate.url === '/api/macro/series');

      expect(repeat.request.headers.get('If-None-Match')).toBe('"v14-p1"');
      repeat.flush(null, { status: 304, statusText: 'Not Modified' });
      await pending;
    });

    it('is NOT sent once the query has changed', async () => {
      // The guard: a validator belongs to the request that produced it, and a
      // 304 for a different query would read as "your new query is unchanged".
      await sendWithEtag();

      const changed = query({ yearFrom: 1990 });
      const pending = service.send('series', changed);
      const next = http.expectOne((candidate) => candidate.url === '/api/macro/series');

      expect(next.request.headers.has('If-None-Match')).toBeFalse();
      next.flush(ENVELOPE);
      await pending;
    });

    it('is NOT sent once the endpoint has changed', async () => {
      await sendWithEtag();

      const pending = service.send('observations', query());
      const next = http.expectOne((candidate) => candidate.url === '/api/macro/observations');

      expect(next.request.headers.has('If-None-Match')).toBeFalse();
      next.flush(ENVELOPE);
      await pending;
    });

    it('survives the 304 it produced, which carries no ETag of its own', async () => {
      await sendWithEtag();

      let pending = service.send('series', query());
      http
        .expectOne((candidate) => candidate.url === '/api/macro/series')
        .flush(null, { status: 304, statusText: 'Not Modified' });
      await pending;

      pending = service.send('series', query());
      const third = http.expectOne((candidate) => candidate.url === '/api/macro/series');

      expect(third.request.headers.get('If-None-Match')).toBe('"v14-p1"');
      third.flush(null, { status: 304, statusText: 'Not Modified' });
      await pending;
    });

    it('is dropped when a later answer carries no ETag', async () => {
      await sendWithEtag();

      let pending = service.send('series', query());
      http.expectOne((candidate) => candidate.url === '/api/macro/series').flush(ENVELOPE);
      await pending;

      pending = service.send('series', query());
      const third = http.expectOne((candidate) => candidate.url === '/api/macro/series');

      expect(third.request.headers.has('If-None-Match')).toBeFalse();
      third.flush(ENVELOPE);
      await pending;
    });

    it('is reported for exactly the request it belongs to', async () => {
      await sendWithEtag();

      expect(service.heldEtag('series', query())).toBe('"v14-p1"');
      expect(service.heldEtag('series', query({ yearFrom: 1990 }))).toBeNull();
      expect(service.heldEtag('observations', query())).toBeNull();
    });
  });

  describe('the in-flight window', () => {
    it('reports busy for the whole round trip and not after it', async () => {
      expect(service.busy()).toBeFalse();

      const pending = service.send('series', query());
      expect(service.busy()).toBeTrue();

      http.expectOne((candidate) => candidate.url === '/api/macro/series').flush(ENVELOPE);
      await pending;

      expect(service.busy()).toBeFalse();
    });

    it('clears busy when the request never arrives', async () => {
      const pending = service.send('series', query());
      http
        .expectOne((candidate) => candidate.url === '/api/macro/series')
        .error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
      await pending;

      expect(service.busy()).toBeFalse();
    });
  });
});
