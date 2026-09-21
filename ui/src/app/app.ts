import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * The bootstrap component, and nothing else.
 *
 * The console's chrome lives in `ConsoleShell`, which the router mounts as the
 * parent of the seven tabs. Keeping this one empty is what lets a route choose
 * its own layout: feature 19's auth screens are siblings of the console tree,
 * not children of its topbar.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />'
})
export class App {}
