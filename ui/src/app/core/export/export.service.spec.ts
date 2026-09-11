import { Injectable } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable } from 'rxjs';

import { MacroRequestError } from '../http/macro-error';
import type { Envelope, EnvelopeMeta, Observation, ObservationsQuery } from '../macro-contracts';
import { MACRO_DATA, type MacroDataProvider } from '../macro-data.provider';
import { WorkingQueryStore } from '../working-query.store';
import {
  EXPORT_CLOCK,
  EXPORT_DOWNLOADER,
  EXPORT_PAGE_SIZE,
  ExportService,
  type ExportFile
} from './export.service';

const NOW = '2026-09-11T13:24:05.221Z';

function meta(overrides: Partial<EnvelopeMeta> = {}): EnvelopeMeta {
  return {
    page: 1,
    pageSize: EXPORT_PAGE_SIZE,
    totalCount: 1,
    vintages: [{ id: 12, source: 'IMF_WEO', label: 'WEO 10.0.0 2026-04-14' }],
    attribution: ['Source: IMF World Economic Outlook database'],
    ...overrides
  };
}

function row(year = 2024): Observation {
  return {
    indicator: 'GDP_GROWTH_REAL',
    country: 'ZAF',
    year,
    value: 1.1,
    isForecast: false,
    source: 'IMF_WEO',
    vintageId: 12
  };
}

/**
 * Holds every request until released, so the in-flight window is observable.
 *
 * A synchronous double makes that window zero-width, which is exactly how five
 * defects in this project (F-11, F-13, F-16, F-26, F-29) reached a green suite.
 * `busy` lives entirely inside it.
 */
@Injectable()
class DeferredMacro implements Partial<MacroDataProvider> {
  calls: ObservationsQuery[] = [];
  answer: Envelope<Observation> = { data: [row()], meta: meta() };
  failWith: unknown = null;
  private pending: (() => void)[] = [];

  observations = (query: ObservationsQuery): Observable<Envelope<Observation>> => {
    this.calls.push(query);

    return new Observable<Envelope<Observation>>((subscriber) => {
      this.pending.push(() => {
        if (this.failWith !== null) {
          subscriber.error(this.failWith);
          return;
        }
        subscriber.next(this.answer);
        subscriber.complete();
      });
    });
  };

  release(): void {
    const settle = this.pending.shift();
    settle?.();
  }
}

