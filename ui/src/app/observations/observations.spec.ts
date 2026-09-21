import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, throwError } from 'rxjs';

import { FixtureMacroDataProvider } from '../core/fixtures/fixture-macro-data.provider';
import type { Envelope, Observation } from '../core/macro-contracts';
import { MacroRequestError } from '../core/http/macro-error';
import { MACRO_DATA, type MacroDataProvider } from '../core/macro-data.provider';
import { WorkingQueryStore } from '../core/working-query.store';
import { ObservationsPage } from './observations';

/** A provider whose observations route fails; everything else still works. */
class FailingObservations extends FixtureMacroDataProvider {
  override observations(): Observable<Envelope<Observation>> {
    return throwError(() => new Error('observations unavailable'));
  }
}

/** Records what it was asked for, so "no request issued" can be asserted. */
class CountingProvider extends FixtureMacroDataProvider {
  calls = 0;

  override observations(
    ...args: Parameters<MacroDataProvider['observations']>
  ): Observable<Envelope<Observation>> {
    this.calls += 1;
    return super.observations(...args);
  }
}

describe('ObservationsPage', () => {
  let fixture: ComponentFixture<ObservationsPage>;
  let store: WorkingQueryStore;

  /** The design's query: 2 indicators over 2 countries and 2018-2031. */
  function seedDesignQuery(): void {
    store.addIndicator('GDP_GROWTH_REAL');
    store.addIndicator('CPI_INFLATION_AVG');
    store.addCountry('ZAF');
    store.addCountry('NAM');
    store.setYearRange(2018, 2031);
  }

  function setUp(provider: unknown = new FixtureMacroDataProvider()): void {
    TestBed.configureTestingModule({
      imports: [ObservationsPage],
      providers: [provideRouter([]), { provide: MACRO_DATA, useValue: provider }]
    });

    store = TestBed.inject(WorkingQueryStore);
    store.reset();
    fixture = TestBed.createComponent(ObservationsPage);
  }

  const el = () => fixture.nativeElement as HTMLElement;
  const headMeta = () => el().querySelector('.observations .card-head .meta');
  const bodyRows = () => Array.from(el().querySelectorAll('.observations tbody tr'));
  const headers = () =>
    Array.from(el().querySelectorAll('.observations thead th')).map((th) =>
      th.textContent?.trim()
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

    it('renders the seven columns the design specifies, in order', () => {
      expect(headers()).toEqual([
        'Indicator',
        'Country',
        'Year',
        'Value',
        'isForecast',
        'Source',
        'vintageId'
      ]);
    });

    it('renders one page of rows and reports the range from meta', () => {
      expect(bodyRows().length).toBe(25);
      expect(headMeta()?.textContent?.trim()).toBe('Rows 1–25 of 56');
    });

    it('renders the design first row: CPI_INFLATION_AVG, NAM, 2018', () => {
      const cells = Array.from(bodyRows()[0]?.querySelectorAll('td') ?? []).map((td) =>
        td.textContent?.trim()
      );

      expect(cells[0]).toBe('CPI_INFLATION_AVG');
      expect(cells[1]).toBe('NAM');
      expect(cells[2]).toBe('2018');
      expect(cells[4]).toBe('Actual');
      expect(cells[5]).toBe('IMF_WEO');
      expect(cells[6]).toBe('14');
    });

    it('formats every value to one decimal place', () => {
      const values = bodyRows().map(
        (row) => row.querySelectorAll('td')[3]?.textContent?.trim() ?? ''
      );

      expect(values.length).toBe(25);
      expect(values.every((value) => /^-?[\d,]+\.\d$/.test(value))).toBeTrue();
    });

    it('badges history as Actual and the forecast horizon as Forecast', () => {
      const badges = bodyRows().map((row) => row.querySelector('.badge'));
      const actual = badges.filter((badge) => badge?.classList.contains('actual'));
      const forecast = badges.filter((badge) => badge?.classList.contains('forecast'));

      expect(actual.length).toBeGreaterThan(0);
      expect(forecast.length).toBeGreaterThan(0);
      expect(actual[0]?.textContent?.trim()).toBe('Actual');
      expect(forecast[0]?.textContent?.trim()).toBe('Forecast');
    });

    it('marks 2026 onward as forecast, matching the latest WEO vintage', () => {
      for (const row of bodyRows()) {
        const cells = row.querySelectorAll('td');
        const year = Number(cells[2]?.textContent?.trim());
        const badge = cells[4]?.textContent?.trim();

        expect(badge).toBe(year > 2025 ? 'Forecast' : 'Actual');
      }
    });

    it('renders the indicator code as text, not as a control', () => {
      const cell = bodyRows()[0]?.querySelectorAll('td')[0];

      expect(cell?.querySelector('.code-text')).not.toBeNull();
      expect(cell?.querySelector('button')).toBeNull();
    });

    it('names the table for screen readers', () => {
      const caption = el().querySelector('.observations caption');

      expect(caption?.classList.contains('sr-only')).toBeTrue();
      expect(caption?.textContent?.trim().length).toBeGreaterThan(0);
    });
  });

  describe('with a valid query the sources do not report', () => {
    beforeEach(() => {
      setUp();
      // Both codes are real; the pair simply has no data. That is a 200 with
      // empty data, which is the whole point of "absence, not nulls".
      store.addIndicator('REER_INDEX');
      store.addCountry('NAM');
      fixture.detectChanges();
    });

    it('says the query was valid rather than reporting a failure', () => {
      expect(headMeta()?.textContent?.trim()).toBe(
        'No rows — the query was valid, the source just does not report this combination'
      );
      expect(headMeta()?.getAttribute('role')).toBe('status');
    });

    it('keeps the header row and renders no body rows', () => {
      expect(headers().length).toBe(7);
      expect(bodyRows().length).toBe(0);
    });
  });

  describe('with an invalid query', () => {
    let provider: CountingProvider;

    beforeEach(() => {
      provider = new CountingProvider();
      setUp(provider);
      // No indicators: the store already reports this as a problem, and the
      // real service would answer 400.
      fixture.detectChanges();
    });

    it('issues no request at all', () => {
      expect(store.validation().valid).toBeFalse();
      expect(provider.calls).toBe(0);
    });

    it('points the user back at the query instead of blaming the data', () => {
      expect(headMeta()?.textContent?.trim()).toBe('Fix the query above to see rows.');
      expect(headMeta()?.getAttribute('role')).toBe('status');
    });

    it('keeps the header row so the shape of the answer stays visible', () => {
      expect(headers().length).toBe(7);
      expect(bodyRows().length).toBe(0);
    });
  });

  describe('when the observations route fails', () => {
    beforeEach(() => {
      setUp(new FailingObservations());
      seedDesignQuery();
      fixture.detectChanges();
    });

    it('reports the route as unavailable', () => {
      expect(headMeta()?.textContent?.trim()).toBe('Observations are unavailable.');
      expect(headMeta()?.getAttribute('role')).toBe('status');
      expect(bodyRows().length).toBe(0);
    });
  });
});

