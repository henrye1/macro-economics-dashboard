import { Component } from '@angular/core';

import { WorkingQueryCard } from '../query/working-query-card';

/**
 * The working query lives here as of feature 3. Feature 5 adds the observations
 * table below it.
 */
@Component({
  selector: 'app-observations',
  imports: [WorkingQueryCard],
  template: `<app-working-query-card />`
})
export class ObservationsPage {}
