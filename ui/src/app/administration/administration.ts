import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { EMPTY, catchError, map, of, startWith } from 'rxjs';

import { AdminDirectory, type AdminUser } from '../core/admin-directory';
import { SessionStore } from '../core/session.store';

/** The API's fixed message for an Administrator with no organisation. */
const NO_ORGANISATION = 'This account has no organisation to administer.';

type UsersState =
  | { kind: 'loading' }
  | { kind: 'ready'; users: readonly AdminUser[] }
  | { kind: 'forbidden' }
  | { kind: 'no-organisation' }
  | { kind: 'failed' };

/**
 * The people in the administrator's own organisation.
 *
 * Which organisation is the API's decision, from the verified session; this
 * page only names it in the heading. A Member never sends the request: the
 * session says what to show, and the API's refusal is the boundary for anyone
 * the session misdescribes.
 */
@Component({
  selector: 'app-administration',
  imports: [RouterLink],
  templateUrl: './administration.html',
  styleUrl: './administration.scss'
})
export class AdministrationPage {
  private readonly directory = inject(AdminDirectory);
  private readonly session = inject(SessionStore).session;

  protected readonly organisation = computed(() => this.session()?.organisation ?? '');

  /** The same exact rule the API's `resolveRole` applies. */
  private readonly isAdministrator = computed(() => this.session()?.role === 'Administrator');

  private readonly state = toSignal<UsersState>(
    this.isAdministrator()
      ? this.directory.users().pipe(
          map((users): UsersState => ({ kind: 'ready', users })),
          catchError((error: unknown) => of(failure(error))),
          startWith<UsersState>({ kind: 'loading' })
        )
      : EMPTY.pipe(startWith<UsersState>({ kind: 'forbidden' })),
    { requireSync: true }
  );

  protected readonly kind = computed(() => this.state().kind);

  protected readonly users = computed(() => {
    const state = this.state();
    return state.kind === 'ready' ? state.users : [];
  });

  protected readonly countLabel = computed(() => {
    const count = this.users().length;
    return `${count} ${count === 1 ? 'person' : 'people'} in ${this.organisation()}`;
  });

  /** Matched on the verified email, never on the name the person typed. */
  protected isYou(user: AdminUser): boolean {
    return user.email !== '' && user.email === this.session()?.email;
  }

  protected lastSignIn(user: AdminUser): string {
    return user.lastSignInAt === null ? 'Never' : user.lastSignInAt.slice(0, 10);
  }
}

/**
 * A 403 is one of two answers. Not an Administrator after all means the
 * session was stale, so the page shows what a Member sees. No organisation is
 * an Administrator the page can still talk to. Everything else is a failure.
 */
function failure(error: unknown): UsersState {
  if (error instanceof HttpErrorResponse && error.status === 403) {
    const message = (error.error as { error?: unknown } | null)?.error;

    return message === NO_ORGANISATION ? { kind: 'no-organisation' } : { kind: 'forbidden' };
  }

  return { kind: 'failed' };
}
