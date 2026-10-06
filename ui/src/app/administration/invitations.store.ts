import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AdminDirectory, type Invitation } from '../core/admin-directory';

export type InvitationsStatus = 'loading' | 'ready' | 'failed';

/** Shown when a row action fails without the API explaining why. */
const ROW_FAILED = 'Could not update the invitation. Try again.';

/** Shown when sending fails without the API explaining why. */
const SEND_FAILED = 'Could not send the invitation. Try again.';

/** What the row is doing, if anything. */
export type RowActivity = 'confirming-revoke' | 'revoking' | 'resending';

/**
 * The organisation's pending invitations, shared by the card that lists them
 * and the form that adds to them. Provided by the Administration page, so it
 * lives exactly as long as the page does.
 */
@Injectable()
export class InvitationsStore {
  private readonly directory = inject(AdminDirectory);

  private readonly state = signal<InvitationsStatus>('loading');
  private readonly list = signal<readonly Invitation[]>([]);
  private readonly hours = signal<number | null>(null);
  private readonly activity = signal<Readonly<Record<string, RowActivity>>>({});
  private readonly errors = signal<Readonly<Record<string, string>>>({});
  private readonly notice = signal<string | null>(null);

  readonly status = this.state.asReadonly();
  readonly invitations = this.list.asReadonly();
  /** Null until the list has loaded. */
  readonly expiresInHours = this.hours.asReadonly();
  /** The last action's confirmation, shown above the table. */
  readonly confirmation = this.notice.asReadonly();
  readonly isEmpty = computed(() => this.list().length === 0);

  load(): void {
    this.state.set('loading');

    this.directory.invitations().subscribe({
      next: ({ invitations, expiresInHours }) => {
        this.list.set(invitations);
        this.hours.set(expiresInHours);
        this.state.set('ready');
      },
      error: () => this.state.set('failed')
    });
  }

  activityOf(invitation: Invitation): RowActivity | null {
    return this.activity()[invitation.id] ?? null;
  }

  errorOf(invitation: Invitation): string | null {
    return this.errors()[invitation.id] ?? null;
  }

  isBusy(invitation: Invitation): boolean {
    const activity = this.activityOf(invitation);
    return activity === 'revoking' || activity === 'resending';
  }

  askToRevoke(invitation: Invitation): void {
    this.setActivity(invitation.id, 'confirming-revoke');
    this.setError(invitation.id, null);
  }

  keep(invitation: Invitation): void {
    this.setActivity(invitation.id, null);
  }

  revoke(invitation: Invitation): void {
    if (this.isBusy(invitation)) {
      return;
    }

    this.setActivity(invitation.id, 'revoking');
    this.setError(invitation.id, null);

    this.directory.revoke(invitation.id).subscribe({
      next: () => {
        this.setActivity(invitation.id, null);
        this.list.update((list) => list.filter((held) => held.id !== invitation.id));
        this.notice.set(`Revoked the invitation to ${invitation.email}. That link no longer works.`);
      },
      error: (error: unknown) => {
        this.setActivity(invitation.id, null);
        this.setError(invitation.id, apiMessage(error) ?? ROW_FAILED);
      }
    });
  }

  resend(invitation: Invitation): void {
    if (this.isBusy(invitation)) {
      return;
    }

    this.setActivity(invitation.id, 'resending');
    this.setError(invitation.id, null);

    this.directory.resend(invitation.id).subscribe({
      next: (fresh) => {
        this.setActivity(invitation.id, null);
        this.list.update((list) => list.map((held) => (held.id === invitation.id ? fresh : held)));
        this.notice.set(`Sent a new invitation to ${fresh.email}. The old link no longer works.`);
      },
      error: (error: unknown) => {
        this.setActivity(invitation.id, null);
        this.setError(invitation.id, apiMessage(error) ?? ROW_FAILED);
      }
    });
  }

  /**
   * Sends an invitation. The new one goes to the top of the list. A refusal is
   * the API's own fixed sentence, written for this screen.
   */
  async invite(
    email: string,
    role: Invitation['role']
  ): Promise<{ ok: true; invitation: Invitation } | { ok: false; message: string }> {
    try {
      const invitation = await firstValueFrom(this.directory.invite(email, role));
      this.list.update((list) => [invitation, ...list.filter((held) => held.id !== invitation.id)]);
      return { ok: true, invitation };
    } catch (error) {
      return { ok: false, message: apiMessage(error) ?? SEND_FAILED };
    }
  }

  private setActivity(id: string, activity: RowActivity | null): void {
    this.activity.update((current) => {
      const next = { ...current };
      if (activity === null) {
        delete next[id];
      } else {
        next[id] = activity;
      }
      return next;
    });
  }

  private setError(id: string, message: string | null): void {
    this.errors.update((current) => {
      const next = { ...current };
      if (message === null) {
        delete next[id];
      } else {
        next[id] = message;
      }
      return next;
    });
  }
}

/** The API's `{ error }` sentence, or null when it gave none. */
function apiMessage(error: unknown): string | null {
  if (error instanceof HttpErrorResponse) {
    const message = (error.error as { error?: unknown } | null)?.error;

    if (typeof message === 'string' && message !== '') {
      return message;
    }
  }

  return null;
}

/** `2026-10-07 08:00 UTC`: a 24-hour link needs the time, and the zone is said. */
export function utcStamp(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}
