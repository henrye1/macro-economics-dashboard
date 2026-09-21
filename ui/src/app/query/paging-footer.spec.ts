import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PagingFooter } from './paging-footer';

describe('PagingFooter', () => {
  let fixture: ComponentFixture<PagingFooter>;

  const el = () => fixture.nativeElement as HTMLElement;
  const buttons = () => Array.from(el().querySelectorAll<HTMLButtonElement>('button'));
  const prev = () => buttons()[0];
  const next = () => buttons()[1];
  const strip = () =>
    el().querySelector('.paging-state')?.textContent?.replace(/\s+/g, ' ').trim();

  /** Renders the footer for one page position. */
  function render(page: number, pageCount: number, vintageLabels = '—'): void {
    fixture = TestBed.createComponent(PagingFooter);
    fixture.componentRef.setInput('page', page);
    fixture.componentRef.setInput('pageCount', pageCount);
    fixture.componentRef.setInput('pageSize', 25);
    fixture.componentRef.setInput('vintageLabels', vintageLabels);
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [PagingFooter] });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('names the page, the page size and the vintages', () => {
    render(2, 3, 'WEO 10.0.0 2026-04-14');

    expect(strip()).toBe('Page 2 of 3 · pageSize 25 · vintages WEO 10.0.0 2026-04-14');
  });

  it('offers two real buttons with accessible labels', () => {
    render(1, 3);

    expect(buttons().length).toBe(2);
    expect(buttons().every((button) => button.tagName === 'BUTTON')).toBeTrue();
    expect(buttons().every((button) => button.type === 'button')).toBeTrue();
    expect(prev()?.getAttribute('aria-label')).toBe('Previous page');
    expect(next()?.getAttribute('aria-label')).toBe('Next page');
  });

  it('disables Prev on the first page', () => {
    render(1, 3);

    expect(prev()?.disabled).toBeTrue();
    expect(next()?.disabled).toBeFalse();
  });

  it('disables Next on the last page', () => {
    render(3, 3);

    expect(prev()?.disabled).toBeFalse();
    expect(next()?.disabled).toBeTrue();
  });

  it('disables both when there is a single page, which every empty state reports', () => {
    render(1, 1);

    expect(prev()?.disabled).toBeTrue();
    expect(next()?.disabled).toBeTrue();
  });

  it('emits next only while Next is enabled', () => {
    render(1, 3);

    let emitted = 0;
    fixture.componentInstance.next.subscribe(() => {
      emitted += 1;
    });

    next()?.click();
    expect(emitted).toBe(1);

    render(3, 3);
    fixture.componentInstance.next.subscribe(() => {
      emitted += 1;
    });

    next()?.click();
    expect(emitted).toBe(1);
  });

  it('emits prev only while Prev is enabled', () => {
    render(2, 3);

    let emitted = 0;
    fixture.componentInstance.prev.subscribe(() => {
      emitted += 1;
    });

    prev()?.click();
    expect(emitted).toBe(1);

    render(1, 3);
    fixture.componentInstance.prev.subscribe(() => {
      emitted += 1;
    });

    prev()?.click();
    expect(emitted).toBe(1);
  });
  // `.card-foot` is block by default in this design system; `.row` is the opt-in
  // that makes it a flex row, which is what pushes the controls to the right.
  // Losing the class was finding F-47, and the markup is the only part of that a
  // unit test can hold. The layout itself is proven in `ui/e2e/paging-footer.spec.ts`.
  it('opts the footer into the flex row its controls depend on', () => {
    render(1, 3);

    expect(
      fixture.nativeElement.querySelector('.card-foot')?.classList.contains('row')
    ).toBeTrue();
  });
});
