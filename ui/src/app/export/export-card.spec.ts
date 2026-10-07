import { Injectable } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable } from 'rxjs';

import { MacroRequestError } from '../core/http/macro-error';
import { LastResultMeta } from '../core/last-result-meta';
import type { Envelope, EnvelopeMeta, Observation, ObservationsQuery } from '../core/macro-contracts';
import { MACRO_DATA, type MacroDataProvider } from '../core/macro-data.provider';
import {
  EXPORT_CLOCK,
  EXPORT_DOWNLOADER,
  type ExportFile
} from '../core/export/export.service';
import { WorkingQueryStore } from '../core/working-query.store';
import { ExportCard } from './export-card';

const NOW = '2026-09-11T13:24:05.221Z';

function meta(overrides: Partial<EnvelopeMeta> = {}): EnvelopeMeta {
  return {
    page: 1,
    pageSize: 5000,
    totalCount: 1,
    vintages: [{ id: 12, source: 'IMF_WEO', label: 'WEO 10.0.0 2026-04-14' }],
    attribution: ['Source: IMF World Economic Outlook database'],
    ...overrides
  };
}

const ROW: Observation = {
  indicator: 'GDP_GROWTH_REAL',
  country: 'ZAF',
  year: 2024,
  value: 1.1,
  isForecast: false,
  source: 'IMF_WEO',
  vintageId: 12
};

/** Deferred, so the card's busy window is wider than zero. */
@Injectable()
class DeferredMacro implements Partial<MacroDataProvider> {
  answer: Envelope<Observation> = { data: [ROW], meta: meta() };
  failWith: unknown = null;
  calls = 0;
  private pending: (() => void)[] = [];

  observations = (_query: ObservationsQuery): Observable<Envelope<Observation>> => {
    this.calls += 1;

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
    this.pending.shift()?.();
  }
}

