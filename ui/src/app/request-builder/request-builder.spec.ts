import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FixtureMacroDataProvider } from '../core/fixtures/fixture-macro-data.provider';
import { MACRO_DATA } from '../core/macro-data.provider';
import { REQUEST_CLIPBOARD } from '../core/request/request-clipboard';
import { WorkingQueryStore } from '../core/working-query.store';
import { RequestBuilderPage } from './request-builder';

const ENVELOPE = '{"data":[],"meta":{"totalCount":0}}';

const ALL_HEADERS = {
  ETag: '"v14-p1"',
  'Cache-Control': 'private, max-age=3600',
  'X-Total-Count': '56'
};

describe('RequestBuilderPage', () => {
  let fixture: ComponentFixture<RequestBuilderPage>;
  let store: WorkingQueryStore;
  let http: HttpTestingController;
  let copied: string[];
  let refuseCopy: boolean;

  beforeEach(() => {
    copied = [];
    refuseCopy = false;

    TestBed.configureTestingModule({
      imports: [RequestBuilderPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        // The query card reaches the provider for its catalogue lists.
        { provide: MACRO_DATA, useValue: new FixtureMacroDataProvider() },
        {
          provide: REQUEST_CLIPBOARD,
          useValue: (text: string) =>
            refuseCopy ? Promise.reject(new Error('denied')) : (copied.push(text), Promise.resolve())
        },
        WorkingQueryStore
      ]
    });

    store = TestBed.inject(WorkingQueryStore);
    store.reset();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(RequestBuilderPage);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? '';
  const urlBlock = () => el().querySelector('.url')?.textContent?.trim() ?? '';
  const curlBlock = () => el().querySelector('.curl')?.textContent ?? '';
  const bodyBlock = () => el().querySelector('.body')?.textContent ?? '';
  const sendButton = () => el().querySelector<HTMLButtonElement>('.btn.send');
  // `.copy`, not `.outline-green`: the working-query card above uses that
  // class too, and the first match would be its Reset button.
  const copyButton = () => el().querySelector<HTMLButtonElement>('.btn.copy');
  const statusPill = () => el().querySelector('.pill.status');
  const endpointButton = (label: string) =>
    Array.from(el().querySelectorAll<HTMLButtonElement>('.btn.endpoint')).find(
      (button) => button.textContent?.trim() === label
    );
  const states = () =>
    Array.from(el().querySelectorAll('[role="status"]')).map((n) => n.textContent?.trim() ?? '');

  function sendable(): void {
    store.addIndicator('GDP_GROWTH_REAL');
    store.addCountry('ZAF');
    fixture.detectChanges();
  }

  /** Clicks Send, answers the request, and settles the component's promise. */
  async function send(
    answer: (request: ReturnType<HttpTestingController['expectOne']>) => void,
    endpoint = 'series'
  ): Promise<void> {
    sendButton()?.click();
    fixture.detectChanges();
    answer(http.expectOne((candidate) => candidate.url === `/api/macro/${endpoint}`));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  describe('the request card', () => {
    it('shows the placeholder host, never an invented one', () => {
      sendable();

      expect(urlBlock()).toContain('https://<core-api-host>/api/macro/series?');
      expect(urlBlock()).toContain('indicators=GDP_GROWTH_REAL');
    });

    it('names the console proxy as what Send actually calls', () => {
      // A card that displays one URL and silently requests another teaches the
      // wrong thing, so the difference is on screen.
      sendable();

      expect(text()).toContain('/api/macro/series?');
      expect(text()).toContain("calls this console's own passthrough");
    });

    it('follows the endpoint selection in both blocks', () => {
      sendable();
      endpointButton('GET /api/macro/observations')?.click();
      fixture.detectChanges();

      expect(urlBlock()).toContain('/api/macro/observations?');
      expect(curlBlock()).toContain('/api/macro/observations?');
    });

    it('follows a query change', () => {
      sendable();
      expect(urlBlock()).not.toContain('yearFrom');

      store.setYearRange(2018, 2030);
      fixture.detectChanges();

      expect(urlBlock()).toContain('yearFrom=2018');
    });

    it('carries the token placeholder in the curl, never a real credential', () => {
      sendable();

      expect(curlBlock()).toContain('Authorization: Bearer $TOKEN');
      expect(curlBlock()).not.toContain('If-None-Match');
    });

    it('refuses an unsendable query, and says why instead of showing a URL', () => {
      expect(sendButton()?.disabled).toBeTrue();
      expect(copyButton()?.disabled).toBeTrue();
      expect(el().querySelector('.url')).toBeNull();
      expect(states().some((line) => line.includes('at least one indicator'))).toBeTrue();
    });
  });

  describe('sending', () => {
    it('reports a 200 with the three relayed headers', async () => {
      sendable();
      await send((request) =>
        request.flush(ENVELOPE, { status: 200, statusText: 'OK', headers: ALL_HEADERS })
      );

      expect(statusPill()?.textContent?.trim()).toBe('200');
      expect(text()).toContain('"v14-p1"');
      expect(text()).toContain('private, max-age=3600');
      expect(text()).toContain('56');
    });

    it('reads an em dash for a header the response did not carry', async () => {
      sendable();
      await send((request) => request.flush(ENVELOPE));

      expect(text()).toContain('—');
      expect(text()).not.toContain('undefined');
    });

    it('pretty-prints the envelope', async () => {
      sendable();
      await send((request) => request.flush(ENVELOPE));

      expect(bodyBlock()).toContain('"data": []');
    });

    it('shows a 400 problem body, which is the point of this tab', async () => {
      sendable();
      await send((request) =>
        request.flush('{"detail":"Unknown indicator code(s): NOPE."}', {
          status: 400,
          statusText: 'Bad Request'
        })
      );

      expect(statusPill()?.textContent?.trim()).toBe('400');
      expect(bodyBlock()).toContain('Unknown indicator code(s): NOPE.');
    });

    it('renders a body that is not JSON as it arrived', async () => {
      sendable();
      await send((request) =>
        request.flush('<html>gateway</html>', { status: 502, statusText: 'Bad Gateway' })
      );

      expect(bodyBlock()).toContain('<html>gateway</html>');
    });

    it('reports a request that never arrived, separately from a status', async () => {
      sendable();
      await send((request) =>
        request.error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' })
      );

      expect(statusPill()?.textContent?.trim()).toBe('No answer');
      expect(states().some((line) => line.includes('did not reach the service'))).toBeTrue();
    });

    it('holds the button and says so for the whole round trip', async () => {
      sendable();
      sendButton()?.click();
      fixture.detectChanges();

      expect(sendButton()?.disabled).toBeTrue();
      expect(sendButton()?.textContent?.trim()).toBe('Sending…');

      http.expectOne((candidate) => candidate.url === '/api/macro/series').flush(ENVELOPE);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(sendButton()?.disabled).toBeFalse();
      expect(sendButton()?.textContent?.trim()).toBe('Send request');
    });

    it('reads Not sent before the first send', () => {
      sendable();

      expect(statusPill()?.textContent?.trim()).toBe('Not sent');
      expect(text()).toContain('Press Send request to see the response envelope.');
    });

    it('drops the previous answer when the query changes', async () => {
      // The working-query card is on this page, so the request can change
      // without the endpoint moving. The answer described the old one.
      sendable();
      await send((request) => request.flush(ENVELOPE));
      expect(statusPill()?.textContent?.trim()).toBe('200');

      store.addCountry('NAM');
      fixture.detectChanges();

      expect(statusPill()?.textContent?.trim()).toBe('Not sent');
      expect(el().querySelector('.body')).toBeNull();
    });

    it('drops it for a year change too, not only for a code', async () => {
      sendable();
      await send((request) => request.flush(ENVELOPE));

      store.setYearRange(2018, 2030);
      fixture.detectChanges();

      expect(statusPill()?.textContent?.trim()).toBe('Not sent');
    });

    it('clears the copy confirmation with it, since the curl changed too', async () => {
      sendable();
      copyButton()?.click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(states().some((line) => line.includes('curl copied'))).toBeTrue();

      store.addCountry('NAM');
      fixture.detectChanges();

      expect(states().some((line) => line.includes('curl copied'))).toBeFalse();
    });

    it('leaves a settled answer alone when the current endpoint is re-selected', async () => {
      sendable();
      await send((request) => request.flush(ENVELOPE));

      endpointButton('GET /api/macro/series')?.click();
      fixture.detectChanges();

      // Signals compare with Object.is, so setting the same value notifies
      // nothing and the effect does not run.
      expect(statusPill()?.textContent?.trim()).toBe('200');
    });

    it('discards an answer that arrives after the query changed', async () => {
      // The in-flight window this repair could otherwise have opened: the effect
      // clears the card, then the late assignment puts the stale answer back.
      sendable();
      sendButton()?.click();
      fixture.detectChanges();
      const inFlight = http.expectOne((candidate) => candidate.url === '/api/macro/series');

      store.addCountry('NAM');
      fixture.detectChanges();

      inFlight.flush(ENVELOPE, { status: 200, statusText: 'OK', headers: ALL_HEADERS });
      await fixture.whenStable();
      fixture.detectChanges();

      expect(statusPill()?.textContent?.trim()).toBe('Not sent');
      expect(el().querySelector('.body')).toBeNull();
    });

    it('drops the previous answer when the endpoint changes', async () => {
      sendable();
      await send((request) => request.flush(ENVELOPE));
      expect(statusPill()?.textContent?.trim()).toBe('200');

      endpointButton('GET /api/macro/observations')?.click();
      fixture.detectChanges();

      // The answer described a different request.
      expect(statusPill()?.textContent?.trim()).toBe('Not sent');
    });
  });

  describe('the 304 the tab exists to demonstrate', () => {
    it('shows the validator in the curl once one has been seen', async () => {
      sendable();
      await send((request) =>
        request.flush(ENVELOPE, { status: 200, statusText: 'OK', headers: ALL_HEADERS })
      );

      expect(curlBlock()).toContain('-H "If-None-Match: \\"v14-p1\\""');
    });

    it('sends it back and renders the 304 with no body', async () => {
      sendable();
      await send((request) =>
        request.flush(ENVELOPE, { status: 200, statusText: 'OK', headers: ALL_HEADERS })
      );

      sendButton()?.click();
      fixture.detectChanges();
      const repeat = http.expectOne((candidate) => candidate.url === '/api/macro/series');
      expect(repeat.request.headers.get('If-None-Match')).toBe('"v14-p1"');

      repeat.flush(null, { status: 304, statusText: 'Not Modified' });
      await fixture.whenStable();
      fixture.detectChanges();

      expect(statusPill()?.textContent?.trim()).toBe('304');
      expect(el().querySelector('.body')).toBeNull();
      expect(text()).toContain('your cached copy is still current');
    });

    it('drops the validator from the curl once the query changes', async () => {
      sendable();
      await send((request) =>
        request.flush(ENVELOPE, { status: 200, statusText: 'OK', headers: ALL_HEADERS })
      );
      expect(curlBlock()).toContain('If-None-Match');

      store.setYearRange(1990, 1995);
      fixture.detectChanges();

      // A validator belongs to the request that produced it.
      expect(curlBlock()).not.toContain('If-None-Match');
    });
  });

  describe('copy curl', () => {
    it('copies exactly what is on screen', async () => {
      sendable();
      copyButton()?.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(copied.length).toBe(1);
      expect(copied[0]).toBe(curlBlock());
      expect(states().some((line) => line.includes('curl copied'))).toBeTrue();
    });

    it('reports a refusal rather than throwing, and leaves the curl on screen', async () => {
      sendable();
      refuseCopy = true;
      copyButton()?.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(states().some((line) => line.includes('Could not copy'))).toBeTrue();
      expect(curlBlock()).toContain('curl -s');
    });
  });

  it('renders the status-code reference the design carries', () => {
    const rows = Array.from(el().querySelectorAll('.codes tbody tr'));

    expect(rows.map((tr) => tr.querySelector('td')?.textContent?.trim())).toEqual([
      '400',
      '401',
      '404',
      '304',
      '5xx'
    ]);
  });
});
