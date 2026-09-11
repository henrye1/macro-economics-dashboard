import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, throwError } from 'rxjs';

import { FixtureMacroDataProvider } from '../core/fixtures/fixture-macro-data.provider';
import type { Country, Envelope } from '../core/macro-contracts';
import { MacroRequestError } from '../core/http/macro-error';
import { MACRO_DATA } from '../core/macro-data.provider';
import { DEFAULT_WORKING_QUERY } from '../core/working-query';
import { WorkingQueryStore } from '../core/working-query.store';
import { WorkingQueryCard } from './working-query-card';

class FailingProvider extends FixtureMacroDataProvider {
  override countries(): Observable<Envelope<Country>> {
    return throwError(() => new Error('service unavailable'));
  }
}

class NeverResolvingProvider extends FixtureMacroDataProvider {
  override countries(): Observable<Envelope<Country>> {
    return new Observable<Envelope<Country>>();
  }
}

function build(
  provider: FixtureMacroDataProvider = new FixtureMacroDataProvider()
): { fixture: ComponentFixture<WorkingQueryCard>; store: WorkingQueryStore } {
  TestBed.configureTestingModule({
    imports: [WorkingQueryCard],
    providers: [{ provide: MACRO_DATA, useValue: provider }]
  });

  const fixture = TestBed.createComponent(WorkingQueryCard);
  const store = TestBed.inject(WorkingQueryStore);
  fixture.detectChanges();
  return { fixture, store };
}

