import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';

import { App } from '../app';
import { routes } from '../app.routes';
import { MacroRequestError } from '../core/http/macro-error';
import { provideSignedInSession } from '../core/fixtures/signed-in-session';
import { FixtureMacroDataProvider } from '../core/fixtures/fixture-macro-data.provider';
import { FIXTURE_ATTRIBUTION } from '../core/fixtures/macro-fixtures';
import type { Envelope, Vintage } from '../core/macro-contracts';
import { MACRO_DATA, type MacroDataProvider } from '../core/macro-data.provider';

/**
 * The chrome is a routed parent, so every case here mounts the real root and
 * navigates. Rendering `ConsoleShell` directly would prove it draws but not
 * that the router ever reaches it, which is the half this feature changed.
 */

/** Provider whose only job is to fail, so the shell's error path is observable. */
class FailingMacroDataProvider extends FixtureMacroDataProvider {
  override vintages(): Observable<Envelope<Vintage>> {
    return throwError(() => new Error('service unavailable'));
  }
}

function rendered(fixture: ComponentFixture<App>): HTMLElement {
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

async function mount(provider: unknown, landing = '/overview'): Promise<ComponentFixture<App>> {
  await TestBed.configureTestingModule({
    imports: [App],
    providers: [
      provideRouter(routes),
      // The request builder reaches HttpClient directly, so the shell needs
      // it wherever a route can reach that page.
      provideHttpClient(),
      provideHttpClientTesting(),
      provideSignedInSession(),
      { provide: MACRO_DATA, useValue: provider }
    ]
  }).compileComponents();

  const fixture = TestBed.createComponent(App);
  await TestBed.inject(Router).navigateByUrl(landing);
  return fixture;
}

describe('Console shell', () => {
  describe('with the fixture provider', () => {
    let fixture: ComponentFixture<App>;

    beforeEach(async () => {
      fixture = await mount(new FixtureMacroDataProvider());
    });

    it('creates the shell', () => {
      expect(rendered(fixture).querySelector('app-console-shell')).toBeTruthy();
    });

    it('shows the latest vintage label for each source in the header strip', () => {
      const strip = rendered(fixture).querySelector('.vintage-strip .value')?.textContent ?? '';

      expect(strip).toContain('WEO 10.0.0 2026-04-14');
      expect(strip).toContain('WDI 2026-03-27');
    });

    it('renders every attribution string as text in the footer', () => {
      const footer = rendered(fixture).querySelector('.attribution');
      const lines = Array.from(footer?.querySelectorAll('div') ?? [])
        .map((line) => line.textContent?.trim() ?? '');

      for (const expected of FIXTURE_ATTRIBUTION) {
        expect(lines).toContain(expected);
      }
    });

    it('renders attribution as escaped text, never as markup', () => {
      const footer = rendered(fixture).querySelector('.attribution') as HTMLElement;

      // WDI's CC BY 4.0 string is the licence notice; it must not be able to
      // inject markup if the upstream string ever contains any.
      expect(footer.innerHTML).not.toContain('<script');
      expect(footer.textContent).toContain('CC BY 4.0');
    });

    it('renders all seven tabs in display order', () => {
      const labels = Array.from(rendered(fixture).querySelectorAll('.tabs a'))
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

    it('injects the provider through the MACRO_DATA token, not a concrete class', () => {
      const provider: MacroDataProvider = TestBed.inject(MACRO_DATA);

      expect(provider).toBeInstanceOf(FixtureMacroDataProvider);
    });
  });

  /**
   * The shell is the parent of all seven tabs, so the router constructs it once
   * and keeps it across navigation between them. Asserted as node identity
   * because that is the claim: a shell rebuilt per child would be a new element
   * and would refetch the strip on every tab click.
   *
   * Counting `vintages()` calls would not prove it. The working query card
   * reads the same route, so that number moves with which tabs were visited.
   */
  it('keeps one shell instance across tab navigation', async () => {
    const fixture = await mount(new FixtureMacroDataProvider());
    const first = rendered(fixture).querySelector('app-console-shell');

    const router = TestBed.inject(Router);
    for (const path of ['/series', '/observations', '/vintages', '/overview']) {
      await router.navigateByUrl(path);
      rendered(fixture);
    }

    expect(first).toBeTruthy();
    expect(rendered(fixture).querySelector('app-console-shell')).toBe(first);
    expect(rendered(fixture).querySelector('.vintage-strip .value')?.textContent)
      .toContain('WEO 10.0.0 2026-04-14');
  });

  /**
   * The count the shell is responsible for, asserted directly.
   *
   * Only `/saved-queries` and `/countries-indicators` reach no other caller of
   * `vintages()`: the overview and vintages pages call it themselves, and the
   * working query card calls it on observations, series and the request
   * builder. Walking those two is what makes the shell's own request the only
   * one in the number.
   *
   * Node identity below proves the component is not rebuilt. This proves the
   * request is not repeated, which is the fact that actually matters and which
   * identity alone would not catch if the read ever moved into an effect.
   */
  it('reads the vintages once across tabs that do not read them', async () => {
    class CountingProvider extends FixtureMacroDataProvider {
      calls = 0;

      override vintages(): Observable<Envelope<Vintage>> {
        this.calls += 1;
        return super.vintages();
      }
    }

    const provider = new CountingProvider();
    const fixture = await mount(provider, '/saved-queries');
    rendered(fixture);

    expect(provider.calls).toBe(1);

    const router = TestBed.inject(Router);
    for (const path of ['/countries-indicators', '/saved-queries', '/countries-indicators']) {
      await router.navigateByUrl(path);
      rendered(fixture);
    }

    expect(provider.calls).toBe(1);
  });

  describe('when the data service fails', () => {
    let fixture: ComponentFixture<App>;

    beforeEach(async () => {
      fixture = await mount(new FailingMacroDataProvider());
    });

    it('shows the vintage strip as unavailable instead of breaking the shell', () => {
      const strip = rendered(fixture).querySelector('.vintage-strip .value');

      expect(strip?.textContent?.trim()).toBe('Unavailable');
      // F-10: the strip is an error slot like the other five, so it announces
      // itself. It was the only one without a role.
      expect(strip?.getAttribute('role')).toBe('status');
    });

    it('keeps navigation usable', async () => {
      const router = TestBed.inject(Router);
      await router.navigateByUrl('/observations');

      expect(router.url).toBe('/observations');
      expect(rendered(fixture).querySelectorAll('.tabs a').length).toBe(7);
    });
  });

  /**
   * Feature 8: the service's own explanation reaches the header strip.
   *
   * The no-detail fallback is already covered above by `FailingMacroDataProvider`,
   * which throws a plain `Error` and still renders "Unavailable".
   */
  describe('when the service explains the failure', () => {
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
      const fixture = await mount(provider);
      return rendered(fixture).querySelector('.vintage-strip .value');
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
  describe('the vintage strip against the live envelope shape', () => {
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
      const fixture = await mount(new LiveShapeProvider());
      const strip = rendered(fixture).querySelector('.vintage-strip .value');
      const text = strip?.textContent?.trim() ?? '';

      expect(text).toContain('WDI 2026-07-13 #11');
      expect(text).toContain('WEO 9.0.0 2026-07-31');
      // Superseded vintages are not "latest".
      expect(text).not.toContain('#10');
    });

    it('still renders the attribution footer from meta', async () => {
      const fixture = await mount(new LiveShapeProvider());
      const footer = rendered(fixture).querySelector('.attribution');
      const lines = Array.from(footer?.querySelectorAll('div') ?? []).map(
        (line) => line.textContent?.trim() ?? ''
      );

      expect(lines).toContain('Source: IMF World Economic Outlook database');
    });
  });
});
