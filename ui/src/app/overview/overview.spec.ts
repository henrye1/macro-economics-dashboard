import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';

import { routes } from '../app.routes';
import { FixtureMacroDataProvider } from '../core/fixtures/fixture-macro-data.provider';
import type {
  Country,
  Envelope,
  Indicator,
  IndicatorsQuery,
  Vintage
} from '../core/macro-contracts';
import { MacroRequestError } from '../core/http/macro-error';
import { MACRO_DATA } from '../core/macro-data.provider';
import { OverviewPage } from './overview';

/** Builds an envelope whose totalCount is deliberately unrelated to data.length. */
function envelopeWithTotal<T>(total: number): Envelope<T> {
  return {
    data: [],
    meta: {
      page: 1,
      pageSize: 500,
      totalCount: total,
      vintages: [],
      attribution: []
    }
  };
}

/**
 * Counts stub. Totals differ from both the fixtures (12, 13, 5) and the design,
 * so a hardcoded number cannot pass.
 */
class CountingProvider extends FixtureMacroDataProvider {
  indicatorsQuery: IndicatorsQuery | undefined;
  indicatorsCallCount = 0;

  constructor(
    private readonly totals = { countries: 7, indicators: 9, vintages: 4 }
  ) {
    super();
  }

  override countries(): Observable<Envelope<Country>> {
    return of(envelopeWithTotal<Country>(this.totals.countries));
  }

  override indicators(query?: IndicatorsQuery): Observable<Envelope<Indicator>> {
    this.indicatorsCallCount += 1;
    this.indicatorsQuery = query;
    return of(envelopeWithTotal<Indicator>(this.totals.indicators));
  }

  override vintages(): Observable<Envelope<Vintage>> {
    return of(envelopeWithTotal<Vintage>(this.totals.vintages));
  }
}

class NeverResolvingProvider extends FixtureMacroDataProvider {
  override countries(): Observable<Envelope<Country>> {
    return new Observable<Envelope<Country>>();
  }
}

class FailingProvider extends FixtureMacroDataProvider {
  override vintages(): Observable<Envelope<Vintage>> {
    return throwError(() => new Error('service unavailable'));
  }
}

function build(provider: FixtureMacroDataProvider): ComponentFixture<OverviewPage> {
  TestBed.configureTestingModule({
    imports: [OverviewPage],
    providers: [provideRouter(routes), { provide: MACRO_DATA, useValue: provider }]
  });

  const fixture = TestBed.createComponent(OverviewPage);
  fixture.detectChanges();
  return fixture;
}

function statValues(fixture: ComponentFixture<OverviewPage>): string[] {
  return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.stat dd'))
    .map((value) => value.textContent?.trim() ?? '');
}

function statLabels(fixture: ComponentFixture<OverviewPage>): string[] {
  return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.stat dt'))
    .map((label) => label.textContent?.trim() ?? '');
}