function el(fixture: ComponentFixture<WorkingQueryCard>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function chipText(fixture: ComponentFixture<WorkingQueryCard>, kind: string): string[] {
  return Array.from(el(fixture).querySelectorAll(`.chip.${kind}`)).map((chip) =>
    (chip.textContent ?? '').replace('×', '').trim()
  );
}

describe('WorkingQueryCard', () => {
  afterEach(() => TestBed.resetTestingModule());

  describe('chips', () => {
    it('renders the store\'s indicators and countries as chips', () => {
      const { fixture, store } = build();

      store.addIndicator('GDP_GROWTH_REAL');
      store.addCountry('ZAF');
      fixture.detectChanges();

      expect(chipText(fixture, 'indicator')).toEqual(['GDP_GROWTH_REAL']);
      expect(chipText(fixture, 'country')).toEqual(['ZAF']);
    });

    it('gives each remove control an accessible name and a real button', () => {
      const { fixture, store } = build();

      store.addIndicator('GDP_GROWTH_REAL');
      store.addCountry('ZAF');
      fixture.detectChanges();

      const buttons = Array.from(
        el(fixture).querySelectorAll<HTMLButtonElement>('.chip .remove')
      );

      expect(buttons.length).toBe(2);
      // A real <button type=button>, so the chip is keyboard-reachable and does
      // not submit anything. The prototype used a bare span.
      expect(buttons.every((button) => button.tagName === 'BUTTON')).toBeTrue();
      expect(buttons.every((button) => button.type === 'button')).toBeTrue();
      expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
        'Remove indicator GDP_GROWTH_REAL',
        'Remove country ZAF'
      ]);
    });

    it('removes the indicator whose button was pressed', () => {
      const { fixture, store } = build();

      store.addIndicator('A');
      store.addIndicator('B');
      fixture.detectChanges();

      const second = el(fixture).querySelectorAll<HTMLButtonElement>(
        '.chip.indicator .remove'
      )[1];
      second.click();
      fixture.detectChanges();

      expect(store.query().indicators).toEqual(['A']);
      expect(chipText(fixture, 'indicator')).toEqual(['A']);
    });

    it('says all countries when none are chosen', () => {
      const { fixture } = build();

      expect(el(fixture).querySelector('.hint')?.textContent?.trim()).toBe('All countries');
    });
  });

  describe('option lists', () => {
    it('offers only indicators not already chosen', () => {
      const { fixture, store } = build();
      const options = () =>
        Array.from(el(fixture).querySelectorAll('select'))[0].querySelectorAll('option');

      const before = options().length;
      store.addIndicator('GDP_GROWTH_REAL');
      fixture.detectChanges();

      expect(options().length).toBe(before - 1);
      expect(Array.from(options()).map((option) => option.getAttribute('value')))
        .not.toContain('GDP_GROWTH_REAL');
    });

    it('lists every published vintage plus the latest option', () => {
      const { fixture } = build();
      const vintageSelect = el(fixture).querySelector('.vintage select') as HTMLSelectElement;

      expect(vintageSelect.querySelectorAll('option').length).toBe(6);
      expect(vintageSelect.querySelector('option')?.getAttribute('value')).toBe('latest');
    });

    it('disables the add-selects and explains itself when the lists fail', () => {
      const { fixture } = build(new FailingProvider());

      expect(el(fixture).querySelector('.options-unavailable')?.textContent)
        .toContain('unavailable');
      const addIndicator = el(fixture).querySelector('select') as HTMLSelectElement;
      expect(addIndicator.disabled).toBeTrue();
    });

    it('still lets the query be edited when the lists fail', () => {
      const { fixture, store } = build(new FailingProvider());

      store.addIndicator('GDP_GROWTH_REAL');
      fixture.detectChanges();

      expect(chipText(fixture, 'indicator')).toEqual(['GDP_GROWTH_REAL']);
      expect(el(fixture).querySelector('.btn')).toBeTruthy();
    });

    it('shows a loading placeholder while the lists load', () => {
      const { fixture } = build(new NeverResolvingProvider());
      const addIndicator = el(fixture).querySelector('select') as HTMLSelectElement;

      expect(addIndicator.disabled).toBeTrue();
      expect(addIndicator.querySelector('option')?.textContent).toContain('Loading');
    });
  });

  describe('validation', () => {
    it('explains the missing indicator and links the message to the control', () => {
      const { fixture } = build();
      const message = el(fixture).querySelector('#indicators-problem');
      const select = el(fixture).querySelector('select') as HTMLSelectElement;

      expect(message?.textContent).toContain('at least one indicator');
      expect(select.getAttribute('aria-invalid')).toBe('true');
      expect(select.getAttribute('aria-describedby')).toBe('indicators-problem');
    });

    it('clears the indicator message once one is chosen', () => {
      const { fixture, store } = build();

      store.addIndicator('GDP_GROWTH_REAL');
      fixture.detectChanges();

      expect(el(fixture).querySelector('#indicators-problem')).toBeNull();
      expect(el(fixture).querySelector('select')?.getAttribute('aria-invalid')).toBeNull();
    });

    it('flags an inverted year range on both inputs and announces it', () => {
      const { fixture, store } = build();

      store.addIndicator('GDP_GROWTH_REAL');
      store.setYearRange(2030, 2020);
      fixture.detectChanges();

      const inputs = Array.from(el(fixture).querySelectorAll('input[type="number"]'));

      expect(inputs.length).toBe(2);
      expect(inputs.every((input) => input.getAttribute('aria-invalid') === 'true')).toBeTrue();
      expect(inputs.every((input) => input.getAttribute('aria-describedby') === 'year-problem'))
        .toBeTrue();
      expect(el(fixture).querySelector('.year-problem')?.getAttribute('role')).toBe('status');
      expect(el(fixture).querySelector('#year-problem')?.textContent)
        .toContain('after year to');
    });

    it('clears the range message when the range is fixed', () => {
      const { fixture, store } = build();

      store.addIndicator('GDP_GROWTH_REAL');
      store.setYearRange(2030, 2020);
      fixture.detectChanges();
      store.setYearRange(2020, 2030);
      fixture.detectChanges();

      expect(el(fixture).querySelector('#year-problem')).toBeNull();
    });
  });

  describe('summary and reset', () => {
    it('summarises the query without inventing a result count', () => {
      const { fixture, store } = build();

      store.addIndicator('A');
      store.addIndicator('B');
      store.addCountry('ZAF');
      store.addCountry('NAM');
      store.setYearRange(2018, 2031);
      fixture.detectChanges();

      const summary = el(fixture).querySelector('.card-head .meta')?.textContent?.trim();

      expect(summary).toBe('2 indicators × 2 countries · 2018–2031');
      expect(summary).not.toContain('observation');
    });

    it('uses singular wording for one of each', () => {
      const { fixture, store } = build();

      store.addIndicator('A');
      store.addCountry('ZAF');
      fixture.detectChanges();

      expect(el(fixture).querySelector('.card-head .meta')?.textContent?.trim())
        .toBe('1 indicator × 1 country');
    });

    it('resets the query to the defaults', () => {
      const { fixture, store } = build();

      store.addIndicator('A');
      store.addCountry('ZAF');
      store.setYearRange(2000, 2020);
      fixture.detectChanges();

      (el(fixture).querySelector('.btn') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(store.query()).toEqual(DEFAULT_WORKING_QUERY);
      expect(chipText(fixture, 'indicator')).toEqual([]);
    });

    it('ships no save control, since saving is feature 10', () => {
      const { fixture } = build();
      const labels = Array.from(el(fixture).querySelectorAll('button')).map(
        (button) => button.textContent?.toLowerCase() ?? ''
      );

      expect(labels.some((label) => label.includes('save'))).toBeFalse();
    });
  });
});

