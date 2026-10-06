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
}
