import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';

import { FixtureMacroDataProvider } from '../core/fixtures/fixture-macro-data.provider';
import { FIXTURE_REVISIONS, FIXTURE_VINTAGES } from '../core/fixtures/macro-fixtures';
import { MacroRequestError } from '../core/http/macro-error';
import type { Envelope, Revision, Vintage } from '../core/macro-contracts';
import { MACRO_DATA, type MacroDataProvider } from '../core/macro-data.provider';
import { VintagesPage } from './vintages';

function envelope<T>(data: readonly T[], totalCount = data.length): Envelope<T> {
  return {
    data: [...data],
    meta: { page: 1, pageSize: 25, totalCount, vintages: [], attribution: [] }
  };
}

/** Returns the vintages in the wrong order, to prove the page sorts them. */
class ShuffledVintages extends FixtureMacroDataProvider {
  override vintages(): Observable<Envelope<Vintage>> {
    return of(envelope([...FIXTURE_VINTAGES].sort((a, b) => a.id - b.id)));
  }
}

class NoVintages extends FixtureMacroDataProvider {
  override vintages(): Observable<Envelope<Vintage>> {
    return of(envelope<Vintage>([]));
  }
}

class FailingVintages extends FixtureMacroDataProvider {
  override vintages(): Observable<Envelope<Vintage>> {
    return throwError(() => new MacroRequestError(400, 'Unknown source code: NOPE.'));
  }
}

class FailingRevisions extends FixtureMacroDataProvider {
  override revisions(): Observable<Envelope<Revision>> {
    return throwError(() => new MacroRequestError(400, 'Unknown vintage id: 99.'));
  }
}

class SilentRevisions extends FixtureMacroDataProvider {
  override revisions(): Observable<Envelope<Revision>> {
    return throwError(() => new MacroRequestError(500, null));
  }
}

class NoRevisions extends FixtureMacroDataProvider {
  override revisions(): Observable<Envelope<Revision>> {
    return of(envelope<Revision>([]));
  }
}

/** Records what was asked for, so "no request until selected" can be asserted. */
class CountingProvider extends FixtureMacroDataProvider {
  calls: { vintageId: number; page: number | undefined }[] = [];

  override revisions(
    ...args: Parameters<MacroDataProvider['revisions']>
  ): Observable<Envelope<Revision>> {
    this.calls.push({ vintageId: args[0], page: args[1]?.page });
    return of(envelope(FIXTURE_REVISIONS, 300));
  }
}

