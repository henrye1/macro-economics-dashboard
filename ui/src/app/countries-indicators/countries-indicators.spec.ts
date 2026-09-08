import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Observable, throwError } from 'rxjs';

import { FixtureMacroDataProvider } from '../core/fixtures/fixture-macro-data.provider';
import { FIXTURE_COUNTRIES, FIXTURE_INDICATORS } from '../core/fixtures/macro-fixtures';
import type { Country, Envelope, Indicator } from '../core/macro-contracts';
import { MACRO_DATA } from '../core/macro-data.provider';
import { WorkingQueryStore } from '../core/working-query.store';
import {
  CATALOGUE_SEARCH_DEBOUNCE_MS,
  CountriesIndicatorsPage
} from './countries-indicators';

class NoCountriesProvider extends FixtureMacroDataProvider {
  override countries(): Observable<Envelope<Country>> {
    return throwError(() => new Error('countries unavailable'));
  }
}

class NoIndicatorsProvider extends FixtureMacroDataProvider {
  override indicators(): Observable<Envelope<Indicator>> {
    return throwError(() => new Error('catalogue unavailable'));
  }
}

class PendingCountriesProvider extends FixtureMacroDataProvider {
  override countries(): Observable<Envelope<Country>> {
    return new Observable<Envelope<Country>>();
  }
}

/** Records what the component actually asked the provider for. */
class RecordingProvider extends FixtureMacroDataProvider {
  readonly queries: Array<Parameters<FixtureMacroDataProvider['indicators']>[0]> = [];

  override indicators(
    query?: Parameters<FixtureMacroDataProvider['indicators']>[0]
  ): Observable<Envelope<Indicator>> {
    this.queries.push(query);
    return super.indicators(query);
  }
}

function build(provider: FixtureMacroDataProvider = new FixtureMacroDataProvider()): {
  fixture: ComponentFixture<CountriesIndicatorsPage>;
  store: WorkingQueryStore;
} {
  TestBed.configureTestingModule({
    imports: [CountriesIndicatorsPage],
    providers: [{ provide: MACRO_DATA, useValue: provider }]
  });

  const fixture = TestBed.createComponent(CountriesIndicatorsPage);
  const store = TestBed.inject(WorkingQueryStore);
  fixture.detectChanges();
  return { fixture, store };
}

