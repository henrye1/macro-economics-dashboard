import { Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, combineLatest, map, of } from 'rxjs';

import { macroErrorMessage } from '../core/http/macro-error';
import type { ForecastFilter, SourceFilter } from '../core/macro-contracts';
import { MACRO_DATA } from '../core/macro-data.provider';
import { WorkingQueryStore } from '../core/working-query.store';
import { yearOptions } from '../core/year-range';

interface Options {
  indicators: readonly string[];
  countries: readonly { iso3: string; name: string }[];
  vintages: readonly { value: string; label: string }[];
}

type OptionsState =
  | { status: 'ready'; options: Options }
  | { status: 'unavailable'; message: string };

/** Shown when the option lists failed without the service explaining itself. */
const OPTIONS_UNAVAILABLE =
  'Indicator, country and vintage lists are unavailable. The query below is still editable.';

const SOURCES: readonly SourceFilter[] = ['preferred', 'IMF_WEO', 'WB_WDI'];
const FORECASTS: readonly ForecastFilter[] = ['all', 'actual', 'forecast'];

/**
 * The working-query card. Mounted on Observations by feature 3; features 6 and
 * 12 mount the same component unchanged, so it takes no inputs and owns no
 * page-level layout.
 */
@Component({
  selector: 'app-working-query-card',
  imports: [RouterLink],
  templateUrl: './working-query-card.html',
  styleUrl: './working-query-card.scss'
})
export class WorkingQueryCard {
  private readonly macro = inject(MACRO_DATA);
  private readonly store = inject(WorkingQueryStore);

  protected readonly sources = SOURCES;
  protected readonly forecasts = FORECASTS;

  /**
   * The result phrase for the current tab, when the host has one - for example
   * `56 observations` or `4 series`.
   *
   * The host formats it, not the card. Observations and Series count different
   * things and pluralise differently ("series" is its own plural), and features
   * 10 and 12 will add more, so a per-tab numeric input would mean the card
   * growing a noun for every consumer. Optional and `null` by default, so a host
   * with no result mounts `<app-working-query-card />` with no bindings and gets
   * exactly the summary feature 3 shipped.
   */
  readonly resultSummary = input<string | null>(null);

  protected readonly query = this.store.query;
  protected readonly validation = this.store.validation;

  private readonly optionsState = toSignal<OptionsState | null>(
    combineLatest({
      countries: this.macro.countries(),
      indicators: this.macro.indicators({ curated: true }),
      vintages: this.macro.vintages()
    }).pipe(
      map(({ countries, indicators, vintages }): OptionsState => ({
        status: 'ready',
        options: {
          indicators: indicators.data.map((indicator) => indicator.code),
          countries: countries.data.map(({ iso3, name }) => ({ iso3, name })),
          vintages: vintages.data.map((vintage) => ({
            value: String(vintage.id),
            label: vintage.label
          }))
        }
      })),
      catchError((error: unknown) =>
        of<OptionsState>({
          status: 'unavailable',
          message: macroErrorMessage(error, OPTIONS_UNAVAILABLE)
        })
      )
    ),
    { initialValue: null }
  );

  protected readonly optionsLoading = computed(() => this.optionsState() === null);
  protected readonly optionsUnavailable = computed(
    () => this.optionsState()?.status === 'unavailable'
  );

  protected readonly optionsUnavailableMessage = computed(() => {
    const state = this.optionsState();
    return state?.status === 'unavailable' ? state.message : OPTIONS_UNAVAILABLE;
  });

  /** Only codes not already chosen, so the add-select never offers a duplicate. */
  protected readonly indicatorOptions = computed(() => {
    const state = this.optionsState();
    if (state?.status !== 'ready') {
      return [];
    }
    const chosen = this.query().indicators;
    return state.options.indicators.filter((code) => !chosen.includes(code));
  });

  protected readonly countryOptions = computed(() => {
    const state = this.optionsState();
    if (state?.status !== 'ready') {
      return [];
    }
    const chosen = this.query().countries;
    return state.options.countries.filter((country) => !chosen.includes(country.iso3));
  });

  protected readonly vintageOptions = computed(() => {
    const state = this.optionsState();
    return state?.status === 'ready' ? state.options.vintages : [];
  });

  /**
   * Recomputed from the query so a range loaded from a saved entry is always
   * selectable, even when it falls outside the console's default window.
   */
  protected readonly years = computed(() =>
    yearOptions([this.query().yearFrom, this.query().yearTo])
  );

  protected readonly invertedRange = computed(() =>
    this.validation().problems.includes('inverted-year-range')
  );

  protected readonly noIndicators = computed(() =>
    this.validation().problems.includes('no-indicators')
  );

  /**
   * The design's one-line description of the query, ending in the host's result
   * phrase when it has one.
   */
  protected readonly summary = computed(() => {
    const query = this.query();
    const parts = [
      `${query.indicators.length} ${plural(query.indicators.length, 'indicator')}`,
      `× ${query.countries.length} ${plural(query.countries.length, 'country', 'countries')}`
    ];

    const from = query.yearFrom;
    const to = query.yearTo;
    if (from !== null || to !== null) {
      parts.push(`· ${from ?? 'earliest'}–${to ?? 'latest'}`);
    }

    const result = this.resultSummary();
    if (result !== null) {
      parts.push(`· ${result}`);
    }

    return parts.join(' ');
  });

  protected addIndicator(event: Event): void {
    const code = readAndClear(event);
    if (code) {
      this.store.addIndicator(code);
    }
  }

  protected addCountry(event: Event): void {
    const iso3 = readAndClear(event);
    if (iso3) {
      this.store.addCountry(iso3);
    }
  }

  protected removeIndicator(code: string): void {
    this.store.removeIndicator(code);
  }

  protected removeCountry(iso3: string): void {
    this.store.removeCountry(iso3);
  }

  protected setYearFrom(event: Event): void {
    this.store.setYearRange(readYear(event), this.query().yearTo);
  }

  protected setYearTo(event: Event): void {
    this.store.setYearRange(this.query().yearFrom, readYear(event));
  }

  protected setSource(event: Event): void {
    this.store.setSource(readValue(event) as SourceFilter);
  }

  protected setForecast(event: Event): void {
    this.store.setForecast(readValue(event) as ForecastFilter);
  }

  protected setVintage(event: Event): void {
    const value = readValue(event);
    this.store.setVintage(value === 'latest' ? 'latest' : Number(value));
  }

  protected reset(): void {
    this.store.reset();
  }
}

function plural(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

function readValue(event: Event): string {
  return (event.target as HTMLSelectElement | HTMLInputElement).value;
}

/** Add-selects return to their placeholder after a choice. */
function readAndClear(event: Event): string {
  const select = event.target as HTMLSelectElement;
  const value = select.value;
  select.value = '';
  return value;
}

function readYear(event: Event): number | null {
  const raw = readValue(event).trim();
  if (raw === '') {
    return null;
  }
  const year = Number(raw);
  return Number.isFinite(year) ? Math.trunc(year) : null;
}
