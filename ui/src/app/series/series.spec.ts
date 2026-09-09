import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, throwError } from 'rxjs';

import { FixtureMacroDataProvider } from '../core/fixtures/fixture-macro-data.provider';
import type { Envelope, Series } from '../core/macro-contracts';
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
      providers: [{ provide: MACRO_DATA, useValue: provider }]
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
  const cards = () => Array.from(el().querySelectorAll('.series-card'));
  const facts = (card: Element) =>
    Array.from(card.querySelectorAll('.series-sub .item')).map((item) => ({
      key: item.querySelector('.k')?.textContent?.trim(),
      value: item.querySelector('.v')?.textContent?.trim()
    }));
  const points = (card: Element) => Array.from(card.querySelectorAll('.point'));
  const cells = (card: Element) =>
    Array.from(card.querySelectorAll('.points > *')).map((node) =>
      node.classList.contains('boundary')
        ? 'BOUNDARY'
        : (node.querySelector('.year')?.textContent?.trim() ?? '')
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

    it('renders one card per series and says paging counts series', () => {
      expect(cards().length).toBe(4);
      expect(headMeta()?.textContent?.trim()).toBe(
        '4 series · pagination counts series, not rows'
      );
    });

    it('titles each card with the code and the catalogue name', () => {
      const first = cards()[0];

      expect(first?.querySelector('.series-title .code')?.textContent?.trim()).toBe(
        'CPI_INFLATION_AVG'
      );
      expect(first?.querySelector('.series-title .name')?.textContent?.trim()).toBe(
        'Inflation, average CPI'
      );
      expect(first?.querySelector('.card-head .meta')?.textContent?.trim()).toBe('series 1 of 4');
    });

    it('states the five sub-strip facts, with the vintage label not its id', () => {
      const first = cards()[0];

      expect(facts(first!)).toEqual([
        { key: 'Country', value: 'NAM' },
        { key: 'Unit', value: 'Percent' },
        { key: 'Source', value: 'IMF_WEO' },
        { key: 'Vintage', value: 'WEO 10.0.0 2026-04-14' },
        { key: 'lastActualYear', value: '2025' }
      ]);
    });

    it('renders a point per year, tinted by isForecast', () => {
      const first = cards()[0];
      const rendered = points(first!);

      expect(rendered.length).toBe(14);

      for (const point of rendered) {
        const year = Number(point.querySelector('.year')?.textContent?.trim());
        const forecast = point.classList.contains('forecast');

        expect(forecast).toBe(year > 2025);
        expect(point.classList.contains('actual')).toBe(!forecast);
      }
    });

    it('formats point values to one decimal place', () => {
      const values = points(cards()[0]!).map(
        (point) => point.querySelector('.val')?.textContent?.trim() ?? ''
      );

      expect(values.every((value) => /^-?[\d,]+\.\d$/.test(value))).toBeTrue();
    });

    it('draws the boundary between 2025 and 2026', () => {
      const rendered = cells(cards()[0]!);
      const boundary = rendered.indexOf('BOUNDARY');

      expect(boundary).toBeGreaterThan(0);
      expect(rendered[boundary - 1]).toBe('2025');
      expect(rendered[boundary + 1]).toBe('2026');
    });

    it('hides the boundary rule from screen readers and states it as text', () => {
      const first = cards()[0];

      expect(first?.querySelector('.boundary')?.getAttribute('aria-hidden')).toBe('true');
      expect(first?.querySelector('.sr-only')?.textContent).toContain('actual through 2025');
    });

    it('names each card and describes it for screen readers', () => {
      const first = cards()[0];

      expect(first?.tagName).toBe('SECTION');
      expect(first?.getAttribute('aria-label')).toBe('CPI_INFLATION_AVG NAM');
      expect(first?.querySelector('.sr-only')?.textContent?.trim()).toBe(
        'Inflation, average CPI for NAM, Percent, 2018 to 2031, actual through 2025.'
      );
    });

    it('explains the split once, under the last card', () => {
      const feet = cards().map((card) => card.querySelector('.card-foot'));

      expect(feet[0]).toBeNull();
      expect(feet[3]).not.toBeNull();
      expect(feet[3]?.textContent).toContain('lastActualYear');
    });
  });

  describe('when the boundary falls outside the window', () => {
    it('omits the rule for a forecast-only range but still states the year', () => {
      setUp();
      seedDesignQuery();
      store.setYearRange(2027, 2031);
      fixture.detectChanges();

      const first = cards()[0];

      expect(points(first!).length).toBe(5);
      expect(cells(first!)).not.toContain('BOUNDARY');
      expect(points(first!).every((point) => point.classList.contains('forecast'))).toBeTrue();
      expect(facts(first!).at(-1)).toEqual({ key: 'lastActualYear', value: '2025' });
    });

    it('omits the rule for a history-only range too', () => {
      setUp();
      seedDesignQuery();
      store.setYearRange(2018, 2024);
      fixture.detectChanges();

      const first = cards()[0];

      expect(cells(first!)).not.toContain('BOUNDARY');
      expect(points(first!).every((point) => point.classList.contains('actual'))).toBeTrue();
      expect(facts(first!).at(-1)).toEqual({ key: 'lastActualYear', value: '2025' });
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
      expect(cards().length).toBe(0);
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
      expect(cards().length).toBe(0);
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
      expect(cards().length).toBe(0);
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
      providers: [{ provide: MACRO_DATA, useClass: FixtureMacroDataProvider }]
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