function el(fixture: ComponentFixture<CountriesIndicatorsPage>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function countryNames(fixture: ComponentFixture<CountriesIndicatorsPage>): string[] {
  return Array.from(el(fixture).querySelectorAll('.country-row .name')).map(
    (name) => name.textContent?.trim() ?? ''
  );
}

function codes(fixture: ComponentFixture<CountriesIndicatorsPage>): string[] {
  return Array.from(el(fixture).querySelectorAll('tbody .code-link')).map((code) =>
    (code.textContent ?? '').replace('in working query', '').trim()
  );
}

function type(
  fixture: ComponentFixture<CountriesIndicatorsPage>,
  selector: string,
  value: string
): void {
  const input = el(fixture).querySelector(selector) as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

function choose(
  fixture: ComponentFixture<CountriesIndicatorsPage>,
  selector: string,
  value: string
): void {
  const select = el(fixture).querySelector(selector) as HTMLSelectElement;
  select.value = value;
  select.dispatchEvent(new Event('change'));
  fixture.detectChanges();
}

describe('CountriesIndicatorsPage', () => {
  afterEach(() => TestBed.resetTestingModule());

  describe('countries card', () => {
    it('lists every country with its sources and ISO3', () => {
      const { fixture } = build();

      expect(countryNames(fixture).length).toBe(FIXTURE_COUNTRIES.length);
      expect(countryNames(fixture)[0]).toBe('South Africa');
      expect(el(fixture).querySelector('.country-row .iso')?.textContent?.trim()).toBe('ZAF');
      expect(el(fixture).querySelector('.country-row .sources')?.textContent?.trim())
        .toBe('IMF_WEO · WB_WDI');
    });

    it('searches by name, case-insensitively', () => {
      const { fixture } = build();

      type(fixture, '.countries input', 'nam');

      expect(countryNames(fixture)).toEqual(['Namibia']);
    });

    it('searches by ISO3 too', () => {
      const { fixture } = build();

      type(fixture, '.countries input', 'zaf');

      expect(countryNames(fixture)).toEqual(['South Africa']);
    });

    it('says so when nothing matches', () => {
      const { fixture } = build();

      type(fixture, '.countries input', 'zzzz');

      expect(countryNames(fixture)).toEqual([]);
      expect(el(fixture).querySelector('.countries .state')?.textContent?.trim())
        .toBe('No country matches that search.');
    });

    it('tracks the listed rows in the head count', () => {
      const { fixture } = build();
      const count = () =>
        el(fixture).querySelector('.countries .card-head .meta')?.textContent?.trim();

      expect(count()).toBe('12 with data');

      type(fixture, '.countries input', 'nam');

      expect(count()).toBe('1 with data');
    });

    it('shows a loading state and keeps the catalogue usable', () => {
      const { fixture } = build(new PendingCountriesProvider());

      expect(el(fixture).querySelector('.countries .state')?.textContent).toContain('Loading');
      expect(codes(fixture).length).toBe(FIXTURE_INDICATORS.length);
    });

    it('degrades on failure without taking the catalogue down', () => {
      const { fixture } = build(new NoCountriesProvider());

      expect(el(fixture).querySelector('.countries .state')?.textContent)
        .toContain('country list is unavailable');
      expect(codes(fixture).length).toBe(FIXTURE_INDICATORS.length);
    });
  });

  describe('catalogue', () => {
    it('lists the curated catalogue with units', () => {
      const { fixture } = build();

      expect(codes(fixture).length).toBe(13);
      expect(codes(fixture)).toContain('GDP_GROWTH_REAL');
      expect(el(fixture).querySelectorAll('tbody tr')[0].querySelectorAll('td')[2].textContent)
        .toContain('Percent');
    });

    it('marks every curated row with the curated badge', () => {
      const { fixture } = build();

      expect(el(fixture).querySelectorAll('.badge.curated').length).toBe(13);
    });

    it('asks the provider for the curated set, not the whole catalogue', () => {
      const provider = new RecordingProvider();
      build(provider);

      expect(provider.queries[0]?.curated).toBeTrue();
    });

    it('narrows by category through the provider', () => {
      const { fixture } = build();

      choose(fixture, '.filters select', 'fiscal');

      expect(codes(fixture)).toEqual(['GOVT_DEBT_GDP', 'FISCAL_BALANCE_GDP']);
    });

    it('narrows by source', () => {
      const { fixture } = build();

      choose(fixture, '.filters select:nth-of-type(1)', '');
      const selects = el(fixture).querySelectorAll('select');
      selects[1].value = 'WB_WDI';
      selects[1].dispatchEvent(new Event('change'));
      fixture.detectChanges();

      expect(codes(fixture)).toContain('REAL_INTEREST_RATE');
      expect(codes(fixture)).not.toContain('GOVT_DEBT_GDP');
    });

    it('tracks the filtered total in the head count', () => {
      const { fixture } = build();
      const count = () =>
        el(fixture).querySelector('.catalogue .card-head .meta')?.textContent?.trim();

      expect(count()).toBe('13 indicators');

      choose(fixture, '.filters select', 'fiscal');

      expect(count()).toBe('2 indicators');
    });

    it('offers the distinct categories, sorted, from the unfiltered catalogue', () => {
      const { fixture } = build();
      const options = () =>
        Array.from(
          (el(fixture).querySelector('.filters select') as HTMLSelectElement).querySelectorAll(
            'option'
          )
        ).map((option) => option.getAttribute('value'));

      expect(options()).toEqual([
        '',
        'credit',
        'external',
        'fiscal',
        'growth',
        'labour',
        'monetary',
        'prices'
      ]);

      // Narrowing must not collapse the option list to the chosen category.
      choose(fixture, '.filters select', 'fiscal');

      expect(options().length).toBe(8);
    });

    it('explains an empty result as a filter problem', fakeAsync(() => {
      const { fixture } = build();

      type(fixture, '.filters input', 'zzzz-no-such-indicator');
      tick(CATALOGUE_SEARCH_DEBOUNCE_MS);
      fixture.detectChanges();

      expect(codes(fixture)).toEqual([]);
      expect(el(fixture).querySelector('.catalogue .state')?.textContent)
        .toContain('No indicator matches these filters');
    }));

    it('degrades on failure without taking the country list down', () => {
      const { fixture } = build(new NoIndicatorsProvider());

      expect(el(fixture).querySelector('.catalogue .state')?.textContent)
        .toContain('catalogue is unavailable');
      expect(countryNames(fixture).length).toBe(FIXTURE_COUNTRIES.length);
    });

    it('keeps the curated toggle pressed and disabled, per the MVP scope', () => {
      const { fixture } = build();
      const toggle = el(fixture).querySelector('.filters .btn') as HTMLButtonElement;

      expect(toggle.textContent?.trim()).toBe('Curated only');
      expect(toggle.getAttribute('aria-pressed')).toBe('true');
      expect(toggle.disabled).toBeTrue();
    });
  });

  describe('search debounce', () => {
    it('waits for the debounce before querying, then narrows', fakeAsync(() => {
      const { fixture } = build();

      type(fixture, '.filters input', 'unemployment');
      expect(codes(fixture).length).toBe(13);

      tick(CATALOGUE_SEARCH_DEBOUNCE_MS - 1);
      fixture.detectChanges();
      expect(codes(fixture).length).toBe(13);

      tick(1);
      fixture.detectChanges();
      expect(codes(fixture)).toEqual(['UNEMPLOYMENT_RATE']);
    }));

    it('issues one query for a burst of keystrokes', fakeAsync(() => {
      const provider = new RecordingProvider();
      const { fixture } = build(provider);
      const before = provider.queries.length;

      for (const term of ['g', 'gd', 'gdp']) {
        type(fixture, '.filters input', term);
        tick(50);
      }
      tick(CATALOGUE_SEARCH_DEBOUNCE_MS);
      fixture.detectChanges();

      expect(provider.queries.length).toBe(before + 1);
      expect(provider.queries.at(-1)?.q).toBe('gdp');
    }));

    it('applies a select immediately, without waiting for the debounce', () => {
      const { fixture } = build();

      choose(fixture, '.filters select', 'fiscal');

      expect(codes(fixture).length).toBe(2);
    });
  });

  describe('adding to the working query', () => {
    it('adds the clicked indicator', () => {
      const { fixture, store } = build();

      (el(fixture).querySelector('tbody .code-link') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(store.query().indicators).toEqual([codes(fixture)[0]]);
    });

    it('uses a real button, so keyboard activation works', () => {
      const { fixture, store } = build();
      const control = el(fixture).querySelector('tbody .code-link') as HTMLButtonElement;

      expect(control.tagName).toBe('BUTTON');
      expect(control.type).toBe('button');

      control.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      control.click(); // what Enter triggers on a native button
      fixture.detectChanges();

      expect(store.query().indicators.length).toBe(1);
    });

    it('is idempotent, so a second click does not duplicate the chip', () => {
      const { fixture, store } = build();
      const control = el(fixture).querySelector('tbody .code-link') as HTMLButtonElement;

      control.click();
      fixture.detectChanges();
      control.click();
      fixture.detectChanges();

      expect(store.query().indicators.length).toBe(1);
    });

    it('marks a chosen indicator as pressed, not by colour alone', () => {
      const { fixture, store } = build();

      store.addIndicator('GDP_GROWTH_REAL');
      fixture.detectChanges();

      const chosen = Array.from(
        el(fixture).querySelectorAll<HTMLButtonElement>('tbody .code-link')
      ).find((control) => control.textContent?.includes('GDP_GROWTH_REAL'));

      expect(chosen?.getAttribute('aria-pressed')).toBe('true');
      expect(chosen?.classList).toContain('selected');
      expect(chosen?.querySelector('.sr-only')?.textContent?.trim()).toBe('in working query');
    });

    it('leaves unchosen indicators unpressed', () => {
      const { fixture, store } = build();

      store.addIndicator('GDP_GROWTH_REAL');
      fixture.detectChanges();

      const others = Array.from(
        el(fixture).querySelectorAll<HTMLButtonElement>('tbody .code-link')
      ).filter((control) => !control.textContent?.includes('GDP_GROWTH_REAL'));

      expect(others.length).toBe(12);
      expect(others.every((control) => control.getAttribute('aria-pressed') === 'false'))
        .toBeTrue();
    });

    it('offers no removal control, since the chip owns that', () => {
      const { fixture, store } = build();

      store.addIndicator('GDP_GROWTH_REAL');
      fixture.detectChanges();

      expect(el(fixture).querySelector('tbody .remove')).toBeNull();
    });
  });
});
