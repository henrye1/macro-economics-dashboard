import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { catchError, map, of } from 'rxjs';

import type { EnvelopeMeta } from './core/macro-contracts';
import { MACRO_DATA } from './core/macro-data.provider';

type ShellState = { ok: true; meta: EnvelopeMeta } | { ok: false };

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
      map((envelope): ShellState => ({ ok: true, meta: envelope.meta })),
      catchError(() => of<ShellState>({ ok: false }))
    ),
    { initialValue: null }
  );

  protected readonly loading = computed(() => this.shell() === null);
  protected readonly unavailable = computed(() => this.shell()?.ok === false);

  protected readonly vintageLabels = computed(() => {
    const state = this.shell();
    return state?.ok ? state.meta.vintages.map((vintage) => vintage.label) : [];
  });

  protected readonly attribution = computed(() => {
    const state = this.shell();
    return state?.ok ? state.meta.attribution : [];
  });
}
