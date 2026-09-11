import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, combineLatest, map, of } from 'rxjs';

import { macroErrorMessage } from '../core/http/macro-error';
import { MACRO_DATA } from '../core/macro-data.provider';

interface Counts {
  countries: number;
  indicators: number;
  vintages: number;
}

type CountsState =
  | { status: 'ready'; counts: Counts }
  | { status: 'unavailable'; message: string };

/** Shown when the service failed without explaining itself. */
const COUNTS_UNAVAILABLE = 'Counts unavailable';

@Component({
  selector: 'app-overview',
  imports: [RouterLink],
  templateUrl: './overview.html',
  styleUrl: './overview.scss'
})
export class OverviewPage {
  private readonly macro = inject(MACRO_DATA);

  /**
   * The three counts load together. Any one failing puts the whole stat card in
   * the unavailable state: three separate error messages inside one card reads
   * as noise, and the page stays useful without the numbers.
   *
   * Counts read `meta.totalCount`, never `data.length`. `data` is a single page
   * of 500, so once feature 8 wires the real service a length-based count would
   * silently under-report the non-curated catalogue.
   */
  private readonly state = toSignal<CountsState | null>(
    combineLatest({
      countries: this.macro.countries(),
      indicators: this.macro.indicators({ curated: true }),
      vintages: this.macro.vintages()
    }).pipe(
      map(({ countries, indicators, vintages }): CountsState => ({
        status: 'ready',
        counts: {
          countries: countries.meta.totalCount,
          indicators: indicators.meta.totalCount,
          vintages: vintages.meta.totalCount
        }
      })),
      catchError((error: unknown) =>
        of<CountsState>({
          status: 'unavailable',
          message: macroErrorMessage(error, COUNTS_UNAVAILABLE)
        })
      )
    ),
    { initialValue: null }
  );

  protected readonly loading = computed(() => this.state() === null);
  protected readonly unavailable = computed(() => this.state()?.status === 'unavailable');

  /**
   * Any one of the three requests failing puts the card in this state, so the
   * detail shown is the first failure's explanation. `combineLatest` errors on
   * the first error, which is the one worth reporting.
   */
  protected readonly unavailableMessage = computed(() => {
    const state = this.state();
    return state?.status === 'unavailable' ? state.message : COUNTS_UNAVAILABLE;
  });

  protected readonly counts = computed(() => {
    const state = this.state();
    return state?.status === 'ready' ? state.counts : null;
  });

  /** Editorial copy about the service, not API data. Taken from the design. */
  protected readonly properties = [
    {
      claim: 'You never hit the IMF or World Bank',
      consequence: 'Upstream outages never affect reads'
    },
    {
      claim: 'Data is annual',
      consequence: 'One value per indicator, country, year'
    },
    {
      claim: 'Published data is immutable',
      consequence: 'New releases create a new vintage'
    }
  ] as const;

  protected readonly cadence = [
    {
      code: 'IMF_WEO',
      name: 'IMF World Economic Outlook',
      contributes: 'History and staff forecasts, ~145 factors',
      updated: 'Updated April and October'
    },
    {
      code: 'WB_WDI',
      name: 'World Bank WDI',
      contributes: 'Realised history, 10 core indicators',
      updated: 'Updated a few times a year'
    }
  ] as const;

  protected readonly useCases = [
    {
      icon: '↗',
      title: 'IFRS 9 forward-looking information',
      body:
        'Take the WEO forecast path, GDP growth, inflation, unemployment, as scenario ' +
        'input to expected-credit-loss models.',
      action: 'Open series explorer',
      route: '/series'
    },
    {
      icon: '▦',
      title: 'Benchmarking and dashboards',
      body:
        'History plus forecast series for any country, grouped one object per ' +
        'indicator and country, chart-ready.',
      action: 'Browse the catalogue',
      route: '/countries-indicators'
    },
    {
      icon: '↻',
      title: 'Reproducible reporting',
      body:
        'Re-fetch exactly the numbers that were current at a past reporting date by ' +
        'pinning the vintage you recorded.',
      action: 'Inspect vintages',
      route: '/vintages'
    }
  ] as const;
}
