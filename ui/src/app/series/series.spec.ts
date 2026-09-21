import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, throwError } from 'rxjs';

import { FixtureMacroDataProvider } from '../core/fixtures/fixture-macro-data.provider';
import type { Envelope, Series } from '../core/macro-contracts';
import { MacroRequestError } from '../core/http/macro-error';
import { MACRO_DATA, type MacroDataProvider } from '../core/macro-data.provider';
import { WorkingQueryStore } from '../core/working-query.store';
import { SeriesPage } from './series';

/** A provider whose series route fails; everything else still works. */
class FailingSeries extends FixtureMacroDataProvider {
  override series(): Observable<Envelope<Series>> {
    return throwError(() => new Error('series unavailable'));
  }
}

/** Records what it was asked for, so "no request issued" can be asserted. */
class CountingProvider extends FixtureMacroDataProvider {
  calls = 0;

  override series(...args: Parameters<MacroDataProvider['series']>): Observable<Envelope<Series>> {
    this.calls += 1;
    return super.series(...args);
  }
}

describe('SeriesPage', () => {
  let fixture: ComponentFixture<SeriesPage>;
  let store: WorkingQueryStore;

  function setUp(provider: unknown = new FixtureMacroDataProvider()): void {
    TestBed.configureTestingModule({
      imports: [SeriesPage],
      providers: [provideRouter([]), { provide: MACRO_DATA, useValue: provider }]
    });

    store = TestBed.inject(WorkingQueryStore);
    store.reset();
    fixture = TestBed.createComponent(SeriesPage);
  }

  /** The same query Observations uses: 56 rows, which group into 4 series. */
  function seedDesignQuery(): void {
    store.addIndicator('GDP_GROWTH_REAL');
    store.addIndicator('CPI_INFLATION_AVG');
    store.addCountry('ZAF');
    store.addCountry('NAM');
    store.setYearRange(2018, 2031);
  }

  const el = () => fixture.nativeElement as HTMLElement;
  const headMeta = () => el().querySelector('.series-head .card-head .meta');
  const charts = () => Array.from(el().querySelectorAll('app-series-chart .chart-card'));
  const points = (chart: Element) => Array.from(chart.querySelectorAll('circle.point'));
  const metaRows = () =>
    Array.from(el().querySelectorAll('.series-meta tbody tr')).map((row) =>
      Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent?.trim() ?? '')
    );

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  describe('with a populated result', () => {
    beforeEach(() => {
      setUp();
      seedDesignQuery();
      fixture.detectChanges();
    });

    it('draws one chart per indicator, not one per series', () => {
      // Four series: two indicators across two countries.
      expect(charts().length).toBe(2);
      expect(headMeta()?.textContent?.trim()).toBe(
        '4 series · pagination counts series, not rows'
      );
    });

    it('titles each chart with the catalogue name and the code', () => {
      const first = charts()[0];

      expect(first?.querySelector('.chart-title .name')?.textContent?.trim()).toBe(
        'Inflation, average CPI'
      );
      expect(first?.querySelector('.chart-title .code')?.textContent?.trim()).toBe(
        'CPI_INFLATION_AVG'
      );
    });

    it('summarises unit, countries, source and vintage in the chart head', () => {
      expect(charts()[0]?.querySelector('.card-head .meta')?.textContent?.trim()).toBe(
        'Percent · NAM, ZAF · IMF_WEO · WEO 10.0.0 2026-04-14'
      );
    });

    it('does not claim colour means actual or forecast, which is what country means', () => {
      const head = fixture.nativeElement.querySelector('.series-head .legend');

      expect(head.querySelector('.box')).toBeNull();
      expect(head.querySelectorAll('.rule').length).toBe(3);
      expect(head.textContent).toContain('Colour identifies the country');
    });

    it('gives each country on a chart its own line and legend entry', () => {
      const first = charts()[0];
      const legend = Array.from(first!.querySelectorAll('.legend .entry .country')).map(
        (entry) => entry.textContent?.trim()
      );

      // Named, not coded: the series payload carries the ISO3 and the tab
      // resolves it against the catalogue, as the design labels it.
      expect(legend).toEqual(['Namibia', 'South Africa']);
      expect(first!.querySelectorAll('path[stroke-dasharray]').length).toBe(2);
    });

    it('states every plotted value in a visually hidden table', () => {
      const table = charts()[0]!.querySelector('.sr-only table');
      const head = Array.from(table!.querySelectorAll('thead th')).map((cell) =>
        cell.textContent?.trim()
      );
      const rows = Array.from(table!.querySelectorAll('tbody tr'));

      expect(head[0]).toBe('Country');
      // 14 years, plus the country column.
      expect(head.length).toBe(15);
      expect(rows.length).toBe(2);
      expect(rows[0]!.querySelector('th')?.textContent?.trim()).toBe('NAM');
      expect(rows[0]!.querySelectorAll('td').length).toBe(14);
    });

    it('marks a forecast cell in the hidden table, since the dashing is not readable', () => {
      const cells = Array.from(
        charts()[0]!.querySelectorAll('.sr-only tbody tr:first-child td')
      ).map((cell) => cell.textContent?.replace(/\s+/g, ' ').trim());

      expect(cells.some((cell) => cell?.endsWith(', forecast'))).toBeTrue();
      expect(cells.some((cell) => cell?.endsWith('Percent'))).toBeTrue();
    });

    it('keeps the drawing itself out of the accessible tree', () => {
      expect(charts()[0]!.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    });

    it('plots a point per year per country', () => {
      // 14 years, two countries.
      expect(points(charts()[0]!).length).toBe(28);
    });

    it('bands and rules the forecast side of the boundary', () => {
      const first = charts()[0];

      expect(first?.querySelector('rect.forecast-band')).not.toBeNull();
      expect(first?.querySelector('line.boundary')).not.toBeNull();
      expect(first?.querySelector('.boundary-label')?.textContent?.trim()).toBe('FORECAST');
    });

    it('hides the drawing from screen readers and states it as text', () => {
      const first = charts()[0];

      expect(first?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
      expect(first?.querySelector('.sr-only')?.textContent).toContain('actual through 2025');
    });

    it('lists every series on the page in the metadata table', () => {
      const rows = metaRows();

      expect(rows.length).toBe(4);
      expect(rows[0]).toEqual([
        'CPI_INFLATION_AVG',
        'NAM — Namibia',
        'Percent',
        'IMF_WEO',
        'WEO 10.0.0 2026-04-14',
        '2025',
        '2018 to 2031'
      ]);
    });

    it('explains the split once, under the metadata table', () => {
      const feet = el().querySelectorAll('.series-meta .card-foot');

      expect(feet.length).toBe(1);
      expect(feet[0]?.textContent).toContain('lastActualYear');
    });
  });

  describe('when the boundary falls outside the window', () => {
    it('omits the band for a forecast-only range but still states the year', () => {
      setUp();
      seedDesignQuery();
      store.setYearRange(2027, 2031);
      fixture.detectChanges();

      const first = charts()[0];

      // Five years, two countries.
      expect(points(first!).length).toBe(10);
      // Every year is a forecast, so the band is the whole plot and a rule
      // against the frame would read as the edge of the data.
      expect(first?.querySelector('line.boundary')).toBeNull();
      expect(first?.querySelector('rect.forecast-band')?.getAttribute('width')).toBe('692');
      expect(metaRows()[0]?.[5]).toBe('2025');
    });

    it('omits the band for a history-only range too', () => {
      setUp();
      seedDesignQuery();
      store.setYearRange(2018, 2024);
      fixture.detectChanges();

      const first = charts()[0];

      expect(first?.querySelector('line.boundary')).toBeNull();
      expect(first?.querySelector('rect.forecast-band')).toBeNull();
      expect(first?.querySelectorAll('path[stroke-dasharray]').length).toBe(0);
      expect(metaRows()[0]?.[5]).toBe('2025');
    });
  });

  describe('paging', () => {
    const strip = () =>
      el().querySelector('.series-paging .paging-state')?.textContent?.replace(/\s+/g, ' ').trim();
    const buttons = () =>
      Array.from(el().querySelectorAll<HTMLButtonElement>('.series-paging button'));

    it('pages series rather than rows', () => {
      setUp();
      seedDesignQuery();
      store.setPage(1);
      fixture.detectChanges();

      // pageSize is 25 and there are only 4 series, so it is a single page.
      expect(strip()).toBe('Page 1 of 1 · pageSize 25 · vintages WEO 10.0.0 2026-04-14');
      expect(buttons().every((button) => button.disabled)).toBeTrue();
    });

    it('reports no vintages and one empty page for a coverage gap', () => {
      setUp();
      store.addIndicator('REER_INDEX');
      store.addCountry('NAM');
      fixture.detectChanges();

      expect(strip()).toBe('Page 1 of 1 · pageSize 25 · vintages —');
      expect(buttons().every((button) => button.disabled)).toBeTrue();
    });
  });

  describe('with a valid query the sources do not report', () => {
    beforeEach(() => {
      setUp();
      store.addIndicator('REER_INDEX');
      store.addCountry('NAM');
      fixture.detectChanges();
    });

    it('says the query was valid rather than reporting a failure', () => {
      expect(headMeta()?.textContent?.trim()).toBe(
        'No series — the query was valid, the source just does not report this combination'
      );
      expect(headMeta()?.getAttribute('role')).toBe('status');
      expect(charts().length).toBe(0);
    });
  });

  describe('with an invalid query', () => {
    let provider: CountingProvider;

    beforeEach(() => {
      provider = new CountingProvider();
      setUp(provider);
      fixture.detectChanges();
    });

    it('issues no request at all', () => {
      expect(store.validation().valid).toBeFalse();
      expect(provider.calls).toBe(0);
    });

    it('points the user back at the query', () => {
      expect(headMeta()?.textContent?.trim()).toBe('Fix the query above to see series.');
      expect(headMeta()?.getAttribute('role')).toBe('status');
      expect(charts().length).toBe(0);
    });
  });

  describe('when the series route fails', () => {
    beforeEach(() => {
      setUp(new FailingSeries());
      seedDesignQuery();
      fixture.detectChanges();
    });

    it('reports the route as unavailable', () => {
      expect(headMeta()?.textContent?.trim()).toBe('Series are unavailable.');
      expect(headMeta()?.getAttribute('role')).toBe('status');
      expect(charts().length).toBe(0);
    });
  });
});

describe('SeriesPage query summary', () => {
  let fixture: ComponentFixture<SeriesPage>;
  let store: WorkingQueryStore;

  const summary = () =>
    (fixture.nativeElement as HTMLElement)
      .querySelector('app-working-query-card .card-head .meta')
      ?.textContent?.replace(/\s+/g, ' ')
      .trim();

  function setUp(): void {
    TestBed.configureTestingModule({
      imports: [SeriesPage],
      providers: [provideRouter([]), { provide: MACRO_DATA, useClass: FixtureMacroDataProvider }]
    });

    store = TestBed.inject(WorkingQueryStore);
    store.reset();
    fixture = TestBed.createComponent(SeriesPage);
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('counts series, not rows', () => {
    setUp();
    store.addIndicator('GDP_GROWTH_REAL');
    store.addIndicator('CPI_INFLATION_AVG');
    store.addCountry('ZAF');
    store.addCountry('NAM');
    store.setYearRange(2018, 2031);
    fixture.detectChanges();

    // The same query reads "56 observations" on the Observations tab.
    expect(summary()).toBe('2 indicators × 2 countries · 2018–2031 · 4 series');
  });

  it('uses the same word for one series, which is why the card owns no noun', () => {
    setUp();
    store.addIndicator('GDP_GROWTH_REAL');
    store.addCountry('ZAF');
    fixture.detectChanges();

    expect(summary()).toBe('1 indicator × 1 country · 1 series');
  });

  it('says zero series for a valid query with no data', () => {
    setUp();
    store.addIndicator('REER_INDEX');
    store.addCountry('NAM');
    fixture.detectChanges();

    expect(summary()).toBe('1 indicator × 1 country · 0 series');
  });

  it('omits the phrase entirely for an invalid query', () => {
    setUp();
    fixture.detectChanges();

    expect(summary()).toBe('0 indicators × 0 countries');
  });
});

/** Feature 8: the service's own explanation reaches the series head. */
describe('SeriesPage when the service explains the failure', () => {
  class ExplainingSeries extends FixtureMacroDataProvider {
    override series(): Observable<Envelope<Series>> {
      return throwError(() => new MacroRequestError(400, 'Unknown indicator code(s): NOPE.'));
    }
  }

  class SilentSeries extends FixtureMacroDataProvider {
    override series(): Observable<Envelope<Series>> {
      return throwError(() => new MacroRequestError(500, null));
    }
  }

  function headMetaFor(provider: FixtureMacroDataProvider): Element | null {
    TestBed.configureTestingModule({
      imports: [SeriesPage],
      providers: [provideRouter([]), { provide: MACRO_DATA, useValue: provider }]
    });
    const store = TestBed.inject(WorkingQueryStore);
    store.reset();
    // A sendable query, or the page reports `invalid` and never reaches the
    // request at all.
    store.addIndicator('GDP_GROWTH_REAL');
    store.addCountry('ZAF');
    const fixture = TestBed.createComponent(SeriesPage);
    fixture.detectChanges();

    return (fixture.nativeElement as HTMLElement).querySelector('.series-head .card-head .meta');
  }

  afterEach(() => TestBed.resetTestingModule());

  it('shows the problem detail instead of the generic wording', () => {
    const element = headMetaFor(new ExplainingSeries());

    expect(element?.textContent?.trim()).toBe('Unknown indicator code(s): NOPE.');
    expect(element?.getAttribute('role')).toBe('status');
  });

  it('falls back to the generic wording when the error carries no detail', () => {
    const element = headMetaFor(new SilentSeries());

    expect(element?.textContent?.trim()).toBe('Series are unavailable.');
    expect(element?.getAttribute('role')).toBe('status');
  });
});

/**
 * Feature 8 (F-11): `loading` must track the in-flight request, not only the
 * first one.
 *
 * This needs an asynchronous double. Under `FixtureMacroDataProvider` the
 * window is zero, because `of()` resolves synchronously, which is exactly why
 * no earlier spec caught it and why the header could keep asserting a previous
 * result for a whole round trip once requests became real.
 */
describe('SeriesPage loading state across a re-query', () => {
  class DeferredProvider extends FixtureMacroDataProvider {
    /** Resolves the pending request with the fixture answer. */
    release: (() => void) | null = null;
    calls = 0;

    override series(
      ...args: Parameters<MacroDataProvider['series']>
    ): Observable<Envelope<Series>> {
      this.calls += 1;
      const answer = super.series(...args);

      return new Observable<Envelope<Series>>((subscriber) => {
        this.release = () => {
          answer.subscribe((value) => {
            subscriber.next(value);
            subscriber.complete();
          });
        };
      });
    }
  }

  let fixture: ComponentFixture<SeriesPage>;
  let store: WorkingQueryStore;
  let provider: DeferredProvider;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SeriesPage],
      providers: [provideRouter([]), { provide: MACRO_DATA, useValue: (provider = new DeferredProvider()) }]
    });

    store = TestBed.inject(WorkingQueryStore);
    store.reset();
    store.addIndicator('GDP_GROWTH_REAL');
    store.addCountry('ZAF');
    fixture = TestBed.createComponent(SeriesPage);
  });

  afterEach(() => TestBed.resetTestingModule());

  const head = () =>
    (fixture.nativeElement as HTMLElement)
      .querySelector('.series-head .card-head .meta')
      ?.textContent?.trim() ?? '';

  it('reports loading while the first request is in flight', () => {
    fixture.detectChanges();

    expect(head()).toBe('Loading series…');
  });

  it('returns to loading on a re-query instead of holding the previous result', () => {
    fixture.detectChanges();
    provider.release?.();
    fixture.detectChanges();

    // The first answer has landed.
    const settled = head();
    expect(settled).not.toBe('Loading series…');
    expect(provider.calls).toBe(1);

    // A paging click issues a second request. Before F-11 the head kept
    // asserting `settled`, describing a query that was no longer on screen.
    store.setPage(2);
    fixture.detectChanges();

    expect(provider.calls).toBe(2);
    expect(head()).toBe('Loading series…');
  });


  const strip = () =>
    (fixture.nativeElement as HTMLElement)
      .querySelector('.paging-state')
      ?.textContent?.replace(/\s+/g, ' ')
      .trim() ?? '';

  const prevButton = () =>
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      'button[aria-label="Previous page"]'
    );

  it('keeps reporting the asked-for page and a real count while a re-query is in flight', () => {
    // F-13: `page` fell back to a literal 1 and `pageCount` collapsed to 1
    // whenever no result was settled, so a click from page 1 to page 2 made the
    // footer read "Page 1 of 1" with both controls disabled for the whole round
    // trip, then snap to the truth. It stated a page that was never asked for
    // and a count that was never true.
    fixture.detectChanges();
    provider.release?.();
    fixture.detectChanges();

    expect(strip()).toContain('Page 1 of');

    store.setPage(2);
    fixture.detectChanges();

    // The page the user asked for, not a literal 1.
    expect(strip()).toContain('Page 2 of');
  });

  // F-17: the page *count* is deliberately not asserted on this tab. The
  // fixtures group into 4 series, well under one page of 25, so the settled
  // count is 1 and `toContain('of 1')` is also what the collapsed, defective
  // footer produces: the assertion could not fail. The count is covered
  // directly in `core/result-state.spec.ts`, which drives the shared machine
  // with a 61-row answer, and on the observations tab, which has 56 rows.
  // Leaving a passing assertion here would have read as coverage it never
  // provided.


  it('leaves Prev reachable while a re-query is in flight', () => {
    // Both controls were disabled by accident: PagingFooter derives them from
    // page and pageCount, and both had collapsed to 1.
    fixture.detectChanges();
    provider.release?.();
    fixture.detectChanges();

    store.setPage(2);
    fixture.detectChanges();

    expect(prevButton()?.disabled).toBeFalse();
  });

  it('shows no charts while a re-query is in flight', () => {
    fixture.detectChanges();
    provider.release?.();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('app-series-chart').length).toBeGreaterThan(0);

    store.setPage(2);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelectorAll('app-series-chart').length).toBe(0);
  });
});