describe('OverviewPage', () => {
  afterEach(() => TestBed.resetTestingModule());

  describe('counts', () => {
    it('renders the totals the provider reports, not the design values', () => {
      const fixture = build(new CountingProvider());

      expect(statValues(fixture)).toEqual(['7', '9', '4']);
    });

    it('reads meta.totalCount rather than the length of the returned page', () => {
      // Every stub envelope has an empty `data` array, so a length-based count
      // would render three zeroes here.
      const fixture = build(new CountingProvider());

      expect(statValues(fixture)).not.toEqual(['0', '0', '0']);
    });

    it('labels each count', () => {
      const fixture = build(new CountingProvider());

      expect(statLabels(fixture)).toEqual([
        'Countries with data',
        'Curated indicators',
        'Published vintages'
      ]);
    });

    it('asks the indicators route for the curated set only', () => {
      const provider = new CountingProvider();
      build(provider);

      expect(provider.indicatorsCallCount).toBe(1);
      expect(provider.indicatorsQuery).toEqual({ curated: true });
    });

    it('renders a legitimate zero as 0', () => {
      const fixture = build(
        new CountingProvider({ countries: 0, indicators: 0, vintages: 0 })
      );

      expect(statValues(fixture)).toEqual(['0', '0', '0']);
    });

    it('matches the fixture counts with the real fixture provider', () => {
      const fixture = build(new FixtureMacroDataProvider());

      expect(statValues(fixture)).toEqual(['12', '13', '5']);
    });
  });

  describe('states', () => {
    it('marks the stat list busy and shows no numbers while loading', () => {
      const fixture = build(new NeverResolvingProvider());
      const element = fixture.nativeElement as HTMLElement;

      expect(element.querySelector('.stats')?.getAttribute('aria-busy')).toBe('true');
      expect(element.querySelectorAll('.pending').length).toBe(3);
      expect(statValues(fixture)).toEqual(['', '', '']);
    });

    it('shows one unavailable message when any of the three requests fails', () => {
      const fixture = build(new FailingProvider());
      const element = fixture.nativeElement as HTMLElement;

      expect(element.querySelector('.stats-unavailable')?.textContent?.trim())
        .toBe('Counts unavailable');
      expect(element.querySelector('.stats')).toBeNull();
    });

    it('keeps the rest of the page usable when the counts fail', () => {
      const fixture = build(new FailingProvider());
      const element = fixture.nativeElement as HTMLElement;

      expect(element.querySelector('h1')).toBeTruthy();
      expect(element.querySelectorAll('.use-cases .card').length).toBe(3);
      expect(element.querySelectorAll('.cadence-item').length).toBe(2);
    });
  });

  describe('content and navigation', () => {
    it('renders exactly one h1', () => {
      const fixture = build(new CountingProvider());

      expect((fixture.nativeElement as HTMLElement).querySelectorAll('h1').length).toBe(1);
    });

    it('points the three action links at the right routes', () => {
      const fixture = build(new CountingProvider());
      const hrefs = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLAnchorElement>('.action')
      ).map((link) => link.getAttribute('href'));

      expect(hrefs).toEqual(['/series', '/countries-indicators', '/vintages']);
    });

    it('hides the decorative icons from assistive technology', () => {
      const fixture = build(new CountingProvider());
      const icons = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('.use-cases h2 .ms-icon')
      );

      expect(icons.length).toBe(3);
      expect(icons.every((icon) => icon.getAttribute('aria-hidden') === 'true')).toBeTrue();
      // Material Symbols ligature names, not stand-in text glyphs.
      expect(icons.map((icon) => icon.textContent?.trim())).toEqual([
        'trending_up',
        'leaderboard',
        'history'
      ]);
    });

    it('names both sources in the cadence card', () => {
      const fixture = build(new CountingProvider());
      const codes = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('.cadence-item .source-code')
      ).map((code) => code.textContent?.trim());

      expect(codes).toEqual(['IMF_WEO', 'WB_WDI']);
    });

    it('uses no em dash in the rendered copy', () => {
      const fixture = build(new CountingProvider());

      expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('—');
    });
  });
});

/** Feature 8: the service's own explanation reaches the stats card. */
describe('OverviewPage when the service explains the failure', () => {
  class ExplainingProvider extends FixtureMacroDataProvider {
    override vintages(): Observable<Envelope<Vintage>> {
      return throwError(() => new MacroRequestError(400, 'Unknown indicator code(s): NOPE.'));
    }
  }

  class SilentProvider extends FixtureMacroDataProvider {
    override vintages(): Observable<Envelope<Vintage>> {
      return throwError(() => new MacroRequestError(500, null));
    }
  }

  function slot(provider: FixtureMacroDataProvider): Element | null {
    const fixture = build(provider);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector('.stats-unavailable');
  }

  it('shows the problem detail instead of the generic wording', () => {
    const element = slot(new ExplainingProvider());

    expect(element?.textContent?.trim()).toBe('Unknown indicator code(s): NOPE.');
    expect(element?.getAttribute('role')).toBe('status');
  });

  it('falls back to the generic wording when the error carries no detail', () => {
    expect(slot(new SilentProvider())?.textContent?.trim()).toBe('Counts unavailable');
  });
});
