import { Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, debounceTime, distinctUntilChanged, map, of, switchMap } from 'rxjs';

import { macroErrorMessage } from '../core/http/macro-error';
import type { Country, Indicator, SourceCode } from '../core/macro-contracts';
import { MACRO_DATA } from '../core/macro-data.provider';
import { WorkingQueryStore } from '../core/working-query.store';

export const CATALOGUE_SEARCH_DEBOUNCE_MS = 250;

/** One page is plenty for the curated catalogue; see the spec's pagination note. */
const CATALOGUE_PAGE_SIZE = 500;

type Loaded<T> = { status: 'ready'; value: T } | { status: 'unavailable'; message: string };

/**
 * Shown when a request failed without explaining itself. Each half of this tab
 * keeps its own wording, because the point of the two messages is that one list
 * failing leaves the other usable.
 */
const COUNTRIES_UNAVAILABLE =
  'The country list is unavailable. The indicator catalogue is unaffected.';
const CATALOGUE_UNAVAILABLE =
  'The indicator catalogue is unavailable. The country list is unaffected.';

interface CatalogueResult {
  indicators: readonly Indicator[];
  total: number;
}

interface Filters {
  q: string;
  category: string;
  source: string;
}

/**
 * Countries and indicators.
 *
 * Note the deliberate asymmetry: indicator filtering is server-side because
 * `/api/macro/indicators` documents `q`, `category`, `source` and `curated`,
 * while country search is client-side because `/api/macro/countries` documents
 * no query parameters at all. Do not "fix" this into one approach.
 */
@Component({
  selector: 'app-countries-indicators',
  templateUrl: './countries-indicators.html',
  styleUrl: './countries-indicators.scss'
})
export class CountriesIndicatorsPage {
  private readonly macro = inject(MACRO_DATA);
  private readonly store = inject(WorkingQueryStore);

  protected readonly countrySearch = signal('');

  /** Raw text as typed. Feeds the debounced term below. */
  protected readonly queryInput = signal('');
  protected readonly category = signal('');
  protected readonly source = signal('');

  /**
   * Only the free-text term is debounced. The selects are discrete choices and
   * should take effect at once. `initialValue` keeps the first render immediate
   * rather than waiting out a debounce nobody triggered.
   */
  private readonly debouncedQuery = toSignal(
    toObservable(this.queryInput).pipe(
      debounceTime(CATALOGUE_SEARCH_DEBOUNCE_MS),
      distinctUntilChanged()
    ),
    { initialValue: '' }
  );

  private readonly filters = computed<Filters>(() => ({
    q: this.debouncedQuery(),
    category: this.category(),
    source: this.source()
  }));

  // ---------- countries: fetched once, searched locally ----------

  private readonly countriesState = toSignal<Loaded<readonly Country[]> | null>(
    this.macro.countries().pipe(
      map((envelope): Loaded<readonly Country[]> => ({
        status: 'ready',
        value: envelope.data
      })),
      catchError((error: unknown) =>
        of<Loaded<readonly Country[]>>({
          status: 'unavailable',
          message: macroErrorMessage(error, COUNTRIES_UNAVAILABLE)
        })
      )
    ),
    { initialValue: null }
  );

  protected readonly countriesLoading = computed(() => this.countriesState() === null);
  protected readonly countriesUnavailable = computed(
    () => this.countriesState()?.status === 'unavailable'
  );

  protected readonly countriesUnavailableMessage = computed(() => {
    const state = this.countriesState();
    return state?.status === 'unavailable' ? state.message : COUNTRIES_UNAVAILABLE;
  });

  protected readonly countries = computed(() => {
    const state = this.countriesState();
    if (state?.status !== 'ready') {
      return [];
    }

    const term = this.countrySearch().trim().toLowerCase();
    if (!term) {
      return state.value;
    }

    return state.value.filter(
      (country) =>
        country.name.toLowerCase().includes(term) || country.iso3.toLowerCase().includes(term)
    );
  });

  // ---------- categories: from the unfiltered catalogue ----------

