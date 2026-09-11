import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LastResultVintages } from '../core/last-result-vintages';
import type { SavedQuery } from '../core/saved-query';
import {
  SAVED_QUERIES_KEY,
  SAVED_QUERY_CLOCK,
  SAVED_QUERY_STORAGE,
  SavedQueryStore,
  type SavedQueryStorage
} from '../core/saved-query.store';
import { DEFAULT_WORKING_QUERY, type WorkingQuery } from '../core/working-query';
import { WorkingQueryStore } from '../core/working-query.store';
import { SavedQueriesPage } from './saved-queries';

class FakeStorage implements SavedQueryStorage {
  readonly items = new Map<string, string>();
  failWrites = false;

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) {
      throw new DOMException('quota', 'QuotaExceededError');
    }
    this.items.set(key, value);
  }
}

function query(overrides: Partial<WorkingQuery> = {}): WorkingQuery {
  return { ...DEFAULT_WORKING_QUERY, ...overrides };
}

function entry(overrides: Partial<SavedQuery> = {}): SavedQuery {
  return {
    name: 'Q4 2025 ECL — ZAF, NAM',
    query: query({
      indicators: ['GDP_GROWTH_REAL', 'CPI_INFLATION_AVG', 'UNEMPLOYMENT_RATE'],
      countries: ['ZAF', 'NAM'],
      yearFrom: 2018,
      yearTo: 2030,
      vintage: 12
    }),
    vintageIds: [12],
    savedAt: '2025-10-14T09:00:00.000Z',
    ...overrides
  };
}

