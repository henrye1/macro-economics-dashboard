import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

/** One person in the administrator's organisation, as `GET /api/admin/users` returns them. */
export interface AdminUser {
  readonly id: string;
  readonly email: string;
  /** From `user_metadata`, which the person can write. Display only. */
  readonly fullName: string;
  readonly role: 'Administrator' | 'Member';
  /** ISO 8601, or null for someone who has never signed in. */
  readonly lastSignInAt: string | null;
}

export const ADMIN_USERS_URL = '/api/admin/users';
export const ADMIN_INVITATIONS_URL = '/api/admin/invitations';

/** A pending invitation, as `/api/admin/invitations` returns it. */
export interface Invitation {
  readonly id: string;
  readonly email: string;
  readonly role: 'Administrator' | 'Member';
  /** The inviter's name, or '' when they are not in the organisation. */
  readonly invitedBy: string;
  /** ISO 8601. */
  readonly sentAt: string;
  readonly expiresAt: string;
  readonly status: 'pending' | 'expired';
}

export interface InvitationList {
  readonly invitations: Invitation[];
  /** How long the project's invite links last, for the form's hint. */
  readonly expiresInHours: number;
}

/**
 * The people an administrator manages. The API decides whose they are, from
 * the verified session; nothing here names an organisation.
 */
@Injectable({ providedIn: 'root' })
export class AdminDirectory {
  private readonly http = inject(HttpClient);

  users(): Observable<AdminUser[]> {
    return this.http
      .get<{ data: AdminUser[] }>(ADMIN_USERS_URL)
      .pipe(map((response) => response.data));
  }

  /**
   * Changes one person's role. The API enforces every rule, against the
   * directory as it stands, and answers with the person as they now are.
   */
  setRole(id: string, role: AdminUser['role']): Observable<AdminUser> {
    return this.http
      .put<{ data: AdminUser }>(`${ADMIN_USERS_URL}/${encodeURIComponent(id)}/role`, { role })
      .pipe(map((response) => response.data));
  }

  invitations(): Observable<InvitationList> {
    return this.http
      .get<{ data: Invitation[]; expiresInHours: number }>(ADMIN_INVITATIONS_URL)
      .pipe(map((response) => ({ invitations: response.data, expiresInHours: response.expiresInHours })));
  }

  /** Supabase sends the email. The API refuses an address that already has an account. */
  invite(email: string, role: Invitation['role']): Observable<Invitation> {
    return this.http
      .post<{ data: Invitation }>(ADMIN_INVITATIONS_URL, { email, role })
      .pipe(map((response) => response.data));
  }

  revoke(id: string): Observable<void> {
    return this.http.delete<void>(`${ADMIN_INVITATIONS_URL}/${encodeURIComponent(id)}`);
  }

  /** A fresh invitation with a new id; the old link stops working. */
  resend(id: string): Observable<Invitation> {
    return this.http
      .post<{ data: Invitation }>(`${ADMIN_INVITATIONS_URL}/${encodeURIComponent(id)}/resend`, {})
      .pipe(map((response) => response.data));
  }
}