describe('ExportService', () => {
  let service: ExportService;
  let store: WorkingQueryStore;
  let macro: DeferredMacro;
  let saved: ExportFile[];

  beforeEach(() => {
    saved = [];

    TestBed.configureTestingModule({
      providers: [
        DeferredMacro,
        { provide: MACRO_DATA, useExisting: DeferredMacro },
        { provide: EXPORT_DOWNLOADER, useValue: (file: ExportFile) => saved.push(file) },
        { provide: EXPORT_CLOCK, useValue: () => NOW },
        WorkingQueryStore,
        ExportService
      ]
    });

    macro = TestBed.inject(DeferredMacro);
    store = TestBed.inject(WorkingQueryStore);
    store.reset();
    service = TestBed.inject(ExportService);
  });

  afterEach(() => TestBed.resetTestingModule());

  function sendable(): void {
    store.addIndicator('GDP_GROWTH_REAL');
  }

  describe('the request', () => {
    it('asks the working query with paging widened, and nothing else changed', async () => {
      sendable();
      store.addCountry('ZAF');
      store.setYearRange(2018, 2030);
      store.setPage(3);

      const pending = service.download('csv', false);
      macro.release();
      await pending;

      expect(macro.calls.length).toBe(1);
      expect(macro.calls[0]).toEqual(
        jasmine.objectContaining({
          indicators: ['GDP_GROWTH_REAL'],
          countries: ['ZAF'],
          yearFrom: 2018,
          yearTo: 2030,
          page: 1,
          pageSize: EXPORT_PAGE_SIZE
        })
      );
    });

    it('issues no request at all for an unsendable query', async () => {
      // No indicators. The result tabs decline to ask for the same reason.
      expect(await service.download('csv', false)).toEqual({ status: 'invalid' });
      expect(macro.calls.length).toBe(0);
      expect(saved).toEqual([]);
    });
  });

  describe('the in-flight window', () => {
    it('reports busy for the whole round trip and not after it', async () => {
      sendable();
      expect(service.busy()).toBeFalse();

      const pending = service.download('csv', false);
      expect(service.busy()).toBeTrue();

      macro.release();
      await pending;

      expect(service.busy()).toBeFalse();
    });

    it('clears busy when the request fails', async () => {
      sendable();
      macro.failWith = new MacroRequestError(500, null);

      const pending = service.download('csv', false);
      expect(service.busy()).toBeTrue();
      macro.release();
      await pending;

      expect(service.busy()).toBeFalse();
    });

    it('never sets busy for a query it refuses to send', async () => {
      await service.download('csv', false);

      expect(service.busy()).toBeFalse();
    });
  });

  describe('a successful download', () => {
    it('hands the file to the downloader with its name and type', async () => {
      sendable();
      const pending = service.download('csv', false);
      macro.release();

      expect(await pending).toEqual({ status: 'saved', rows: 1 });
      expect(saved.length).toBe(1);
      expect(saved[0].filename).toBe('cyte-macro-observations-2026-09-11.csv');
      expect(saved[0].mimeType).toBe('text/csv;charset=utf-8');
      expect(saved[0].contents).toContain('GDP_GROWTH_REAL,ZAF,2024,1.1,false,IMF_WEO,12');
    });

    it('writes the vintage header only when pinning is asked for', async () => {
      sendable();
      let pending = service.download('csv', true);
      macro.release();
      await pending;

      expect(saved[0].contents).toContain('# vintages: 12 WEO 10.0.0 2026-04-14');

      pending = service.download('csv', false);
      macro.release();
      await pending;

      expect(saved[1].contents).not.toContain('# vintages:');
    });

    it('marks the CSV it hands over as UTF-8, and the JSON not', async () => {
      sendable();
      let pending = service.download('csv', false);
      macro.release();
      await pending;

      expect(saved[0].contents.startsWith('\ufeff')).toBeTrue();

      pending = service.download('json', false);
      macro.release();
      await pending;

      expect(saved[1].contents.startsWith('\ufeff')).toBeFalse();
    });

    it('writes JSON as the envelope, ignoring the pin flag', async () => {
      sendable();
      const pending = service.download('json', false);
      macro.release();
      await pending;

      expect(saved[0].filename.endsWith('.json')).toBeTrue();
      expect(saved[0].mimeType).toBe('application/json');
      // Pinning was off, but meta rides along regardless: it is the envelope.
      expect(JSON.parse(saved[0].contents).meta.vintages[0].id).toBe(12);
    });

    it('reports the row count it actually wrote', async () => {
      sendable();
      macro.answer = { data: [row(2023), row(2024), row(2025)], meta: meta({ totalCount: 3 }) };

      const pending = service.download('csv', false);
      macro.release();

      expect(await pending).toEqual({ status: 'saved', rows: 3 });
    });

    it('writes an empty result as a valid empty file, not as a failure', async () => {
      sendable();
      macro.answer = { data: [], meta: meta({ totalCount: 0 }) };

      const pending = service.download('csv', false);
      macro.release();

      expect(await pending).toEqual({ status: 'saved', rows: 0 });
      expect(saved[0].contents).toContain('indicator,country,year');
    });
  });

  describe('a result larger than one request', () => {
    beforeEach(() => {
      sendable();
      macro.answer = { data: [row()], meta: meta({ totalCount: 6200 }) };
    });

    it('refuses, naming both numbers', async () => {
      const pending = service.download('csv', false);
      macro.release();

      expect(await pending).toEqual({ status: 'too-large', totalCount: 6200, limit: 1 });
    });

    it('writes nothing, rather than a file that looks complete', async () => {
      const pending = service.download('csv', false);
      macro.release();
      await pending;

      expect(saved).toEqual([]);
    });
  });

  describe('a failed request', () => {
    it('reports the service’s own explanation when it gave one', async () => {
      sendable();
      macro.failWith = new MacroRequestError(400, 'Unknown indicator code: NOPE');

      const pending = service.download('csv', false);
      macro.release();

      expect(await pending).toEqual({
        status: 'unavailable',
        message: 'Unknown indicator code: NOPE'
      });
      expect(saved).toEqual([]);
    });

    it('falls back to its own wording when the failure explained nothing', async () => {
      sendable();
      macro.failWith = new Error('boom');

      const pending = service.download('csv', false);
      macro.release();
      const outcome = await pending;

      expect(outcome.status).toBe('unavailable');
      expect(outcome).toEqual(
        jasmine.objectContaining({ message: 'The export could not be downloaded.' })
      );
    });
  });

});