describe('SavedQueriesPage', () => {
  let fixture: ComponentFixture<SavedQueriesPage>;
  let storage: FakeStorage;
  let store: WorkingQueryStore;
  let observed: LastResultVintages;

  function setUp(seed: SavedQuery[] = [], storageValue: SavedQueryStorage | null = storage): void {
    if (seed.length > 0 && storageValue !== null) {
      storage.items.set(SAVED_QUERIES_KEY, JSON.stringify(seed));
    }

    TestBed.configureTestingModule({
      imports: [SavedQueriesPage],
      providers: [
        { provide: SAVED_QUERY_STORAGE, useValue: storageValue },
        { provide: SAVED_QUERY_CLOCK, useValue: () => '2026-06-01T00:00:00.000Z' },
        SavedQueryStore,
        WorkingQueryStore,
        LastResultVintages
      ]
    });

    store = TestBed.inject(WorkingQueryStore);
    store.reset();
    observed = TestBed.inject(LastResultVintages);
    fixture = TestBed.createComponent(SavedQueriesPage);
    fixture.detectChanges();
  }

  beforeEach(() => {
    storage = new FakeStorage();
  });

  afterEach(() => TestBed.resetTestingModule());

  const el = () => fixture.nativeElement as HTMLElement;
  const rows = () => Array.from(el().querySelectorAll('tbody tr'));
  const cells = (row: Element) => Array.from(row.querySelectorAll('td')).map((td) => td.textContent?.trim());
  const states = () =>
    Array.from(el().querySelectorAll('[role="status"]')).map((n) => n.textContent?.trim() ?? '');
  const nameInput = () => el().querySelector<HTMLInputElement>('.field input');
  const saveButton = () => el().querySelector<HTMLButtonElement>('.btn.save');
  const loadButton = (row: Element) => row.querySelector<HTMLButtonElement>('.btn.outline-green');
  const reproduceButton = (row: Element) => row.querySelector<HTMLButtonElement>('.btn.solid');

  function type(value: string): void {
    const input = nameInput();
    if (input === null) {
      throw new Error('no name input');
    }
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  /** A sendable query whose result has been seen, so saving records ids. */
  function sendableWithResult(ids: number[] = [12]): void {
    store.addIndicator('GDP_GROWTH_REAL');
    observed.record(
      store.query(),
      ids.map((id) => ({ id, source: 'IMF_WEO' as const, label: `V${id}` }))
    );
    fixture.detectChanges();
  }

  describe('the table', () => {
    it('says so when nothing has been saved, rather than showing an empty table', () => {
      setUp();

      expect(states().some((text) => text.includes('No saved queries yet'))).toBeTrue();
      expect(el().querySelector('tbody')).toBeNull();
    });

    it('renders the four columns from the saved entry', () => {
      setUp([entry()]);

      expect(rows().length).toBe(1);
      expect(cells(rows()[0]).slice(0, 4)).toEqual([
        'Q4 2025 ECL — ZAF, NAM',
        '3 ind × 2 ctry · 2018–2030',
        'pinned id 12',
        '2025-10-14'
      ]);
    });

    it('lists newest first, as the store hands them over', () => {
      setUp([
        entry({ name: 'newer', savedAt: '2026-05-02T00:00:00.000Z' }),
        entry({ name: 'older', savedAt: '2025-10-14T00:00:00.000Z' })
      ]);

      expect(rows().map((row) => cells(row)[0])).toEqual(['newer', 'older']);
    });
  });

  describe('Load', () => {
    it('applies the saved query verbatim, including its own vintage', () => {
      setUp([entry()]);
      loadButton(rows()[0])?.click();
      fixture.detectChanges();

      expect(store.query().indicators).toEqual([
        'GDP_GROWTH_REAL',
        'CPI_INFLATION_AVG',
        'UNEMPLOYMENT_RATE'
      ]);
      expect(store.query().countries).toEqual(['ZAF', 'NAM']);
      expect(store.query().yearFrom).toBe(2018);
      expect(store.query().vintage).toBe(12);
    });

    it('replaces whatever was there, rather than merging into it', () => {
      setUp([entry({ query: query({ indicators: ['ONLY_THIS'] }) })]);
      store.addIndicator('LEFTOVER');
      store.addCountry('ZWE');

      loadButton(rows()[0])?.click();
      fixture.detectChanges();

      expect(store.query().indicators).toEqual(['ONLY_THIS']);
      expect(store.query().countries).toEqual([]);
    });

    it('returns to page 1, because a saved page describes a result that is gone', () => {
      setUp([entry()]);
      store.setPage(4);

      loadButton(rows()[0])?.click();
      fixture.detectChanges();

      expect(store.query().page).toBe(1);
    });

    it('confirms what it loaded', () => {
      setUp([entry()]);
      loadButton(rows()[0])?.click();
      fixture.detectChanges();

      expect(states().some((text) => text.includes('Loaded'))).toBeTrue();
    });
  });

  describe('Reproduce', () => {
    it('applies the query with the recorded id pinned', () => {
      setUp([entry({ query: query({ indicators: ['A'], vintage: 'latest' }), vintageIds: [12] })]);
      reproduceButton(rows()[0])?.click();
      fixture.detectChanges();

      // Saved as `latest`; reproducing pins the id that answered it.
      expect(store.query().vintage).toBe(12);
      expect(store.query().indicators).toEqual(['A']);
    });

    it('is disabled with a reason when no ids were recorded', () => {
      setUp([entry({ vintageIds: [] })]);
      const button = reproduceButton(rows()[0]);

      expect(button?.disabled).toBeTrue();
      expect(button?.getAttribute('title')).toContain('nothing to pin');
    });

    it('is disabled with a reason when the result drew on two vintages', () => {
      setUp([entry({ vintageIds: [2, 12] })]);
      const button = reproduceButton(rows()[0]);

      expect(button?.disabled).toBeTrue();
      expect(button?.getAttribute('title')).toContain('more than one vintage');
    });

    it('names the reason to assistive technology, not only in a tooltip', () => {
      setUp([entry({ vintageIds: [] })]);
      const button = reproduceButton(rows()[0]);
      const describedBy = button?.getAttribute('aria-describedby');

      expect(describedBy).toBeTruthy();
      expect(el().querySelector(`#${CSS.escape(describedBy as string)}`)?.textContent).toContain(
        'nothing to pin'
      );
    });

    it('does nothing when clicked while disabled', () => {
      setUp([entry({ vintageIds: [2, 12] })]);
      const before = store.query();

      reproduceButton(rows()[0])?.click();
      fixture.detectChanges();

      expect(store.query()).toBe(before);
    });
  });

  describe('saving', () => {
    it('refuses a blank name, and says why', () => {
      setUp();
      sendableWithResult();

      expect(saveButton()?.disabled).toBeTrue();
      expect(states().some((text) => text.includes('Name the query'))).toBeTrue();
    });

    it('refuses an unsendable query, and says why', () => {
      setUp();
      type('Named but empty');

      expect(saveButton()?.disabled).toBeTrue();
      expect(states().some((text) => text.includes('at least one indicator'))).toBeTrue();
    });

    it('saves the current query with the ids observed for it', () => {
      setUp();
      sendableWithResult([12]);
      type('Q1 2026 ECL');

      expect(saveButton()?.disabled).toBeFalse();
      saveButton()?.click();
      fixture.detectChanges();

      expect(rows().length).toBe(1);
      expect(cells(rows()[0])[0]).toBe('Q1 2026 ECL');
      expect(TestBed.inject(SavedQueryStore).saved()[0].vintageIds).toEqual([12]);
    });

    it('clears the name and confirms, naming the ids it recorded', () => {
      setUp();
      sendableWithResult([12]);
      type('Q1 2026 ECL');
      saveButton()?.click();
      fixture.detectChanges();

      expect(nameInput()?.value).toBe('');
      expect(states().some((text) => text.includes('vintage id 12'))).toBeTrue();
    });

    it('warns before saving when no result for this query has been seen', () => {
      setUp();
      store.addIndicator('GDP_GROWTH_REAL');
      fixture.detectChanges();
      type('Unseen');

      expect(states().some((text) => text.includes('no vintage ids'))).toBeTrue();
    });

    it('records no ids when the query changed after its result arrived', () => {
      setUp();
      sendableWithResult([12]);
      // The guard: the observed ids belong to the query that produced them.
      store.setYearRange(1990, 1995);
      fixture.detectChanges();
      type('Edited after the answer');
      saveButton()?.click();
      fixture.detectChanges();

      expect(TestBed.inject(SavedQueryStore).saved()[0].vintageIds).toEqual([]);
      expect(states().some((text) => text.includes('no vintage ids'))).toBeTrue();
    });

    it('replaces an entry saved under the same name', () => {
      setUp();
      sendableWithResult([12]);
      type('Same name');
      saveButton()?.click();
      fixture.detectChanges();

      store.addCountry('ZAF');
      observed.record(store.query(), [{ id: 2, source: 'IMF_WEO', label: 'V2' }]);
      fixture.detectChanges();
      type('Same name');
      saveButton()?.click();
      fixture.detectChanges();

      expect(rows().length).toBe(1);
      expect(TestBed.inject(SavedQueryStore).saved()[0].query.countries).toEqual(['ZAF']);
    });
  });

  describe('when storage is unavailable', () => {
    it('says so and disables saving, leaving the rest of the card usable', () => {
      setUp([], null);
      store.addIndicator('GDP_GROWTH_REAL');
      fixture.detectChanges();

      expect(states().some((text) => text.includes('not allowing'))).toBeTrue();
      expect(saveButton()?.disabled).toBeTrue();
      expect(el().querySelector('.field input')).not.toBeNull();
    });

    it('reports a write that is refused, without losing the page', () => {
      setUp();
      sendableWithResult([12]);
      storage.failWrites = true;
      type('Rejected');
      saveButton()?.click();
      fixture.detectChanges();

      expect(states().some((text) => text.includes('refused to store'))).toBeTrue();
      // The name survives, so the user can retry rather than retype.
      expect(nameInput()?.value).toBe('Rejected');
    });
  });
});