describe('ObservationsPage paging', () => {
  let fixture: ComponentFixture<ObservationsPage>;
  let store: WorkingQueryStore;

  const el = () => fixture.nativeElement as HTMLElement;
  const footer = () => el().querySelector('.observations .card-foot .paging-state');
  const buttons = () =>
    Array.from(
      el().querySelectorAll<HTMLButtonElement>('.observations .paging-controls button')
    );
  const prev = () => buttons()[0];
  const next = () => buttons()[1];
  const bodyRows = () => Array.from(el().querySelectorAll('.observations tbody tr'));
  const firstCell = () => bodyRows()[0]?.querySelectorAll('td')[2]?.textContent?.trim();

  /** Collapses the template's wrapped whitespace so the strip can be compared. */
  const strip = () => footer()?.textContent?.replace(/\s+/g, ' ').trim();

  function setUp(provider: unknown = new FixtureMacroDataProvider()): void {
    TestBed.configureTestingModule({
      imports: [ObservationsPage],
      providers: [provideRouter([]), { provide: MACRO_DATA, useValue: provider }]
    });

    store = TestBed.inject(WorkingQueryStore);
    store.reset();
    fixture = TestBed.createComponent(ObservationsPage);
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  describe('across a 56-row, three-page result', () => {
    beforeEach(() => {
      setUp();
      store.addIndicator('GDP_GROWTH_REAL');
      store.addIndicator('CPI_INFLATION_AVG');
      store.addCountry('ZAF');
      store.addCountry('NAM');
      store.setYearRange(2018, 2031);
      fixture.detectChanges();
    });

    it('names the page, the page size and the vintages behind the values', () => {
      expect(strip()).toBe('Page 1 of 3 · pageSize 25 · vintages WEO 10.0.0 2026-04-14');
    });

    it('offers real buttons with accessible labels', () => {
      expect(buttons().length).toBe(2);
      expect(buttons().every((button) => button.tagName === 'BUTTON')).toBeTrue();
      expect(buttons().every((button) => button.type === 'button')).toBeTrue();
      expect(prev()?.getAttribute('aria-label')).toBe('Previous page');
      expect(next()?.getAttribute('aria-label')).toBe('Next page');
    });

    it('disables Prev on the first page', () => {
      expect(prev()?.disabled).toBeTrue();
      expect(next()?.disabled).toBeFalse();
    });

    it('advances to the second page and renders its rows', () => {
      next()?.click();
      fixture.detectChanges();

      expect(store.query().page).toBe(2);
      expect(strip()).toBe('Page 2 of 3 · pageSize 25 · vintages WEO 10.0.0 2026-04-14');
      expect(bodyRows().length).toBe(25);
      expect(prev()?.disabled).toBeFalse();

      // Rows 26-50 of the design query: CPI for ZAF picks up at 2029.
      expect(firstCell()).toBe('2029');
    });

    it('disables Next on the last page, which is short', () => {
      next()?.click();
      fixture.detectChanges();
      next()?.click();
      fixture.detectChanges();

      expect(strip()).toBe('Page 3 of 3 · pageSize 25 · vintages WEO 10.0.0 2026-04-14');
      expect(bodyRows().length).toBe(6);
      expect(next()?.disabled).toBeTrue();
      expect(prev()?.disabled).toBeFalse();
    });

    it('steps back with Prev', () => {
      next()?.click();
      fixture.detectChanges();
      prev()?.click();
      fixture.detectChanges();

      expect(store.query().page).toBe(1);
      expect(strip()).toBe('Page 1 of 3 · pageSize 25 · vintages WEO 10.0.0 2026-04-14');
    });

    it('returns to page 1 when a filter narrows the query', () => {
      next()?.click();
      fixture.detectChanges();
      expect(store.query().page).toBe(2);

      store.setYearRange(2018, 2020);
      fixture.detectChanges();

      expect(store.query().page).toBe(1);
      expect(strip()).toBe('Page 1 of 1 · pageSize 25 · vintages WEO 10.0.0 2026-04-14');
    });
  });

  it('reports one empty page and no vintages for a valid query with no data', () => {
    setUp();
    store.addIndicator('REER_INDEX');
    store.addCountry('NAM');
    fixture.detectChanges();

    expect(strip()).toBe('Page 1 of 1 · pageSize 25 · vintages —');
    expect(prev()?.disabled).toBeTrue();
    expect(next()?.disabled).toBeTrue();
  });

  it('disables both controls for an invalid query', () => {
    setUp();
    fixture.detectChanges();

    expect(strip()).toBe('Page 1 of 1 · pageSize 25 · vintages —');
    expect(prev()?.disabled).toBeTrue();
    expect(next()?.disabled).toBeTrue();
  });

  it('disables both controls when the route is unavailable', () => {
    setUp(new FailingObservations());
    store.addIndicator('GDP_GROWTH_REAL');
    fixture.detectChanges();

    expect(strip()).toBe('Page 1 of 1 · pageSize 25 · vintages —');
    expect(prev()?.disabled).toBeTrue();
    expect(next()?.disabled).toBeTrue();
  });
});

describe('ObservationsPage query summary', () => {
  let fixture: ComponentFixture<ObservationsPage>;
  let store: WorkingQueryStore;

  const summary = () =>
    (fixture.nativeElement as HTMLElement)
      .querySelector('app-working-query-card .card-head .meta')
      ?.textContent?.replace(/\s+/g, ' ')
      .trim();

  function setUp(provider: unknown = new FixtureMacroDataProvider()): void {
    TestBed.configureTestingModule({
      imports: [ObservationsPage],
      providers: [provideRouter([]), { provide: MACRO_DATA, useValue: provider }]
    });

    store = TestBed.inject(WorkingQueryStore);
    store.reset();
    fixture = TestBed.createComponent(ObservationsPage);
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('appends the observation count from meta, not from the rendered page', () => {
    setUp();
    store.addIndicator('GDP_GROWTH_REAL');
    store.addIndicator('CPI_INFLATION_AVG');
    store.addCountry('ZAF');
    store.addCountry('NAM');
    store.setYearRange(2018, 2031);
    fixture.detectChanges();

    // 25 rows are on screen; the count is the whole 56-row result.
    expect(summary()).toBe('2 indicators × 2 countries · 2018–2031 · 56 observations');
  });

  it('uses the singular for a one-row result', () => {
    setUp();
    store.addIndicator('GDP_GROWTH_REAL');
    store.addCountry('ZAF');
    store.setYearRange(2020, 2020);
    fixture.detectChanges();

    expect(summary()).toBe('1 indicator × 1 country · 2020–2020 · 1 observation');
  });

  it('says zero observations for a valid query with no data', () => {
    setUp();
    store.addIndicator('REER_INDEX');
    store.addCountry('NAM');
    fixture.detectChanges();

    expect(summary()).toBe('1 indicator × 1 country · 0 observations');
  });

  it('omits the count entirely for an invalid query', () => {
    setUp();
    fixture.detectChanges();

    expect(summary()).toBe('0 indicators × 0 countries');
  });
});

/** Feature 8: the service's own explanation reaches the observations head. */
describe('ObservationsPage when the service explains the failure', () => {
  class ExplainingObservations extends FixtureMacroDataProvider {
    override observations(): Observable<Envelope<Observation>> {
      return throwError(() => new MacroRequestError(400, 'Unknown indicator code(s): NOPE.'));
    }
  }

  class SilentObservations extends FixtureMacroDataProvider {
    override observations(): Observable<Envelope<Observation>> {
      return throwError(() => new MacroRequestError(500, null));
    }
  }

  function headMetaFor(provider: FixtureMacroDataProvider): Element | null {
    TestBed.configureTestingModule({
      imports: [ObservationsPage],
      providers: [provideRouter([]), { provide: MACRO_DATA, useValue: provider }]
    });
    const store = TestBed.inject(WorkingQueryStore);
    store.reset();
    // A sendable query, or the page reports `invalid` and never reaches the
    // request at all.
    store.addIndicator('GDP_GROWTH_REAL');
    store.addCountry('ZAF');
    const fixture = TestBed.createComponent(ObservationsPage);
    fixture.detectChanges();

    return (fixture.nativeElement as HTMLElement).querySelector('.observations .card-head .meta');
  }

  afterEach(() => TestBed.resetTestingModule());

  it('shows the problem detail instead of the generic wording', () => {
    const element = headMetaFor(new ExplainingObservations());

    expect(element?.textContent?.trim()).toBe('Unknown indicator code(s): NOPE.');
    expect(element?.getAttribute('role')).toBe('status');
  });

  it('falls back to the generic wording when the error carries no detail', () => {
    const element = headMetaFor(new SilentObservations());

    expect(element?.textContent?.trim()).toBe('Observations are unavailable.');
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
describe('ObservationsPage loading state across a re-query', () => {
  class DeferredProvider extends FixtureMacroDataProvider {
    /** Resolves the pending request with the fixture answer. */
    release: (() => void) | null = null;
    calls = 0;

    override observations(
      ...args: Parameters<MacroDataProvider['observations']>
    ): Observable<Envelope<Observation>> {
      this.calls += 1;
      const answer = super.observations(...args);

      return new Observable<Envelope<Observation>>((subscriber) => {
        this.release = () => {
          answer.subscribe((value) => {
            subscriber.next(value);
            subscriber.complete();
          });
        };
      });
    }
  }

  let fixture: ComponentFixture<ObservationsPage>;
  let store: WorkingQueryStore;
  let provider: DeferredProvider;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ObservationsPage],
      providers: [provideRouter([]), { provide: MACRO_DATA, useValue: (provider = new DeferredProvider()) }]
    });

    store = TestBed.inject(WorkingQueryStore);
    store.reset();
    // The design query: 56 rows at pageSize 25, so paging is real and a page
    // count of 1 would be a visible lie rather than a coincidence.
    store.addIndicator('GDP_GROWTH_REAL');
    store.addIndicator('CPI_INFLATION_AVG');
    store.addCountry('ZAF');
    store.addCountry('NAM');
    store.setYearRange(2018, 2031);
    fixture = TestBed.createComponent(ObservationsPage);
  });

  afterEach(() => TestBed.resetTestingModule());

  const head = () =>
    (fixture.nativeElement as HTMLElement)
      .querySelector('.observations .card-head .meta')
      ?.textContent?.trim() ?? '';

  it('reports loading while the first request is in flight', () => {
    fixture.detectChanges();

    expect(head()).toBe('Loading observations…');
  });

  it('returns to loading on a re-query instead of holding the previous result', () => {
    fixture.detectChanges();
    provider.release?.();
    fixture.detectChanges();

    // The first answer has landed.
    const settled = head();
    expect(settled).not.toBe('Loading observations…');
    expect(provider.calls).toBe(1);

    // A paging click issues a second request. Before F-11 the head kept
    // asserting `settled`, describing a query that was no longer on screen.
    store.setPage(2);
    fixture.detectChanges();

    expect(provider.calls).toBe(2);
    expect(head()).toBe('Loading observations…');
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

    const settled = strip();
    const settledCount = settled.replace(/^Page \d+ of (\d+).*$/, '$1');
    expect(settled).toContain('Page 1 of');
    expect(Number(settledCount)).toBeGreaterThan(1);

    store.setPage(2);
    fixture.detectChanges();

    const loading = strip();
    // The page the user asked for, not 1.
    expect(loading).toContain('Page 2 of');
    // The count last known to be real, not 1.
    expect(loading).toContain('of ' + settledCount);
    expect(loading).not.toContain('Page 1 of 1');
  });

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

  it('shows no rows while a re-query is in flight', () => {
    fixture.detectChanges();
    provider.release?.();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.observations tbody tr').length).toBeGreaterThan(0);

    store.setPage(2);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.observations tbody tr').length).toBe(0);
  });
});
