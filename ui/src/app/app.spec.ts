import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';

import { App } from './app';
import { MacroRequestError } from './core/http/macro-error';
import { routes } from './app.routes';
import { FixtureMacroDataProvider } from './core/fixtures/fixture-macro-data.provider';
import { FIXTURE_ATTRIBUTION } from './core/fixtures/macro-fixtures';
import type { Envelope, Vintage } from './core/macro-contracts';
import { MACRO_DATA, type MacroDataProvider } from './core/macro-data.provider';

/** Provider whose only job is to fail, so the shell's error path is observable. */
class FailingMacroDataProvider extends FixtureMacroDataProvider {
  override vintages(): Observable<Envelope<Vintage>> {
    return throwError(() => new Error('service unavailable'));
  }
}

function shell(fixture: ComponentFixture<App>): HTMLElement {
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('App shell', () => {
  describe('with the fixture provider', () => {
    let fixture: ComponentFixture<App>;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [App],
        providers: [
          provideRouter(routes),
          { provide: MACRO_DATA, useClass: FixtureMacroDataProvider }
        ]
      }).compileComponents();

      fixture = TestBed.createComponent(App);
    });

    it('creates the shell', () => {
      expect(fixture.componentInstance).toBeTruthy();
    });

    it('shows the latest vintage label for each source in the header strip', () => {
      const strip = shell(fixture).querySelector('.vintage-strip .value')?.textContent ?? '';

      expect(strip).toContain('WEO 10.0.0 2026-04-14');
      expect(strip).toContain('WDI 2026-03-27');
    });

    it('renders every attribution string as text in the footer', () => {
      const footer = shell(fixture).querySelector('.attribution');
      const lines = Array.from(footer?.querySelectorAll('div') ?? [])
        .map((line) => line.textContent?.trim() ?? '');

      for (const expected of FIXTURE_ATTRIBUTION) {
        expect(lines).toContain(expected);
      }
    });

    it('renders attribution as escaped text, never as markup', () => {
      const footer = shell(fixture).querySelector('.attribution') as HTMLElement;

      // WDI's CC BY 4.0 string is the licence notice; it must not be able to
      // inject markup if the upstream string ever contains any.
      expect(footer.innerHTML).not.toContain('<script');
      expect(footer.textContent).toContain('CC BY 4.0');
    });

    it('renders all seven tabs in display order', () => {
      const labels = Array.from(shell(fixture).querySelectorAll('.tabs a'))
        .map((tab) => tab.textContent?.trim() ?? '');

      expect(labels).toEqual([
        'Overview',
        'Countries & indicators',
        'Series',
        'Observations',
        'Vintages & revisions',
        'Saved queries & export',
        'Request builder'
      ]);
    });

    it('navigates to each placeholder tab and renders its page', async () => {
      const router = TestBed.inject(Router);

      // Overview, Observations, Countries & indicators, Series and Vintages
      // became real pages at features 2, 3, 4, 6 and 9 and are asserted
      // separately. These two remain placeholders.
      const cases: ReadonlyArray<readonly [string, string]> = [
        ['/saved-queries', 'Saved queries & export'],
        ['/request-builder', 'Request builder']
      ];

      for (const [path, heading] of cases) {
        await router.navigateByUrl(path);
        const main = shell(fixture).querySelector('.app-main');

        expect(router.url).toBe(path);
        expect(main?.querySelector('.page-title')?.textContent?.trim()).toBe(heading);
      }
    });

    it('renders the Vintages page in the outlet, no longer a placeholder', async () => {
      const router = TestBed.inject(Router);
      await router.navigateByUrl('/vintages');
      const main = shell(fixture).querySelector('.app-main');

      expect(router.url).toBe('/vintages');
      expect(main?.querySelector('.vintages h2')?.textContent?.trim()).toBe('Published vintages');
      expect(main?.querySelector('.page-title')).toBeNull();
    });

    it('renders the Overview page in the outlet', async () => {
      const router = TestBed.inject(Router);
      await router.navigateByUrl('/overview');

      const main = shell(fixture).querySelector('.app-main');

      expect(router.url).toBe('/overview');
      expect(main?.querySelector('app-overview')).toBeTruthy();
      expect(main?.querySelector('h1')?.textContent)
        .toContain('Annual macroeconomic data for every country');
    });

    it('renders the working query card on Observations', async () => {
      const router = TestBed.inject(Router);
      await router.navigateByUrl('/observations');

      const main = shell(fixture).querySelector('.app-main');

      expect(router.url).toBe('/observations');
      expect(main?.querySelector('app-working-query-card')).toBeTruthy();
      expect(main?.querySelector('.card-head h2')?.textContent?.trim()).toBe('Working query');
    });

    it('renders the catalogue on Countries & indicators', async () => {
      const router = TestBed.inject(Router);
      await router.navigateByUrl('/countries-indicators');

      const main = shell(fixture).querySelector('.app-main');

      expect(router.url).toBe('/countries-indicators');
      expect(main?.querySelector('app-countries-indicators')).toBeTruthy();
      expect(
        Array.from(main?.querySelectorAll('.card-head h2') ?? []).map((h) => h.textContent?.trim())
      ).toEqual(['Countries', 'Indicator catalogue']);
    });

    it('renders the series view on Series', async () => {
      const router = TestBed.inject(Router);
      await router.navigateByUrl('/series');

      const main = shell(fixture).querySelector('.app-main');

      expect(router.url).toBe('/series');
      expect(main?.querySelector('app-series')).toBeTruthy();
      expect(
        Array.from(main?.querySelectorAll('.card-head h2') ?? []).map((h) => h.textContent?.trim())
      ).toEqual(['Working query', 'Series']);
    });

    it('marks the current tab active', async () => {
      const router = TestBed.inject(Router);
      await router.navigateByUrl('/vintages');

      // RouterLinkActive applies its class after the navigation microtask, so
      // let the fixture settle before reading the DOM.
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const active = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.tabs a.active'))
        .map((tab) => tab.textContent?.trim());

      expect(active).toEqual(['Vintages & revisions']);
    });

    it('redirects the empty path to Overview', async () => {
      const router = TestBed.inject(Router);
      await router.navigateByUrl('/');

      expect(router.url).toBe('/overview');
    });

    it('redirects an unknown path to Overview', async () => {
      const router = TestBed.inject(Router);
      await router.navigateByUrl('/not-a-tab');

      expect(router.url).toBe('/overview');
    });
  });

  describe('when the data service fails', () => {
    let fixture: ComponentFixture<App>;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [App],
        providers: [
          provideRouter(routes),
          { provide: MACRO_DATA, useClass: FailingMacroDataProvider }
        ]
      }).compileComponents();

      fixture = TestBed.createComponent(App);
    });

    it('shows the vintage strip as unavailable instead of breaking the shell', () => {
      const element = shell(fixture);
      const strip = element.querySelector('.vintage-strip .value');

      expect(strip?.textContent?.trim()).toBe('Unavailable');
      // F-10: the strip is an error slot like the other five, so it announces
      // itself. It was the only one without a role.
      expect(strip?.getAttribute('role')).toBe('status');
    });

    it('keeps navigation usable', async () => {
      const router = TestBed.inject(Router);
      await router.navigateByUrl('/observations');

      expect(router.url).toBe('/observations');
      expect(shell(fixture).querySelectorAll('.tabs a').length).toBe(7);
    });
  });

  it('injects the provider through the MACRO_DATA token, not a concrete class', async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes),
        { provide: MACRO_DATA, useClass: FixtureMacroDataProvider }
      ]
    }).compileComponents();

    const provider: MacroDataProvider = TestBed.inject(MACRO_DATA);

    expect(provider).toBeInstanceOf(FixtureMacroDataProvider);
  });
});

