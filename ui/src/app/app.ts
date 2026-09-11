import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { catchError, map, of } from 'rxjs';

import { macroErrorMessage } from './core/http/macro-error';
import { MACRO_DATA } from './core/macro-data.provider';

type ShellState =
  | { ok: true; labels: readonly string[]; attribution: readonly string[] }
  | { ok: false; message: string };

/** Shown when the service failed without explaining itself. */
const STRIP_UNAVAILABLE = 'Unavailable';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
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
