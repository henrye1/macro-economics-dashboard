import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';

import { App } from './app';
import { routes } from './app.routes';
import { FixtureMacroDataProvider } from './core/fixtures/fixture-macro-data.provider';
import { MACRO_DATA } from './core/macro-data.provider';

/**
 * Routing only. The chrome the seven tabs render inside is `ConsoleShell`, and
 * its own spec covers the header strip, the tab bar and the footer.
 */
function main(fixture: ComponentFixture<App>): Element | null {
  fixture.detectChanges();
  return (fixture.nativeElement as HTMLElement).querySelector('.app-main');
}

describe('App routing', () => {
  let fixture: ComponentFixture<App>;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes),
        // The request builder reaches HttpClient directly, so the root needs
        // it wherever a route can reach that page.
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MACRO_DATA, useClass: FixtureMacroDataProvider }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(App);
    router = TestBed.inject(Router);
  });

  it('has no placeholder tabs left', async () => {
    // Every tab became a real page across features 2, 3, 4, 6, 9, 10 and 12.
    // A `.page-title` is the placeholder marker, so finding one anywhere means
    // a tab was left behind.
    const paths = [
      '/overview',
      '/countries-indicators',
      '/series',
      '/observations',
      '/vintages',
      '/saved-queries',
      '/request-builder'
    ];

    for (const path of paths) {
      await router.navigateByUrl(path);

      expect(router.url).withContext(path).toBe(path);
      expect(main(fixture)?.querySelector('.page-title')).withContext(path).toBeNull();
    }
  });

  it('renders the Overview page in the outlet', async () => {
    await router.navigateByUrl('/overview');
    const outlet = main(fixture);

    expect(router.url).toBe('/overview');
    expect(outlet?.querySelector('app-overview')).toBeTruthy();
    expect(outlet?.querySelector('h1')?.textContent)
      .toContain('Annual macroeconomic data for every country');
  });

  it('renders the catalogue on Countries & indicators', async () => {
    await router.navigateByUrl('/countries-indicators');
    const outlet = main(fixture);

    expect(router.url).toBe('/countries-indicators');
    expect(outlet?.querySelector('app-countries-indicators')).toBeTruthy();
    expect(
      Array.from(outlet?.querySelectorAll('.card-head h2') ?? []).map((h) => h.textContent?.trim())
    ).toEqual(['Countries', 'Indicator catalogue']);
  });

  it('renders the series view on Series', async () => {
    await router.navigateByUrl('/series');
    const outlet = main(fixture);

    expect(router.url).toBe('/series');
    expect(outlet?.querySelector('app-series')).toBeTruthy();
    expect(
      Array.from(outlet?.querySelectorAll('.card-head h2') ?? []).map((h) => h.textContent?.trim())
    ).toEqual(['Working query', 'Series']);
  });

  it('renders the working query card on Observations', async () => {
    await router.navigateByUrl('/observations');
    const outlet = main(fixture);

    expect(router.url).toBe('/observations');
    expect(outlet?.querySelector('app-working-query-card')).toBeTruthy();
    expect(outlet?.querySelector('.card-head h2')?.textContent?.trim()).toBe('Working query');
  });

  it('renders the Vintages page in the outlet, no longer a placeholder', async () => {
    await router.navigateByUrl('/vintages');
    const outlet = main(fixture);

    expect(router.url).toBe('/vintages');
    expect(outlet?.querySelector('.vintages h2')?.textContent?.trim()).toBe('Published vintages');
    expect(outlet?.querySelector('.page-title')).toBeNull();
  });

  it('renders the Saved queries page in the outlet, no longer a placeholder', async () => {
    await router.navigateByUrl('/saved-queries');
    const outlet = main(fixture);

    expect(router.url).toBe('/saved-queries');
    expect(outlet?.querySelector('.saved-queries h2')?.textContent?.trim()).toBe('Saved queries');
    expect(outlet?.querySelector('.page-title')).toBeNull();
  });

  it('renders the Request builder page in the outlet, no longer a placeholder', async () => {
    await router.navigateByUrl('/request-builder');
    const outlet = main(fixture);

    expect(router.url).toBe('/request-builder');
    expect(outlet?.querySelector('.request h2')?.textContent?.trim()).toBe('Request');
    expect(outlet?.querySelector('.codes h2')?.textContent?.trim()).toBe('Status codes');
  });

  it('redirects the empty path to Overview', async () => {
    await router.navigateByUrl('/');

    expect(router.url).toBe('/overview');
  });

  it('redirects an unknown path to Overview', async () => {
    await router.navigateByUrl('/not-a-tab');

    expect(router.url).toBe('/overview');
  });

  /**
   * The seven tabs are children of a pathless parent, so a mistake there shows
   * up as a URL that gained a segment rather than as a page that failed to
   * render. Assert the shape itself, not only that each page appears.
   */
  it('keeps every tab at its own top-level path, with no segment from the parent', async () => {
    await router.navigateByUrl('/series');

    expect(router.url).toBe('/series');
    expect(main(fixture)?.querySelector('app-series')).toBeTruthy();
  });
});
