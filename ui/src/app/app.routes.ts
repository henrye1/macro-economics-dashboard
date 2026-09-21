import { Routes } from '@angular/router';

import { CountriesIndicatorsPage } from './countries-indicators/countries-indicators';
import { ObservationsPage } from './observations/observations';
import { OverviewPage } from './overview/overview';
import { RequestBuilderPage } from './request-builder/request-builder';
import { SavedQueriesPage } from './saved-queries/saved-queries';
import { SeriesPage } from './series/series';
import { ConsoleShell } from './shell/console-shell';
import { VintagesPage } from './vintages/vintages';

/**
 * The seven tabs hang off a pathless parent that supplies the console chrome,
 * so no URL gains a segment and a future layout can sit beside this one rather
 * than inside it.
 */
export const routes: Routes = [
  {
    path: '',
    component: ConsoleShell,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'overview' },
      { path: 'overview', component: OverviewPage },
      { path: 'countries-indicators', component: CountriesIndicatorsPage },
      { path: 'series', component: SeriesPage },
      { path: 'observations', component: ObservationsPage },
      { path: 'vintages', component: VintagesPage },
      { path: 'saved-queries', component: SavedQueriesPage },
      { path: 'request-builder', component: RequestBuilderPage }
    ]
  },
  // No 404 page in the MVP scope, so an unknown path lands on Overview.
  { path: '**', redirectTo: 'overview' }
];
