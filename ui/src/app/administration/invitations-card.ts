import { Component, inject } from '@angular/core';

import type { Invitation } from '../core/admin-directory';
import { InvitationsStore, utcStamp } from './invitations.store';

/**
 * Who the organisation is still waiting for, with Revoke and Resend.
 *
 * Revoke asks first, in the row: it deletes the invited account, and a link
 * already in someone's inbox stops working.
 */
@Component({
  selector: 'app-invitations-card',
  templateUrl: './invitations-card.html',
  styleUrl: './invitations-card.scss'
})
export class InvitationsCard {
  protected readonly store = inject(InvitationsStore);

  constructor() {
    this.store.load();
  }

  protected date(iso: string): string {
    return iso.slice(0, 10);
  }

  protected stamp(iso: string): string {
    return utcStamp(iso);
  }

  protected track(invitation: Invitation): string {
    return invitation.id;
  }
}
