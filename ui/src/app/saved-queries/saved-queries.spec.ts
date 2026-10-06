import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FixtureMacroDataProvider } from '../core/fixtures/fixture-macro-data.provider';
import { LastResultMeta } from '../core/last-result-meta';
import { MACRO_DATA } from '../core/macro-data.provider';
import type { EnvelopeMeta } from '../core/macro-contracts';
import type { SavedQuery } from '../core/saved-query';
import { SAVED_QUERIES_URL, SAVED_QUERY_STORAGE, SavedQueryStore } from '../core/saved-query.store';
import { SESSION_STORAGE, SessionStore } from '../core/session.store';
import { SUPABASE_CLIENT } from '../core/supabase/supabase.client';
import { DEFAULT_WORKING_QUERY, type WorkingQuery } from '../core/working-query';
import { WorkingQueryStore } from '../core/working-query.store';
import { SavedQueriesPage } from './saved-queries';

/** One turn of the task queue, so awaited HTTP answers land. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve));
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
  let httpMock: HttpTestingController;
  let store: WorkingQueryStore;
  let observed: LastResultMeta;

  /**
   * Builds the page for a signed-in visitor. `list` is the account's answer;
   * `null` leaves the list request pending, as a slow API would.
   */
  async function setUp(list: SavedQuery[] | null = []): Promise<void> {
    TestBed.configureTestingModule({
      imports: [SavedQueriesPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        // The page hosts the Export card, which reaches the provider through
        // ExportService. `useValue` rather than `useClass`: F-20 records the DI
        // deprecation an inherited @Injectable trips.
        { provide: MACRO_DATA, useValue: new FixtureMacroDataProvider() },
        { provide: SUPABASE_CLIENT, useValue: null },
        { provide: SESSION_STORAGE, useValue: null },
        { provide: SAVED_QUERY_STORAGE, useValue: null },
        SavedQueryStore,
        WorkingQueryStore,
        LastResultMeta
      ]
    });

    httpMock = TestBed.inject(HttpTestingController);
    store = TestBed.inject(WorkingQueryStore);
    store.reset();
    observed = TestBed.inject(LastResultMeta);
    fixture = TestBed.createComponent(SavedQueriesPage);

    TestBed.inject(SessionStore).signIn({
      email: 'thandi@example.com',
      fullName: 'Thandi',
      organisation: 'Treasury Risk',
      role: 'Member'
    });
    fixture.detectChanges();

    if (list !== null) {
      httpMock.expectOne({ method: 'GET', url: SAVED_QUERIES_URL }).flush({ data: list });
      await settle();
      fixture.detectChanges();
    }
  }

  /** Answers the pending save as the API would, stamping the server's time. */
  async function answerSave(savedAt = '2026-06-01T00:00:00.000Z'): Promise<void> {
    const request = httpMock.expectOne({ method: 'PUT', url: SAVED_QUERIES_URL });
    request.flush({ data: { ...request.request.body, savedAt } });
    await settle();
    fixture.detectChanges();
  }

  /** Refuses the pending save. */
  async function refuseSave(): Promise<void> {
    httpMock
      .expectOne({ method: 'PUT', url: SAVED_QUERIES_URL })
      .flush(
        { error: 'Saved queries could not be reached.' },
        { status: 502, statusText: 'Bad Gateway' }
      );
    await settle();
    fixture.detectChanges();
  }

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

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

  /** The settled meta a result would have carried for the given vintage ids. */
  function meta(ids: readonly number[]): EnvelopeMeta {
    return {
      page: 1,
      pageSize: 25,
      totalCount: 56,
      vintages: ids.map((id) => ({ id, source: 'IMF_WEO' as const, label: `V${id}` })),
      attribution: []
    };
  }

  /** A sendable query whose result has been seen, so saving records ids. */
  function sendableWithResult(ids: number[] = [12]): void {
    store.addIndicator('GDP_GROWTH_REAL');
    observed.record(store.query(), meta(ids));
    fixture.detectChanges();
  }

  describe('the table', () => {
    it('says so when nothing has been saved, rather than showing an empty table', async () => {
      await setUp();

      expect(states().some((text) => text.includes('No saved queries yet'))).toBeTrue();
      expect(el().querySelector('tbody')).toBeNull();
    });

    it('renders the four columns from the saved entry', async () => {
      await setUp([entry()]);

      expect(rows().length).toBe(1);
      expect(cells(rows()[0]).slice(0, 4)).toEqual([
        'Q4 2025 ECL — ZAF, NAM',
        '3 ind × 2 ctry · 2018–2030',
        'pinned id 12',
        '2025-10-14'
      ]);
    });

    it('lists newest first, as the store hands them over', async () => {
      await setUp([
        entry({ name: 'newer', savedAt: '2026-05-02T00:00:00.000Z' }),
        entry({ name: 'older', savedAt: '2025-10-14T00:00:00.000Z' })
      ]);

      expect(rows().map((row) => cells(row)[0])).toEqual(['newer', 'older']);
    });
  });

  describe('Load', () => {
    it('applies the saved query verbatim, including its own vintage', async () => {
      await setUp([entry()]);
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

    it('replaces whatever was there, rather than merging into it', async () => {
      await setUp([entry({ query: query({ indicators: ['ONLY_THIS'] }) })]);
      store.addIndicator('LEFTOVER');
      store.addCountry('ZWE');

      loadButton(rows()[0])?.click();
      fixture.detectChanges();

      expect(store.query().indicators).toEqual(['ONLY_THIS']);
      expect(store.query().countries).toEqual([]);
    });

    it('returns to page 1, because a saved page describes a result that is gone', async () => {
      await setUp([entry()]);
      store.setPage(4);

      loadButton(rows()[0])?.click();
      fixture.detectChanges();

      expect(store.query().page).toBe(1);
    });

    it('confirms what it loaded', async () => {
      await setUp([entry()]);
      loadButton(rows()[0])?.click();
      fixture.detectChanges();

      expect(states().some((text) => text.includes('Loaded'))).toBeTrue();
    });
  });

  describe('Reproduce', () => {
    it('applies the query with the recorded id pinned', async () => {
      await setUp([entry({ query: query({ indicators: ['A'], vintage: 'latest' }), vintageIds: [12] })]);
      reproduceButton(rows()[0])?.click();
      fixture.detectChanges();

      // Saved as `latest`; reproducing pins the id that answered it.
      expect(store.query().vintage).toBe(12);
      expect(store.query().indicators).toEqual(['A']);
    });

    it('is disabled with a reason when no ids were recorded', async () => {
      await setUp([entry({ vintageIds: [] })]);
      const button = reproduceButton(rows()[0]);

      expect(button?.disabled).toBeTrue();
      expect(button?.getAttribute('title')).toContain('nothing to pin');
    });

    it('is disabled with a reason when the result drew on two vintages', async () => {
      await setUp([entry({ vintageIds: [2, 12] })]);
      const button = reproduceButton(rows()[0]);

      expect(button?.disabled).toBeTrue();
      expect(button?.getAttribute('title')).toContain('more than one vintage');
    });

    it('names the reason to assistive technology, not only in a tooltip', async () => {
      await setUp([entry({ vintageIds: [] })]);
      const button = reproduceButton(rows()[0]);
      const describedBy = button?.getAttribute('aria-describedby');

      expect(describedBy).toBeTruthy();
      expect(el().querySelector(`#${CSS.escape(describedBy as string)}`)?.textContent).toContain(
        'nothing to pin'
      );
    });

    it('does nothing when clicked while disabled', async () => {
      await setUp([entry({ vintageIds: [2, 12] })]);
      const before = store.query();

      reproduceButton(rows()[0])?.click();
      fixture.detectChanges();

      expect(store.query()).toBe(before);
    });
  });

  describe('saving', () => {
    it('refuses a blank name, and says why', async () => {
      await setUp();
      sendableWithResult();

      expect(saveButton()?.disabled).toBeTrue();
      expect(states().some((text) => text.includes('Name the query'))).toBeTrue();
    });

    it('refuses an unsendable query, and says why', async () => {
      await setUp();
      type('Named but empty');

      expect(saveButton()?.disabled).toBeTrue();
      expect(states().some((text) => text.includes('at least one indicator'))).toBeTrue();
    });

    it('saves the current query with the ids observed for it', async () => {
      await setUp();
      sendableWithResult([12]);
      type('Q1 2026 ECL');

      expect(saveButton()?.disabled).toBeFalse();
      saveButton()?.click();
      await answerSave();

      expect(rows().length).toBe(1);
      expect(cells(rows()[0])[0]).toBe('Q1 2026 ECL');
      expect(TestBed.inject(SavedQueryStore).saved()[0].vintageIds).toEqual([12]);
    });

    it('clears the name and confirms, naming the ids it recorded', async () => {
      await setUp();
      sendableWithResult([12]);
      type('Q1 2026 ECL');
      saveButton()?.click();
      await answerSave();

      expect(nameInput()?.value).toBe('');
      expect(states().some((text) => text.includes('vintage id 12'))).toBeTrue();
    });

    it('warns before saving when no result for this query has been seen', async () => {
      await setUp();
      store.addIndicator('GDP_GROWTH_REAL');
      fixture.detectChanges();
      type('Unseen');

      expect(states().some((text) => text.includes('no vintage ids'))).toBeTrue();
    });

    it('records no ids when the query changed after its result arrived', async () => {
      await setUp();
      sendableWithResult([12]);
      // The guard: the observed ids belong to the query that produced them.
      store.setYearRange(1990, 1995);
      fixture.detectChanges();
      type('Edited after the answer');
      saveButton()?.click();
      await answerSave();

      expect(TestBed.inject(SavedQueryStore).saved()[0].vintageIds).toEqual([]);
      expect(states().some((text) => text.includes('no vintage ids'))).toBeTrue();
    });

    it('replaces an entry saved under the same name', async () => {
      await setUp();
      sendableWithResult([12]);
      type('Same name');
      saveButton()?.click();
      await answerSave();

      store.addCountry('ZAF');
      observed.record(store.query(), meta([2]));
      fixture.detectChanges();
      type('Same name');
      saveButton()?.click();
      await answerSave();

      expect(rows().length).toBe(1);
      expect(TestBed.inject(SavedQueryStore).saved()[0].query.countries).toEqual(['ZAF']);
    });
  });

  describe('loading', () => {
    it('says it is loading until the account answers, with Save closed', async () => {
      await setUp(null);
      store.addIndicator('GDP_GROWTH_REAL');
      fixture.detectChanges();
      type('Too early');

      expect(states()).toContain('Loading saved queries…');
      expect(el().querySelector('tbody')).toBeNull();
      expect(states().some((text) => text.includes('No saved queries yet'))).toBeFalse();
      expect(saveButton()?.disabled).toBeTrue();

      httpMock.expectOne(SAVED_QUERIES_URL).flush({ data: [] });
      await settle();
    });

    it('says so when the list cannot be loaded, rather than claiming it is empty', async () => {
      await setUp(null);
      httpMock
        .expectOne(SAVED_QUERIES_URL)
        .flush({ error: 'no' }, { status: 502, statusText: 'Bad Gateway' });
      await settle();
      fixture.detectChanges();

      expect(states()).toContain('Could not load saved queries.');
      expect(states().some((text) => text.includes('No saved queries yet'))).toBeFalse();
      expect(saveButton()?.disabled).toBeTrue();
    });
  });

  describe('when a save fails', () => {
    it('keeps the name, says so and lists nothing new', async () => {
      await setUp();
      sendableWithResult([12]);
      type('Rejected');
      saveButton()?.click();
      await refuseSave();

      expect(states()).toContain('Could not save the query. Try again.');
      expect(nameInput()?.value).toBe('Rejected');
      expect(el().querySelector('tbody')).toBeNull();
    });

    it('closes Save while a save is in flight, so one click is one write', async () => {
      await setUp();
      sendableWithResult([12]);
      type('Once');
      saveButton()?.click();
      fixture.detectChanges();

      expect(saveButton()?.disabled).toBeTrue();
      await answerSave();
      expect(rows().length).toBe(1);
    });

    it('lets the next attempt through once the name is edited', async () => {
      await setUp();
      sendableWithResult([12]);
      type('Rejected');
      saveButton()?.click();
      await refuseSave();
      expect(saveButton()?.disabled).toBeTrue();

      // Editing the name is the retry gesture: without it the card latches,
      // because the write that would clear the flag is the one it prevents.
      type('Rejected again');

      expect(saveButton()?.disabled).toBeFalse();
      saveButton()?.click();
      await answerSave();

      expect(rows().length).toBe(1);
      expect(cells(rows()[0])[0]).toBe('Rejected again');
      expect(states()).not.toContain('Could not save the query. Try again.');
    });

    it('re-reports a second refusal rather than staying quiet', async () => {
      await setUp();
      sendableWithResult([12]);
      type('First');
      saveButton()?.click();
      await refuseSave();

      // Still refusing. Clearing on edit must not hide a problem that persists.
      type('Second');
      saveButton()?.click();
      await refuseSave();

      expect(states()).toContain('Could not save the query. Try again.');
      expect(el().querySelector('tbody')).toBeNull();
    });
  });
});