  private readonly allIndicators = toSignal<Loaded<readonly Indicator[]> | null>(
    this.macro.indicators({ curated: true, pageSize: CATALOGUE_PAGE_SIZE }).pipe(
      map((envelope): Loaded<readonly Indicator[]> => ({
        status: 'ready',
        value: envelope.data
      })),
      // Feeds the category options only; it has no error slot of its own, so
      // the catalogue's wording is the right fallback for the same request.
      catchError((error: unknown) =>
        of<Loaded<readonly Indicator[]>>({
          status: 'unavailable',
          message: macroErrorMessage(error, CATALOGUE_UNAVAILABLE)
        })
      )
    ),
    { initialValue: null }
  );

  /** Distinct and sorted, so choosing a category never shrinks the option list. */
  protected readonly categories = computed(() => {
    const state = this.allIndicators();
    if (state?.status !== 'ready') {
      return [];
    }
    return [...new Set(state.value.map((indicator) => indicator.category))].sort();
  });

  protected readonly sources: readonly SourceCode[] = ['IMF_WEO', 'WB_WDI'];

  // ---------- catalogue: re-queried through the provider ----------

  private readonly catalogueState = toSignal<Loaded<CatalogueResult> | null>(
    toObservable(this.filters).pipe(
      distinctUntilChanged(
        (a, b) => a.q === b.q && a.category === b.category && a.source === b.source
      ),
      switchMap((filters) =>
        this.macro
          .indicators({
            curated: true,
            pageSize: CATALOGUE_PAGE_SIZE,
            ...(filters.q.trim() ? { q: filters.q.trim() } : {}),
            ...(filters.category ? { category: filters.category } : {}),
            ...(filters.source ? { source: filters.source as SourceCode } : {})
          })
          .pipe(
            map((envelope): Loaded<CatalogueResult> => ({
              status: 'ready',
              value: { indicators: envelope.data, total: envelope.meta.totalCount }
            })),
            catchError((error: unknown) =>
              of<Loaded<CatalogueResult>>({
                status: 'unavailable',
                message: macroErrorMessage(error, CATALOGUE_UNAVAILABLE)
              })
            )
          )
      )
    ),
    { initialValue: null }
  );

  protected readonly catalogueLoading = computed(() => this.catalogueState() === null);
  protected readonly catalogueUnavailable = computed(
    () => this.catalogueState()?.status === 'unavailable'
  );

  protected readonly catalogueUnavailableMessage = computed(() => {
    const state = this.catalogueState();
    return state?.status === 'unavailable' ? state.message : CATALOGUE_UNAVAILABLE;
  });

  protected readonly indicators = computed(() => {
    const state = this.catalogueState();
    return state?.status === 'ready' ? state.value.indicators : [];
  });

  /** The head count tracks the filters, so it never claims 13 while showing 2. */
  protected readonly indicatorTotal = computed(() => {
    const state = this.catalogueState();
    return state?.status === 'ready' ? state.value.total : 0;
  });

  /** Drives the wording of the empty state: no matches versus nothing to show. */
  protected readonly filtered = computed(() => {
    const { q, category, source } = this.filters();
    return q.trim() !== '' || category !== '' || source !== '';
  });

  // ---------- working query ----------

  protected readonly chosen = computed(() => this.store.query().indicators);

  protected isChosen(code: string): boolean {
    return this.chosen().includes(code);
  }

  /** Add only. Removal belongs to the chip in the working query card. */
  protected choose(code: string): void {
    this.store.addIndicator(code);
  }

  // ---------- input handlers ----------

  protected onCountrySearch(event: Event): void {
    this.countrySearch.set(readValue(event));
  }

  protected onQuery(event: Event): void {
    this.queryInput.set(readValue(event));
  }

  protected onCategory(event: Event): void {
    this.category.set(readValue(event));
  }

  protected onSource(event: Event): void {
    this.source.set(readValue(event));
  }

  protected sourceList(indicator: Indicator): string {
    return indicator.sources.map((entry) => entry.source).join(' · ');
  }
}

function readValue(event: Event): string {
  return (event.target as HTMLInputElement | HTMLSelectElement).value;
}
