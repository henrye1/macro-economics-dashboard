import { Component, computed, input, output } from '@angular/core';

/**
 * The paging strip shared by the two result tabs.
 *
 * Purely presentational: it renders what it is told and reports intent. The page
 * owns the request, and `WorkingQueryStore.setPage` owns the state, so this
 * component never reaches for either.
 *
 * The disabled ends are derived rather than passed in. Every state with nothing
 * to page - empty, invalid, unavailable - reports page 1 of 1, so
 * `page > 1` and `page < pageCount` already answer it, and there is no second
 * source of truth to keep in step.
 */
@Component({
  selector: 'app-paging-footer',
  templateUrl: './paging-footer.html',
  styleUrl: './paging-footer.scss'
})
export class PagingFooter {
  readonly page = input.required<number>();
  readonly pageCount = input.required<number>();
  readonly pageSize = input.required<number>();

  /** Already-joined vintage labels, or an em dash when the result has none. */
  readonly vintageLabels = input.required<string>();

  readonly prev = output<void>();
  readonly next = output<void>();

  protected readonly canPrev = computed(() => this.page() > 1);
  protected readonly canNext = computed(() => this.page() < this.pageCount());

  protected goPrev(): void {
    if (this.canPrev()) {
      this.prev.emit();
    }
  }

  protected goNext(): void {
    if (this.canNext()) {
      this.next.emit();
    }
  }
}