describe('ExportCard', () => {
  let fixture: ComponentFixture<ExportCard>;
  let store: WorkingQueryStore;
  let lastResult: LastResultMeta;
  let macro: DeferredMacro;
  let saved: ExportFile[];

  beforeEach(() => {
    saved = [];

    TestBed.configureTestingModule({
      imports: [ExportCard],
      providers: [
        DeferredMacro,
        { provide: MACRO_DATA, useExisting: DeferredMacro },
        { provide: EXPORT_DOWNLOADER, useValue: (file: ExportFile) => saved.push(file) },
        { provide: EXPORT_CLOCK, useValue: () => NOW },
        WorkingQueryStore,
        LastResultMeta
      ]
    });

    macro = TestBed.inject(DeferredMacro);
    store = TestBed.inject(WorkingQueryStore);
    store.reset();
    lastResult = TestBed.inject(LastResultMeta);
    fixture = TestBed.createComponent(ExportCard);
    fixture.detectChanges();
  });

  afterEach(() => TestBed.resetTestingModule());

  const el = () => fixture.nativeElement as HTMLElement;
  const formatButtons = () =>
    Array.from(el().querySelectorAll<HTMLButtonElement>('.btn.format'));
  const formatButton = (label: string) =>
    formatButtons().find((button) => button.textContent?.trim() === label);
  const downloadButton = () => el().querySelector<HTMLButtonElement>('.btn.download');
  const pinBox = () => el().querySelector<HTMLInputElement>('.pin input');
  const text = () => el().textContent ?? '';
  const states = () =>
    Array.from(el().querySelectorAll('[role="status"]')).map((n) => n.textContent?.trim() ?? '');

  function sendable(): void {
    store.addIndicator('GDP_GROWTH_REAL');
    fixture.detectChanges();
  }

  /** Records a settled result for the query as it stands now. */
  function seen(totalCount: number): void {
    lastResult.record(store.query(), meta({ totalCount }));
    fixture.detectChanges();
  }

  /**
   * Clicks, settles the held request, then waits for the component's own
   * promise chain. `click()` returns void, so `whenStable` is what actually
   * waits here.
   */
  async function clickDownload(): Promise<void> {
    downloadButton()?.click();
    fixture.detectChanges();
    macro.release();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  describe('the format control', () => {
    it('offers exactly the two formats that can be written', () => {
      expect(formatButtons().map((button) => button.textContent?.trim())).toEqual(['CSV', 'JSON']);
    });

    it('starts on CSV, and the button names it', () => {
      expect(formatButton('CSV')?.getAttribute('aria-pressed')).toBe('true');
      expect(downloadButton()?.textContent?.trim()).toBe('Download CSV');
    });

    it('follows the selection', () => {
      formatButton('JSON')?.click();
      fixture.detectChanges();

      expect(formatButton('JSON')?.getAttribute('aria-pressed')).toBe('true');
      expect(formatButton('CSV')?.getAttribute('aria-pressed')).toBe('false');
      expect(downloadButton()?.textContent?.trim()).toBe('Download JSON');
    });

  });

  describe('the pin checkbox', () => {
    it('starts on, because reproducibility is the point of the card', () => {
      expect(pinBox()?.checked).toBeTrue();
      expect(pinBox()?.disabled).toBeFalse();
    });

    it('toggles off', () => {
      pinBox()?.click();
      fixture.detectChanges();

      expect(pinBox()?.checked).toBeFalse();
    });

    it('is checked and locked for JSON, with the reason given', () => {
      formatButton('JSON')?.click();
      fixture.detectChanges();

      expect(pinBox()?.checked).toBeTrue();
      expect(pinBox()?.disabled).toBeTrue();
      expect(text()).toContain('always carries meta.vintages');
    });

    it('restores the user’s own choice when they leave JSON again', () => {
      pinBox()?.click();
      fixture.detectChanges();
      expect(pinBox()?.checked).toBeFalse();

      formatButton('JSON')?.click();
      fixture.detectChanges();
      expect(pinBox()?.checked).toBeTrue();

      formatButton('CSV')?.click();
      fixture.detectChanges();

      // The lock overrode the display, it did not overwrite the setting.
      expect(pinBox()?.checked).toBeFalse();
    });
  });

  describe('the scope line', () => {
    it('reads an em dash for the rows before any result has been seen', () => {
      sendable();

      expect(text()).toContain('— rows · 1 indicators · all countries');
      expect(states().some((line) => line.includes('Run this query on Observations'))).toBeTrue();
    });

    it('reads the recorded total once a result has settled for this query', () => {
      sendable();
      seen(56);

      expect(text()).toContain('56 rows · 1 indicators · all countries');
      expect(states().some((line) => line.includes('Run this query on Observations'))).toBeFalse();
    });

    it('reads an em dash, not a series count, after the Series tab answered', () => {
      sendable();
      lastResult.record(store.query(), meta({ totalCount: 2 }), 'series');
      fixture.detectChanges();

      expect(text()).toContain('— rows · 1 indicators · all countries');
      expect(text()).not.toContain('2 rows');
    });

    it('returns to the em dash when the query changes after its result', () => {
      // The guard: a count belongs to the query that produced it.
      sendable();
      seen(56);
      store.setYearRange(1990, 1995);
      fixture.detectChanges();

      expect(text()).toContain('— rows');
    });

    it('counts the selected countries when there are any', () => {
      sendable();
      store.addCountry('ZAF');
      store.addCountry('NAM');
      fixture.detectChanges();

      expect(text()).toContain('2 countries');
    });

    it('groups a large count, because six digits are unreadable ungrouped', () => {
      sendable();
      seen(124500);

      expect(text()).toContain('124,500 rows');
    });
  });

  describe('downloading', () => {
    it('refuses an unsendable query, and says why', () => {
      expect(downloadButton()?.disabled).toBeTrue();
      expect(states().some((line) => line.includes('at least one indicator'))).toBeTrue();
    });

    it('writes the file and confirms the row count', async () => {
      sendable();
      await clickDownload();

      expect(saved.length).toBe(1);
      expect(saved[0].filename).toBe('cyte-macro-observations-2026-09-11.csv');
      expect(states().some((line) => line.includes('Downloaded 1 rows'))).toBeTrue();
    });

    it('reports busy for the whole round trip, with the button held', async () => {
      sendable();
      downloadButton()?.click();
      fixture.detectChanges();

      // The window a synchronous double would make zero-width.
      expect(downloadButton()?.disabled).toBeTrue();
      expect(downloadButton()?.textContent?.trim()).toBe('Preparing…');

      macro.release();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(downloadButton()?.disabled).toBeFalse();
      expect(downloadButton()?.textContent?.trim()).toBe('Download CSV');
    });

    it('says plainly when the query returns nothing', async () => {
      sendable();
      macro.answer = { data: [], meta: meta({ totalCount: 0 }) };
      await clickDownload();

      expect(states().some((line) => line.includes('empty file'))).toBeTrue();
      expect(saved.length).toBe(1);
    });

    it('reports a result too large to carry, and writes nothing', async () => {
      sendable();
      macro.answer = { data: [ROW], meta: meta({ totalCount: 6200 }) };
      await clickDownload();

      const message = states().find((line) => line.includes('6,200'));
      expect(message).toContain('Narrow the years or the countries');
      expect(saved).toEqual([]);
    });

    it('reports the service’s own explanation when a request fails', async () => {
      sendable();
      macro.failWith = new MacroRequestError(400, 'Unknown indicator code: NOPE');
      await clickDownload();

      expect(states().some((line) => line.includes('Unknown indicator code: NOPE'))).toBeTrue();
      expect(saved).toEqual([]);
    });

    it('clears the last message when the format changes', async () => {
      sendable();
      await clickDownload();
      expect(states().some((line) => line.includes('Downloaded'))).toBeTrue();

      formatButton('JSON')?.click();
      fixture.detectChanges();

      expect(states().some((line) => line.includes('Downloaded'))).toBeFalse();
    });
  });

  it('renders the Integration habit note the design carries', () => {
    expect(text()).toContain('Integration habit');
    expect(text()).toContain('meta.vintages');
  });
});
