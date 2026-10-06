import { HttpErrorResponse } from '@angular/common/http';
import { Component, Injector, afterNextRender, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { EMPTY, catchError, map, of, startWith } from 'rxjs';

import { AdminDirectory, type AdminUser } from '../core/admin-directory';
import { SessionStore } from '../core/session.store';
import { InvitationsCard } from './invitations-card';
import { InvitationsStore } from './invitations.store';
import { InviteForm } from './invite-form';

/** The API's fixed message for an Administrator with no organisation. */
const NO_ORGANISATION = 'This account has no organisation to administer.';

/** Shown when a role change fails without the API explaining why. */
const CHANGE_FAILED = 'Could not change the role. Try again.';

type Role = AdminUser['role'];

/** The one row being edited, if any. */
interface Editing {
  readonly id: string;
  readonly draft: Role;
  readonly saving: boolean;
  /** The API's own fixed message, or the generic one. */
  readonly error: string | null;
}

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
  imports: [RouterLink, InvitationsCard, InviteForm],
  // One store per page, shared by the card that lists invitations and the
  // form that adds to them.
  providers: [InvitationsStore],
  templateUrl: './administration.html',
  styleUrl: './administration.scss'
})
export class AdministrationPage {
  private readonly directory = inject(AdminDirectory);
  private readonly session = inject(SessionStore).session;
  private readonly injector = inject(Injector);

  protected readonly roles: readonly Role[] = ['Member', 'Administrator'];

  /** People as the API last answered for them after a role change. */
  private readonly changed = signal<Readonly<Record<string, AdminUser>>>({});

  protected readonly editing = signal<Editing | null>(null);

  /** The last change's confirmation. Cleared by the next edit. */
  protected readonly confirmation = signal<string | null>(null);

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
    const changed = this.changed();
    return state.kind === 'ready' ? state.users.map((user) => changed[user.id] ?? user) : [];
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

  protected isEditing(user: AdminUser): boolean {
    return this.editing()?.id === user.id;
  }

  /** Opens one row for editing, closing any other. */
  protected startEditing(user: AdminUser): void {
    this.confirmation.set(null);
    this.editing.set({ id: user.id, draft: user.role, saving: false, error: null });
    this.focusAfterRender(`role-${user.id}`);
  }

  protected setDraft(value: string): void {
    const editing = this.editing();
    if (editing === null || editing.saving || !isRole(value)) {
      return;
    }

    this.editing.set({ ...editing, draft: value, error: null });
  }

  /** Save is open only for a real change, and once at a time. */
  protected canSave(user: AdminUser): boolean {
    const editing = this.editing();
    return editing?.id === user.id && !editing.saving && editing.draft !== user.role;
  }

  protected cancel(user: AdminUser): void {
    if (this.editing()?.saving) {
      return;
    }

    this.editing.set(null);
    this.focusAfterRender(`change-${user.id}`);
  }

  protected save(user: AdminUser): void {
    const editing = this.editing();
    if (editing === null || !this.canSave(user)) {
      return;
    }

    this.editing.set({ ...editing, saving: true, error: null });

    this.directory.setRole(user.id, editing.draft).subscribe({
      next: (updated) => {
        this.changed.update((changed) => ({ ...changed, [updated.id]: updated }));
        this.editing.set(null);
        this.confirmation.set(
          `${updated.fullName} is now ${updated.role}. It takes effect the next time their session refreshes.`
        );
        this.focusAfterRender(`change-${updated.id}`);
      },
      error: (error: unknown) => {
        // The selection is kept, so a retry is one click.
        this.editing.set({ ...editing, saving: false, error: changeMessage(error) });
      }
    });
  }

  /** Ids come from the API as uuids, so they are safe in an element id. */
  private focusAfterRender(id: string): void {
    afterNextRender(() => document.getElementById(id)?.focus(), { injector: this.injector });
  }
}

function isRole(value: string): value is Role {
  return value === 'Member' || value === 'Administrator';
}

/**
 * The API's own explanation when it gave one. Its role-change refusals are
 * fixed strings written for this screen, never an echo of the request.
 */
function changeMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const message = (error.error as { error?: unknown } | null)?.error;

    if (typeof message === 'string' && message !== '') {
      return message;
    }
  }

  return CHANGE_FAILED;
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
