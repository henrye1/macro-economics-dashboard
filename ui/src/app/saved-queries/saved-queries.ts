import { Component, computed, inject, signal } from '@angular/core';

import { LastResultVintages } from '../core/last-result-vintages';
import {
  type SavedQuery,
  reproduceBlockedReason,
  reproduceTarget,
  savedDate,
  scopeLabel,
  vintageLabel
} from '../core/saved-query';
import { SavedQueryStore } from '../core/saved-query.store';
import { WorkingQueryStore } from '../core/working-query.store';

@Component({
  selector: 'app-saved-queries',
  templateUrl: './saved-queries.html',
  styleUrl: './saved-queries.scss'
})
export class SavedQueriesPage {
  private readonly store = inject(WorkingQueryStore);
  private readonly saved = inject(SavedQueryStore);
  private readonly observedVintages = inject(LastResultVintages);

  protected readonly entries = this.saved.saved;
  protected readonly isEmpty = this.saved.isEmpty;
  protected readonly storageProblem = this.saved.storageProblem;

  protected readonly name = signal('');

  /** The last save's confirmation, cleared by the next edit to the name. */
  protected readonly confirmation = signal<string | null>(null);

  protected setName(value: string): void {
    this.name.set(value);
    this.confirmation.set(null);
  }

  /**
   * Why saving is unavailable, or null when it is.
   *
   * An unsendable query can be saved in principle, but the entry would be one
   * nothing can run and whose vintage ids are necessarily empty, so the console
   * declines it the way the result tabs decline to request it.
   */
  protected readonly saveBlockedReason = computed(() => {
    if (this.storageProblem() !== null) {
      return this.storageProblem();
    }
    if (this.name().trim() === '') {
      return 'Name the query before saving it.';
    }
    if (!this.store.validation().valid) {
      return 'Add at least one indicator before saving this query.';
    }
    return null;
  });

  protected readonly canSave = computed(() => this.saveBlockedReason() === null);

  /**
   * The ids observed for the query as it stands now.
   *
   * Empty when no result has settled for exactly this query, which is the
   * honest answer: an entry saved before its answer arrived has no provenance
   * to claim.
   */
  private readonly idsForCurrent = computed(() =>
    this.observedVintages.idsFor(this.store.query())
  );

  protected readonly recordedCount = computed(() => this.idsForCurrent().length);

  protected save(): void {
    if (!this.canSave()) {
      return;
    }

    const name = this.name().trim();
    const ids = this.idsForCurrent();

    this.saved.save(name, this.store.query(), ids);

    if (this.storageProblem() !== null) {
      return;
    }

    this.name.set('');
    this.confirmation.set(
      ids.length === 0
        ? `Saved “${name}” with no vintage ids: no result for this query has been seen yet.`
        : `Saved “${name}” with ${ids.length === 1 ? 'vintage id' : 'vintage ids'} ${ids.join(', ')}.`
    );
  }

  /** Applies the query exactly as it was saved, including its own selector. */
  protected load(entry: SavedQuery): void {
    this.apply(entry, entry.query.vintage);
    this.confirmation.set(`Loaded “${entry.name}”.`);
  }

  /** Applies the query with the recorded vintage pinned, so it reproduces. */
  protected reproduce(entry: SavedQuery): void {
    const target = reproduceTarget(entry);
    if (target === null) {
      return;
    }

    this.apply(entry, target);
    this.confirmation.set(`Reproducing “${entry.name}” pinned to vintage id ${target}.`);
  }

  /**
   * Writes the saved query back through the store's own setters, so the one
   * guarded write path stays the only way the query changes.
   *
   * Paging is not restored: a saved page number describes a result that no
   * longer exists, and every setter here returns to page 1 anyway.
   */
  private apply(entry: SavedQuery, vintage: SavedQuery['query']['vintage']): void {
    const { query } = entry;

    this.store.reset();
    for (const code of query.indicators) {
      this.store.addIndicator(code);
    }
    for (const iso3 of query.countries) {
      this.store.addCountry(iso3);
    }
    this.store.setYearRange(query.yearFrom, query.yearTo);
    this.store.setSource(query.source);
    this.store.setForecast(query.forecast);
    this.store.setVintage(vintage);
  }

  protected scope(entry: SavedQuery): string {
    return scopeLabel(entry.query);
  }

  protected vintage(entry: SavedQuery): string {
    return vintageLabel(entry.query);
  }

  protected saved_(entry: SavedQuery): string {
    return savedDate(entry);
  }

  protected canReproduce(entry: SavedQuery): boolean {
    return reproduceTarget(entry) !== null;
  }

  protected reproduceReason(entry: SavedQuery): string | null {
    return reproduceBlockedReason(entry);
  }

  protected entryKey(entry: SavedQuery): string {
    return `${entry.name}|${entry.savedAt}`;
  }
}
