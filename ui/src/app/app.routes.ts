import { Routes } from '@angular/router';

import { CountriesIndicatorsPage } from './countries-indicators/countries-indicators';
import { ObservationsPage } from './observations/observations';
import { OverviewPage } from './overview/overview';
import { RequestBuilderPage } from './request-builder/request-builder';
import { SavedQueriesPage } from './saved-queries/saved-queries';
import { SeriesPage } from './series/series';
import { AuthLayout } from './auth/auth-layout';
import { ConsoleShell } from './shell/console-shell';
import { AcceptInvitationPage } from './auth/accept-invitation';
import { AdministrationPage } from './administration/administration';
import { ResetPasswordPage } from './auth/reset-password';
import { SetPasswordPage } from './auth/set-password';
import { SignInPage } from './auth/sign-in';
import { sessionGuard } from './auth/session.guard';
import { VintagesPage } from './vintages/vintages';

/**
 * The seven tabs hang off a pathless parent that supplies the console chrome,
 * so no URL gains a segment and a future layout can sit beside this one rather
 * than inside it.
 */
export const routes: Routes = [
  // Ahead of both layouts: two pathless parents cannot both answer for the
  // bare path, and the redirect has to run before either claims it.
  { path: '', pathMatch: 'full', redirectTo: 'overview' },
  {
    path: '',
    component: AuthLayout,
    children: [
      { path: 'sign-in', component: SignInPage },
      { path: 'reset-password', component: ResetPasswordPage },
      { path: 'accept-invite/:token', component: AcceptInvitationPage },
      // Where the reset email lands. No token segment: Supabase puts its
      // recovery token in the fragment and its client consumes it on load.
      { path: 'set-password', component: SetPasswordPage }
    ]
  },
  {
    path: '',
    component: ConsoleShell,
    canActivate: [sessionGuard],
    children: [
      { path: 'overview', component: OverviewPage },
      { path: 'countries-indicators', component: CountriesIndicatorsPage },
      { path: 'series', component: SeriesPage },
      { path: 'observations', component: ObservationsPage },
      { path: 'vintages', component: VintagesPage },
      { path: 'saved-queries', component: SavedQueriesPage },
      { path: 'request-builder', component: RequestBuilderPage },
      // Reached from the account menu, not a tab. The page and the API both
      // check the role; the session guard only requires a session.
      { path: 'administration', component: AdministrationPage }
    ]
  },
  // No 404 page in the MVP scope, so an unknown path lands on Overview.
  { path: '**', redirectTo: 'overview' }
];
