import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';

import type { Invitation } from '../core/admin-directory';
import { InvitationsStore, utcStamp } from './invitations.store';

const INVALID_EMAIL = 'Enter a full email address, like name@company.co.za.';

/** Something before an @, and a dot somewhere after it. The API checks properly. */
function looksLikeEmail(value: string): boolean {
  const at = value.indexOf('@');
  return at > 0 && value.indexOf('.', at + 2) > at + 1 && !value.endsWith('.');
}

/**
 * Invite one person to the administrator's organisation.
 *
 * The organisation is not a field: the API takes it from the administrator's
 * verified session.
 */
@Component({
  selector: 'app-invite-form',
  templateUrl: './invite-form.html',
  styleUrl: './invite-form.scss'
})
export class InviteForm {
  protected readonly store = inject(InvitationsStore);

  private readonly input = viewChild<ElementRef<HTMLInputElement>>('emailInput');

  protected readonly roles: readonly Invitation['role'][] = ['Member', 'Administrator'];

  protected readonly email = signal('');
  protected readonly role = signal<Invitation['role']>('Member');
  protected readonly sending = signal(false);

  /** The client-side check's message, tied to the input. */
  protected readonly fieldError = signal<string | null>(null);

  /** The API's refusal, or the generic failure. */
  protected readonly refusal = signal<string | null>(null);

  protected readonly confirmation = signal<string | null>(null);

  protected readonly hint = computed(() => {
    const hours = this.store.expiresInHours();
    const lifetime = hours === null ? 'soon' : `after ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
    return `They get an email with a link to set a password. The link expires ${lifetime}.`;
  });

  protected setEmail(value: string): void {
    this.email.set(value);
    this.fieldError.set(null);
    this.refusal.set(null);
    this.confirmation.set(null);
  }

  protected setRole(role: Invitation['role']): void {
    this.role.set(role);
  }

  protected async send(event: Event): Promise<void> {
    event.preventDefault();

    if (this.sending()) {
      return;
    }

    const email = this.email().trim();

    if (!looksLikeEmail(email)) {
      this.fieldError.set(INVALID_EMAIL);
      this.input()?.nativeElement.focus();
      return;
    }

    this.sending.set(true);
    this.refusal.set(null);
    this.confirmation.set(null);

    const result = await this.store.invite(email, this.role());

    this.sending.set(false);

    if (!result.ok) {
      this.refusal.set(result.message);
      return;
    }

    // The role is kept: the next invitation is usually for the same kind of person.
    this.email.set('');
    const { invitation } = result;
    this.confirmation.set(
      `Invitation sent to ${invitation.email} as ${invitation.role}. It expires on ${utcStamp(invitation.expiresAt)}.`
    );
  }
}