describe('WorkingQueryCard result summary', () => {
  let fixture: ComponentFixture<WorkingQueryCard>;
  let store: WorkingQueryStore;

  const summary = () =>
    (fixture.nativeElement as HTMLElement)
      .querySelector('.card-head .meta')
      ?.textContent?.replace(/\s+/g, ' ')
      .trim();

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [WorkingQueryCard],
      providers: [{ provide: MACRO_DATA, useClass: FixtureMacroDataProvider }]
    });

    store = TestBed.inject(WorkingQueryStore);
    store.reset();
    store.addIndicator('GDP_GROWTH_REAL');
    store.addCountry('ZAF');

    fixture = TestBed.createComponent(WorkingQueryCard);
  });

  it('omits the phrase by default, so hosts with no result mount it unchanged', () => {
    fixture.detectChanges();

    expect(summary()).toBe('1 indicator × 1 country');
  });

  it('appends the host phrase verbatim, whatever it counts', () => {
    fixture.componentRef.setInput('resultSummary', '56 observations');
    fixture.detectChanges();

    expect(summary()).toBe('1 indicator × 1 country · 56 observations');
  });

  it('owns no noun, so a self-pluralising one passes straight through', () => {
    fixture.componentRef.setInput('resultSummary', '1 series');
    fixture.detectChanges();

    expect(summary()).toBe('1 indicator × 1 country · 1 series');
  });

  it('renders a zero phrase, because zero is a real answer', () => {
    fixture.componentRef.setInput('resultSummary', '0 observations');
    fixture.detectChanges();

    expect(summary()).toBe('1 indicator × 1 country · 0 observations');
  });

  it('keeps the phrase last, after the year range', () => {
    store.setYearRange(2018, 2031);
    fixture.componentRef.setInput('resultSummary', '56 observations');
    fixture.detectChanges();

    expect(summary()).toBe('1 indicator × 1 country · 2018–2031 · 56 observations');
  });
});

/** Feature 8: the service's own explanation reaches the options notice. */
describe('WorkingQueryCard when the service explains the failure', () => {
  class ExplainingProvider extends FixtureMacroDataProvider {
    override countries(): Observable<Envelope<Country>> {
      return throwError(() => new MacroRequestError(400, 'Unknown indicator code(s): NOPE.'));
    }
  }

  class SilentProvider extends FixtureMacroDataProvider {
    override countries(): Observable<Envelope<Country>> {
      return throwError(() => new MacroRequestError(0, null));
    }
  }

  function notice(provider: FixtureMacroDataProvider): Element | null {
    const { fixture } = build(provider);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector('.options-unavailable');
  }

  it('shows the problem detail instead of the generic wording', () => {
    const element = notice(new ExplainingProvider());

    expect(element?.textContent?.trim()).toBe('Unknown indicator code(s): NOPE.');
    expect(element?.getAttribute('role')).toBe('status');
  });

  it('falls back to the generic wording when the error carries no detail', () => {
    expect(notice(new SilentProvider())?.textContent?.trim()).toBe(
      'Indicator, country and vintage lists are unavailable. The query below is still editable.'
    );
  });
});
