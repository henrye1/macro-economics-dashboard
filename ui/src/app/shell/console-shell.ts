import {
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  Injector,
  signal,
  viewChild
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { catchError, filter, map, of } from 'rxjs';

import { macroErrorMessage } from '../core/http/macro-error';
import { MACRO_DATA } from '../core/macro-data.provider';
import { SessionStore } from '../core/session.store';

type ShellState =
  | { ok: true; labels: readonly string[]; attribution: readonly string[] }
  | { ok: false; message: string };

/** Shown when the service failed without explaining itself. */
const STRIP_UNAVAILABLE = 'Unavailable';

@Component({
  selector: 'app-console-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './console-shell.html',
  styleUrl: './console-shell.scss',
  host: { '(document:click)': 'closeOnOutsideClick($event)' }
})
export class ConsoleShell {
  /** Display order from the designs, which differs from the build order. */
  protected readonly tabs = [
    { path: '/overview', label: 'Overview' },
    { path: '/countries-indicators', label: 'Countries & indicators' },
    { path: '/series', label: 'Series' },
    { path: '/observations', label: 'Observations' },
    { path: '/vintages', label: 'Vintages & revisions' },
    { path: '/saved-queries', label: 'Saved queries & export' },
    { path: '/request-builder', label: 'Request builder' }
  ] as const;

  private readonly macro = inject(MACRO_DATA);
  private readonly sessionStore = inject(SessionStore);
  private readonly router = inject(Router);

  /** The visitor, for the topbar. Null while signed out, which the guard prevents. */
  protected readonly session = this.sessionStore.session;

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly injector = inject(Injector);

  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private readonly firstItem = viewChild<ElementRef<HTMLElement>>('firstItem');
  private readonly signOutItem = viewChild<ElementRef<HTMLElement>>('signOutItem');

  protected readonly menuOpen = signal(false);

  /**
   * Whether to offer Administration. The exact rule the API's `resolveRole`
   * applies, so the menu never offers a page the API will refuse. Display only:
   * the API is the boundary, and a Member who types the URL gets its refusal.
   */
  protected readonly isAdministrator = computed(
    () => this.session()?.role === 'Administrator'
  );

  constructor() {
    // A navigation, from the menu or anywhere else, closes it.
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed()
      )
      .subscribe(() => this.menuOpen.set(false));
  }

  protected toggleMenu(): void {
    if (this.menuOpen()) {
      this.closeMenu(true);
      return;
    }

    this.menuOpen.set(true);

    // The items exist only once the panel has rendered.
    afterNextRender(
      () => (this.firstItem() ?? this.signOutItem())?.nativeElement.focus(),
      { injector: this.injector }
    );
  }

  /** Closes the menu; Escape also hands focus back to the button that opened it. */
  protected closeMenu(returnFocus: boolean): void {
    if (!this.menuOpen()) {
      return;
    }

    this.menuOpen.set(false);

    if (returnFocus) {
      this.trigger()?.nativeElement.focus();
    }
  }

  protected closeOnOutsideClick(event: MouseEvent): void {
    const account = this.host.nativeElement.querySelector('.account');

    if (this.menuOpen() && account !== null && !account.contains(event.target as Node)) {
      this.menuOpen.set(false);
    }
  }

  /**
   * Ends the session and shows the screen that can start another one.
   * Navigating rather than leaving the guard to do it keeps the console from
   * painting a frame of signed-out chrome on the way out.
   */
  protected signOut(): void {
    this.menuOpen.set(false);
    this.sessionStore.signOut();
    void this.router.navigate(['/sign-in']);
  }

  /**
   * One request feeds both the header vintage strip and the attribution footer,
   * since every envelope carries `meta.vintages` and `meta.attribution`.
   * A failure must not take the shell down, so the error is folded into state
   * rather than thrown.
   */
  private readonly shell = toSignal<ShellState | null>(
    this.macro.vintages().pipe(
      map((envelope): ShellState => ({
        ok: true,
        // From `data`, not `meta.vintages`. Observed live at feature 8:
        // `/vintages` answers `meta.vintages: []`, because that array reports
        // the provenance of a *result* and this route's result IS the vintage
        // list. Reading `meta` here left the strip blank.
        labels: envelope.data.filter((vintage) => vintage.isLatest).map((v) => v.label),
        attribution: envelope.meta.attribution
      })),
      catchError((error: unknown) =>
        of<ShellState>({ ok: false, message: macroErrorMessage(error, STRIP_UNAVAILABLE) })
      )
    ),
    { initialValue: null }
  );

  protected readonly loading = computed(() => this.shell() === null);
  protected readonly unavailable = computed(() => this.shell()?.ok === false);

  /**
   * The service's own explanation when it gave one, so a bad request is
   * diagnosable from the header strip instead of a flat "Unavailable".
   */
  protected readonly unavailableMessage = computed(() => {
    const state = this.shell();
    return state?.ok === false ? state.message : STRIP_UNAVAILABLE;
  });

  protected readonly vintageLabels = computed(() => {
    const state = this.shell();
    return state?.ok ? state.labels : [];
  });

  protected readonly attribution = computed(() => {
    const state = this.shell();
    return state?.ok ? state.attribution : [];
  });
}