describe('VintagesPage', () => {
  let fixture: ComponentFixture<VintagesPage>;

  function setUp(provider: unknown = new FixtureMacroDataProvider()): void {
    TestBed.configureTestingModule({
      imports: [VintagesPage],
      providers: [{ provide: MACRO_DATA, useValue: provider }]
    });
    fixture = TestBed.createComponent(VintagesPage);
    fixture.detectChanges();
  }

  afterEach(() => TestBed.resetTestingModule());

  const el = () => fixture.nativeElement as HTMLElement;
  const vintageRows = () => Array.from(el().querySelectorAll('.vintages tbody tr'));
  const idButtons = () =>
    Array.from(el().querySelectorAll<HTMLButtonElement>('.vintages .linklike'));
  const revisionRows = () => Array.from(el().querySelectorAll('.revisions tbody tr'));
  const states = () =>
    Array.from(el().querySelectorAll('[role="status"]')).map((n) => n.textContent?.trim() ?? '');

  function selectVintage(id: number): void {
    const button = idButtons().find((b) => b.textContent?.trim() === String(id));
    if (button === undefined) {
      throw new Error(`no vintage row for id ${id}`);
    }
    button.click();
    fixture.detectChanges();
  }

  // ---------- step 3: published vintages ----------

  describe('the published vintages table', () => {
    it('renders every vintage newest first, whatever order arrived', () => {
      setUp(new ShuffledVintages());

      expect(vintageRows().length).toBe(FIXTURE_VINTAGES.length);
      expect(idButtons().map((b) => b.textContent?.trim())).toEqual(['14', '13', '12', '11', '9']);
    });

    it('renders the six documented columns', () => {
      setUp();
      const headers = Array.from(el().querySelectorAll('.vintages thead th')).map((th) =>
        th.textContent?.trim()
      );

      expect(headers).toEqual([
        'id',
        'Label',
        'Source',
        'sourceVersion',
        'retrievedAtUtc',
        'isLatest'
      ]);
    });

    it('reads the pill from isLatest', () => {
      setUp();
      const pills = Array.from(el().querySelectorAll('.vintages .pill')).map((p) =>
        p.textContent?.trim()
      );

      expect(pills).toEqual(['Latest', 'Latest', 'Superseded', 'Superseded', 'Superseded']);
    });

    it('renders retrievedAtUtc verbatim, without parsing it as a date', () => {
      setUp();
      const stamps = Array.from(el().querySelectorAll('.vintages .stamp')).map((td) =>
        td.textContent?.trim()
      );

      // The value has no zone designator; `new Date(...)` would read it as local
      // time and render something else entirely.
      expect(stamps[0]).toBe(FIXTURE_VINTAGES[0].retrievedAtUtc);
    });

    it('selects through a real button, so it is keyboard reachable', () => {
      setUp();

      expect(idButtons()[0].tagName).toBe('BUTTON');
      expect(idButtons()[0].getAttribute('aria-pressed')).toBe('false');

      selectVintage(14);

      expect(idButtons()[0].getAttribute('aria-pressed')).toBe('true');
      expect(vintageRows()[0].classList).toContain('selected');
    });

    it('says so when no vintages are published, rather than showing an empty table', () => {
      setUp(new NoVintages());

      expect(states()).toContain('No vintages have been published yet.');
      expect(el().querySelector('.vintages tbody')).toBeNull();
    });

    it('surfaces the service explanation when the list fails', () => {
      setUp(new FailingVintages());

      expect(states()).toContain('Unknown source code: NOPE.');
      expect(el().querySelector('.vintages tbody')).toBeNull();
    });
  });

  // ---------- step 4: the revisions panel ----------

  describe('the revisions panel', () => {
    it('requests nothing until a vintage is selected', () => {
      const provider = new CountingProvider();
      setUp(provider);

      expect(provider.calls.length).toBe(0);
      expect(states()).toContain('Select a vintage above to see what it changed.');
      expect(revisionRows().length).toBe(0);
    });

    it('requests the selected vintage once chosen', () => {
      const provider = new CountingProvider();
      setUp(provider);
      selectVintage(13);

      expect(provider.calls.length).toBe(1);
      expect(provider.calls[0].vintageId).toBe(13);
    });

    it('names the predecessor as the nearest earlier vintage of the same source', () => {
      setUp();
      selectVintage(13);

      // WDI 13 is compared against WDI 11, stepping over WEO 12.
      expect(el().querySelector('.revisions .card-head .meta')?.textContent?.trim()).toBe(
        'vs WDI 2025-09-19'
      );
    });

    it('says there is none when the vintage is its source earliest', () => {
      setUp();
      selectVintage(9);

      expect(el().querySelector('.revisions .card-head .meta')?.textContent?.trim()).toBe(
        'no earlier IMF_WEO vintage to compare against'
      );
    });

    it('renders the derived threshold note beside the toggle', () => {
      setUp();
      selectVintage(13);

      const note = el().querySelector('.revisions .note')?.textContent?.trim();
      expect(note).toContain('10%');
      expect(note).toContain('0.5');
    });

    it('renders a row per revision with a signed change', () => {
      setUp();
      selectVintage(13);

      expect(revisionRows().length).toBe(FIXTURE_REVISIONS.length);

      const changes = Array.from(el().querySelectorAll('.revisions .change')).map((td) =>
        td.textContent?.trim()
      );
      expect(changes).toContain('-179.0');
      expect(changes).toContain('+89.0');
    });

    it('colours the direction of a change', () => {
      setUp();
      selectVintage(13);

      const down = el().querySelector('.revisions .change.down');
      const up = el().querySelector('.revisions .change.up');

      expect(down?.textContent?.trim()?.startsWith('-')).toBeTrue();
      expect(up?.textContent?.trim()?.startsWith('+')).toBeTrue();
    });

    it('renders an em dash and no pill when a side is missing', () => {
      setUp();
      selectVintage(13);

      const appearedRow = revisionRows().find((row) =>
        row.querySelector('.code')?.textContent?.includes('LENDING_RATE')
      );

      expect(appearedRow?.querySelector('.change')?.textContent?.trim()).toBe('—');
      expect(appearedRow?.querySelector('.pill.significant')).toBeNull();
    });

    it('flags only the rows that clear a threshold', () => {
      setUp();
      selectVintage(13);

      const flagged = revisionRows().filter((row) => row.querySelector('.pill.significant'));

      // Neither the under-threshold row nor the exactly-on-threshold row.
      expect(flagged.length).toBeLessThan(revisionRows().length);
      expect(flagged.length).toBeGreaterThan(0);
    });

    it('filters to significant rows and back', () => {
      setUp();
      selectVintage(13);
      const all = revisionRows().length;

      const toggle = el().querySelector<HTMLButtonElement>('.revisions-controls button');
      toggle?.click();
      fixture.detectChanges();

      const filtered = revisionRows().length;
      expect(filtered).toBeLessThan(all);
      expect(revisionRows().every((row) => row.querySelector('.pill.significant'))).toBeTrue();
      expect(toggle?.getAttribute('aria-pressed')).toBe('true');

      toggle?.click();
      fixture.detectChanges();

      expect(revisionRows().length).toBe(all);
    });

    it('reports a vintage that changed nothing', () => {
      setUp(new NoRevisions());
      selectVintage(13);

      expect(states()).toContain('This vintage changed no values against its predecessor.');
    });

    it('surfaces the problem detail when revisions fail', () => {
      setUp(new FailingRevisions());
      selectVintage(13);

      expect(states()).toContain('Unknown vintage id: 99.');
    });

    it('falls back to its own wording when the error carries no detail', () => {
      setUp(new SilentRevisions());
      selectVintage(13);

      expect(states()).toContain('Revisions are unavailable.');
    });
  });

  // ---------- paging ----------

  describe('paging', () => {
    it('pages through meta.totalCount', () => {
      const provider = new CountingProvider();
      setUp(provider);
      selectVintage(13);

      // 300 rows at 25 a page.
      const strip = el().querySelector('.paging-state')?.textContent?.replace(/\s+/g, ' ').trim();
      expect(strip).toContain('Page 1 of 12');

      el().querySelector<HTMLButtonElement>('button[aria-label="Next page"]')?.click();
      fixture.detectChanges();

      expect(provider.calls[provider.calls.length - 1].page).toBe(2);
      expect(
        el().querySelector('.paging-state')?.textContent?.replace(/\s+/g, ' ').trim()
      ).toContain('Page 2 of 12');
    });

    it('returns to page 1 when a different vintage is selected', () => {
      const provider = new CountingProvider();
      setUp(provider);
      selectVintage(13);

      el().querySelector<HTMLButtonElement>('button[aria-label="Next page"]')?.click();
      fixture.detectChanges();
      expect(provider.calls[provider.calls.length - 1].page).toBe(2);

      selectVintage(11);

      expect(provider.calls[provider.calls.length - 1].page).toBe(1);
      expect(provider.calls[provider.calls.length - 1].vintageId).toBe(11);
    });

    it('names the vintage under examination in the footer', () => {
      setUp(new CountingProvider());
      selectVintage(13);

      expect(el().querySelector('.paging-state')?.textContent).toContain('WDI 2026-03-27');
    });
  });

  // ---------- step 5: the summary strip ----------

  describe('the summary strip', () => {
    it('lists the series the vintage added, as code, country and year span', () => {
      setUp();
      selectVintage(13);

      const appeared = Array.from(el().querySelectorAll('.summary-entry.appeared')).map((p) =>
        p.textContent?.trim()
      );

      expect(appeared).toEqual(['LENDING_RATE · MUS · 2010–2024']);
    });

    it('lists the series it dropped, collapsing a single year', () => {
      setUp();
      selectVintage(13);

      const disappeared = Array.from(el().querySelectorAll('.summary-entry.disappeared')).map(
        (p) => p.textContent?.trim()
      );

      expect(disappeared).toEqual(['REER_INDEX · ZMB · 2021']);
    });

    it('labels the panels as page-scoped, because the route pages revisions', () => {
      setUp();
      selectVintage(13);

      const titles = Array.from(el().querySelectorAll('.summary-title')).map((p) =>
        p.textContent?.trim()
      );

      expect(titles[0]).toContain('this page');
      expect(titles[1]).toContain('this page');
    });

    it('reads None when a panel has no entries', () => {
      // A page with an ordinary change and nothing added or dropped. Asserting
      // this against a vintage that changed nothing would only prove the strip
      // is hidden, which is a different behaviour wearing this test's name.
      class OnlyChanges extends FixtureMacroDataProvider {
        override revisions(): Observable<Envelope<Revision>> {
          return of(
            envelope<Revision>([
              {
                indicator: 'GDP_GROWTH_REAL',
                country: 'ZAF',
                year: 2024,
                previousValue: 10,
                newValue: 12
              }
            ])
          );
        }
      }

      setUp(new OnlyChanges());
      selectVintage(13);

      const nones = Array.from(el().querySelectorAll('.summary-none')).map((p) =>
        p.textContent?.trim()
      );
      expect(nones).toEqual(['None', 'None']);
      expect(el().querySelectorAll('.summary-entry').length).toBe(0);
    });

    it('hides the whole strip when the vintage changed nothing', () => {
      setUp(new NoRevisions());
      selectVintage(13);

      expect(el().querySelector('.summary')).toBeNull();
    });

    it('caps the list and counts the remainder truthfully', () => {
      class ManyAppeared extends FixtureMacroDataProvider {
        override revisions(): Observable<Envelope<Revision>> {
          const rows: Revision[] = Array.from({ length: 9 }, (_, index) => ({
            indicator: `IND_${index}`,
            country: 'ZAF',
            year: 2020,
            previousValue: null,
            newValue: 1
          }));
          return of(envelope(rows));
        }
      }

      setUp(new ManyAppeared());
      selectVintage(13);

      expect(el().querySelectorAll('.summary-entry.appeared').length).toBe(5);
      expect(el().querySelector('.summary-more')?.textContent?.trim()).toBe(
        '+4 more on this page'
      );
    });
  });
});