/**
 * Feature 8: the service's own explanation reaches the header strip.
 *
 * The no-detail fallback is already covered above by `FailingMacroDataProvider`,
 * which throws a plain `Error` and still renders "Unavailable".
 */
describe('App shell when the service explains the failure', () => {
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

  async function stripFor(provider: unknown): Promise<Element | null> {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes), { provide: MACRO_DATA, useValue: provider }]
    }).compileComponents();

    return shell(TestBed.createComponent(App)).querySelector('.vintage-strip .value');
  }

  it('shows the problem detail instead of the generic wording', async () => {
    const strip = await stripFor(new ExplainingProvider());

    expect(strip?.textContent?.trim()).toBe('Unknown indicator code(s): NOPE.');
  });

  it('falls back to the generic wording when the error carries no detail', async () => {
    const strip = await stripFor(new SilentProvider());

    expect(strip?.textContent?.trim()).toBe('Unavailable');
  });
});

/**
 * Feature 8 regression: the live `/vintages` route answers `meta.vintages: []`,
 * because that array reports the provenance of a result and this route's result
 * IS the vintage list. Reading `meta` here left the header strip blank against
 * the real service while every fixture-backed spec still passed.
 */
describe('App shell vintage strip against the live envelope shape', () => {
  class LiveShapeProvider extends FixtureMacroDataProvider {
    override vintages(): Observable<Envelope<Vintage>> {
      return of({
        data: [
          {
            id: 12,
            source: 'WB_WDI',
            label: 'WDI 2026-07-13 #11',
            sourceVersion: '2026-07-13',
            retrievedAtUtc: '2026-09-08T01:00:31.5083586',
            isLatest: true
          },
          {
            id: 11,
            source: 'WB_WDI',
            label: 'WDI 2026-07-13 #10',
            sourceVersion: '2026-07-13',
            retrievedAtUtc: '2026-09-07T01:00:31.5083586',
            isLatest: false
          },
          {
            id: 2,
            source: 'IMF_WEO',
            label: 'WEO 9.0.0 2026-07-31',
            sourceVersion: '9.0.0',
            retrievedAtUtc: '2026-08-01T01:00:31.5083586',
            isLatest: true
          }
        ],
        meta: {
          // Exactly as observed: nullable paging and an empty vintages array.
          page: null,
          pageSize: null,
          totalCount: 3,
          vintages: [],
          attribution: ['Source: IMF World Economic Outlook database']
        }
      } satisfies Envelope<Vintage>);
    }
  }

  it('lists the isLatest labels from data even though meta.vintages is empty', async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes), { provide: MACRO_DATA, useClass: LiveShapeProvider }]
    }).compileComponents();

    const strip = shell(TestBed.createComponent(App)).querySelector('.vintage-strip .value');
    const text = strip?.textContent?.trim() ?? '';

    expect(text).toContain('WDI 2026-07-13 #11');
    expect(text).toContain('WEO 9.0.0 2026-07-31');
    // Superseded vintages are not "latest".
    expect(text).not.toContain('#10');
  });

  it('still renders the attribution footer from meta', async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes), { provide: MACRO_DATA, useClass: LiveShapeProvider }]
    }).compileComponents();

    const footer = shell(TestBed.createComponent(App)).querySelector('.attribution');
    const lines = Array.from(footer?.querySelectorAll('div') ?? []).map(
      (line) => line.textContent?.trim() ?? ''
    );

    expect(lines).toContain('Source: IMF World Economic Outlook database');
  });
});
