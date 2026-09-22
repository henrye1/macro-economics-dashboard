import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * The split-panel shell the four authentication screens share.
 *
 * A sibling of `ConsoleShell`, not a child: an auth screen has no topbar, no
 * tabs and no attribution footer, which is the whole reason feature 18 moved
 * the console's chrome out of the root component.
 */
@Component({
  selector: 'app-auth-layout',
  imports: [RouterOutlet],
  templateUrl: './auth-layout.html',
  styleUrl: './auth-layout.scss'
})
export class AuthLayout {}
