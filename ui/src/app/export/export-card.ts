import { Component, computed, inject, signal } from '@angular/core';

import { LastResultMeta } from '../core/last-result-meta';
import {
  DEFAULT_EXPORT_FORMAT,
  EXPORT_FORMATS,
  type ExportFormat,
  type ExportFormatSpec,
  exportFormatSpec
} from '../core/export/export-format';
import { ExportService } from '../core/export/export.service';
import { WorkingQueryStore } from '../core/working-query.store';

/**
 * The Export card: format, pinning, a row count, and the download.
 *
 * It owns no result of its own. The row count comes from the meta the result
 * tabs recorded for exactly this query, and the file comes from a request the
 * service makes when the button is pressed. That separation is deliberate: the
 * count describes a result the user has seen, and the file describes the whole
 * result, and conflating them is what would produce a download of 25 rows
 * labelled 56.
 */
@Component({
  selector: 'app-export-card',
  templateUrl: './export-card.html',
  styleUrl: './export-card.scss'
})
export class ExportCard {
  private readonly store = inject(WorkingQueryStore);
  private readonly exports = inject(ExportService);
  private readonly lastResult = inject(LastResultMeta);

  protected readonly formats = EXPORT_FORMATS;
  protected readonly format = signal<ExportFormat>(DEFAULT_EXPORT_FORMAT);
  protected readonly pinVintages = signal(true);

  protected readonly busy = this.exports.busy;

  /** The last attempt's message, cleared when any control changes. */
  protected readonly message = signal<string | null>(null);

  protected selectFormat(spec: ExportFormatSpec): void {
    if (!spec.available) {
      return;
    }

    this.format.set(spec.format);
    this.message.set(null);
  }

  protected isSelected(spec: ExportFormatSpec): boolean {
    return this.format() === spec.format;
  }

  protected togglePin(): void {
    if (this.pinLocked()) {
      return;
    }

    this.pinVintages.update((on) => !on);
    this.message.set(null);
  }

  /**
   * JSON carries `meta.vintages` whatever the checkbox says, so for that format
   * the control renders checked and disabled rather than offering a choice the
   * file cannot honour.
   */
  protected readonly pinLocked = computed(() => this.format() === 'json');

  protected readonly pinChecked = computed(() => this.pinLocked() || this.pinVintages());

  protected readonly pinLockedReason =
    'A JSON export is the whole envelope, so it always carries meta.vintages.';

  protected readonly buttonLabel = computed(
    () => `Download ${exportFormatSpec(this.format()).label}`
  );

  protected readonly valid = computed(() => this.store.validation().valid);

  protected readonly canDownload = computed(() => this.valid() && !this.busy());

  protected readonly indicatorCount = computed(() => this.store.query().indicators.length);
  protected readonly countryCount = computed(() => this.store.query().countries.length);

  /**
   * The row count of the result this query produced, or null.
   *
   * Null whenever no result has settled for exactly this query. Rendering a
   * zero there would claim the query returns nothing; rendering the previous
   * query's count would claim a number this query never earned. The em dash is
   * the only honest answer, and the hint says how to fill it in.
   */
  protected readonly rowCount = computed<number | null>(
    () => this.lastResult.metaFor(this.store.query())?.totalCount ?? null
  );

  protected readonly scopeLine = computed(() => {
    const rows = this.rowCount();
    const countries =
      this.countryCount() === 0 ? 'all countries' : `${this.countryCount()} countries`;

    return `${rows === null ? '—' : rows.toLocaleString('en-GB')} rows · ${this.indicatorCount()} indicators · ${countries}`;
  });

  protected async download(): Promise<void> {
    if (!this.canDownload()) {
      return;
    }

    this.message.set(null);
    const outcome = await this.exports.download(this.format(), this.pinVintages());

    switch (outcome.status) {
      case 'saved':
        this.message.set(
          outcome.rows === 0
            ? 'Downloaded an empty file: this query returns no rows.'
            : `Downloaded ${outcome.rows.toLocaleString('en-GB')} rows.`
        );
        return;
      case 'too-large':
        this.message.set(
          `This result has ${outcome.totalCount.toLocaleString('en-GB')} rows and one export can carry ${outcome.limit.toLocaleString('en-GB')}. Narrow the years or the countries and try again.`
        );
        return;
      case 'invalid':
        this.message.set('Add at least one indicator before exporting.');
        return;
      case 'unavailable':
        this.message.set(outcome.message);
    }
  }

  /** Why the button is unavailable, or null when it is not. */
  protected readonly blockedReason = computed(() => {
    if (this.busy()) {
      return 'Building the file…';
    }

    return this.valid() ? null : 'Add at least one indicator before exporting.';
  });
}
