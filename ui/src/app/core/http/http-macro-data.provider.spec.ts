import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import type { Envelope, Observation } from '../macro-contracts';
import { HttpMacroDataProvider } from './http-macro-data.provider';
import { MacroRequestError } from './macro-error';

const EMPTY_META: Envelope<never>['meta'] = {
  page: 1,
  pageSize: 500,
  totalCount: 0,
  vintages: [],
  attribution: []
};

describe('HttpMacroDataProvider', () => {
  let provider: HttpMacroDataProvider;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), HttpMacroDataProvider]
    });

    provider = TestBed.inject(HttpMacroDataProvider);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('routes', () => {
    it('requests /api/macro/countries with no parameters', () => {
      provider.countries().subscribe();

      const request = http.expectOne('/api/macro/countries');
      expect(request.request.method).toBe('GET');
      expect(request.request.params.keys()).toEqual([]);
      request.flush({ data: [], meta: EMPTY_META });
    });

    it('requests /api/macro/indicators with the serialised query', () => {
      provider.indicators({ curated: false, q: 'gdp' }).subscribe();

      const request = http.expectOne((candidate) => candidate.url === '/api/macro/indicators');
      expect(request.request.method).toBe('GET');
      expect(request.request.params.get('curated')).toBe('false');
      expect(request.request.params.get('q')).toBe('gdp');
      request.flush({ data: [], meta: EMPTY_META });
    });

    it('sends indicators and countries as CSV, never as repeated keys', () => {
      provider
        .observations({
          indicators: ['GDP_GROWTH_REAL', 'CPI_INFLATION_AVG'],
          countries: ['ZAF', 'NAM'],
          yearFrom: 2020,
          yearTo: 2030
        })
        .subscribe();

      const request = http.expectOne((candidate) => candidate.url === '/api/macro/observations');
      expect(request.request.params.getAll('indicators')).toEqual([
        'GDP_GROWTH_REAL,CPI_INFLATION_AVG'
      ]);
      expect(request.request.params.getAll('countries')).toEqual(['ZAF,NAM']);
      expect(request.request.urlWithParams).toBe(
        '/api/macro/observations?indicators=GDP_GROWTH_REAL,CPI_INFLATION_AVG&countries=ZAF,NAM&yearFrom=2020&yearTo=2030'
      );
      request.flush({ data: [], meta: EMPTY_META });
    });

    it('requests /api/macro/series with the same filters', () => {
      provider.series({ indicators: ['GDP_GROWTH_REAL'], forecast: 'forecast' }).subscribe();

      const request = http.expectOne((candidate) => candidate.url === '/api/macro/series');
      expect(request.request.params.get('indicators')).toBe('GDP_GROWTH_REAL');
      expect(request.request.params.get('forecast')).toBe('forecast');
      request.flush({ data: [], meta: EMPTY_META });
    });

    it('requests /api/macro/vintages', () => {
      provider.vintages({ source: 'IMF_WEO' }).subscribe();

      const request = http.expectOne((candidate) => candidate.url === '/api/macro/vintages');
      expect(request.request.params.get('source')).toBe('IMF_WEO');
      request.flush({ data: [], meta: EMPTY_META });
    });

    it('builds the revisions path from the id argument', () => {
      provider.revisions(14, { countries: ['ZAF'] }).subscribe();

      const request = http.expectOne(
        (candidate) => candidate.url === '/api/macro/vintages/14/revisions'
      );
      expect(request.request.method).toBe('GET');
      expect(request.request.params.get('countries')).toBe('ZAF');
      request.flush({ data: [], meta: EMPTY_META });
    });
  });

  describe('responses', () => {
    it('passes the envelope through untouched', () => {
      const envelope: Envelope<Observation> = {
        data: [
          {
            indicator: 'GDP_GROWTH_REAL',
            country: 'ZAF',
            year: 2024,
            value: -6.168925,
            isForecast: false,
            source: 'IMF_WEO',
            vintageId: 2
          }
        ],
        meta: {
          page: 1,
          pageSize: 500,
          totalCount: 1,
          vintages: [{ id: 2, source: 'IMF_WEO', label: 'WEO 9.0.0 2025-10-08' }],
          attribution: ['IMF World Economic Outlook']
        }
      };

      let received: Envelope<Observation> | undefined;
      provider.observations({ indicators: ['GDP_GROWTH_REAL'] }).subscribe((value) => {
        received = value;
      });

      http.expectOne((candidate) => candidate.url === '/api/macro/observations').flush(envelope);

      expect(received).toEqual(envelope);
      // Not rounded, not reshaped: the stored precision survives the transport.
      expect(received?.data[0].value).toBe(-6.168925);
    });

    it('resolves a 200 with empty data rather than erroring', () => {
      let received: Envelope<Observation> | undefined;
      let errored = false;

      provider.observations({ indicators: ['GDP_GROWTH_REAL'] }).subscribe({
        next: (value) => {
          received = value;
        },
        error: () => {
          errored = true;
        }
      });

      http
        .expectOne((candidate) => candidate.url === '/api/macro/observations')
        .flush({ data: [], meta: EMPTY_META });

      expect(errored).toBeFalse();
      expect(received?.data).toEqual([]);
    });
  });

  describe('errors', () => {
    it('surfaces a 400 problem+json with its status and detail', () => {
      let caught: MacroRequestError | undefined;

      provider.observations({ indicators: ['NOPE'] }).subscribe({
        error: (error: MacroRequestError) => {
          caught = error;
        }
      });

      http.expectOne((candidate) => candidate.url === '/api/macro/observations').flush(
        {
          title: 'Bad Request',
          status: 400,
          detail: 'Unknown indicator code(s): NOPE.',
          instance: '/api/macro/observations'
        },
        {
          status: 400,
          statusText: 'Bad Request',
          headers: { 'Content-Type': 'application/problem+json' }
        }
      );

      expect(caught).toBeInstanceOf(MacroRequestError);
      expect(caught?.status).toBe(400);
      expect(caught?.detail).toBe('Unknown indicator code(s): NOPE.');
    });

    it('surfaces 401, 404 and 500 with a null detail for a non-problem body', () => {
      for (const status of [401, 404, 500]) {
        let caught: MacroRequestError | undefined;

        provider.countries().subscribe({
          error: (error: MacroRequestError) => {
            caught = error;
          }
        });

        http
          .expectOne('/api/macro/countries')
          .flush('Server error', { status, statusText: 'Error' });

        expect(caught).withContext(`status ${status}`).toBeInstanceOf(MacroRequestError);
        expect(caught?.status).withContext(`status ${status}`).toBe(status);
        expect(caught?.detail).withContext(`status ${status}`).toBeNull();
      }
    });

    it('surfaces a network failure as status 0', () => {
      let caught: MacroRequestError | undefined;

      provider.countries().subscribe({
        error: (error: MacroRequestError) => {
          caught = error;
        }
      });

      http.expectOne('/api/macro/countries').error(new ProgressEvent('error'));

      expect(caught).toBeInstanceOf(MacroRequestError);
      expect(caught?.status).toBe(0);
      expect(caught?.detail).toBeNull();
    });
  });

  describe('cache neutrality', () => {
    it('sends no cache header and no cache-busting parameter on any route', () => {
      provider.countries().subscribe();
      provider.indicators().subscribe();
      provider.observations({ indicators: ['GDP_GROWTH_REAL'] }).subscribe();
      provider.series({ indicators: ['GDP_GROWTH_REAL'] }).subscribe();
      provider.vintages().subscribe();
      provider.revisions(2).subscribe();

      const requests = http.match(() => true);
      expect(requests.length).toBe(6);

      for (const { request } of requests) {
        expect(request.method).withContext(request.url).toBe('GET');
        expect(request.headers.has('Cache-Control')).withContext(request.url).toBeFalse();
        expect(request.headers.has('Pragma')).withContext(request.url).toBeFalse();
        expect(request.headers.has('If-None-Match')).withContext(request.url).toBeFalse();
        expect(request.headers.has('If-Modified-Since')).withContext(request.url).toBeFalse();

        for (const key of request.params.keys()) {
          expect(['_', 't', 'ts', 'cacheBust', 'nocache'])
            .withContext(`${request.url} sent ${key}`)
            .not.toContain(key);
        }
      }

      for (const request of requests) {
        request.flush({ data: [], meta: EMPTY_META });
      }
    });
  });
});
