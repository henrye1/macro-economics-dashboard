import type { User } from '@supabase/supabase-js';

import type { Session } from '../auth.provider';

/**
 * A Supabase user as the console's `Session`.
 *
 * One function, because the provider and the session store both need this and
 * two copies would drift the first time a claim moved. Where a value comes
 * from is the whole of the decision:
 *
 * - `organisation` and `role` come from `app_metadata`, which only an
 *   administrator can write and which the API reads from the verified token.
 *   Reading them from `user_metadata` would let a visitor promote themselves in
 *   the UI, and a console that shows a role the API does not agree with is
 *   worse than one that shows none.
 * - `fullName` comes from `user_metadata`, which is exactly the kind of thing a
 *   visitor may set about themselves.
 *
 * Every fallback is empty rather than invented. A user an administrator set up
 * incompletely renders a blank organisation, not a guess.
 */
export function toSession(user: User): Session {
  const email = readString(user.email) ?? '';

  return {
    email,
    fullName: readString(user.user_metadata?.['full_name']) ?? emailName(email),
    organisation: readString(user.app_metadata?.['organisation']) ?? '',
    role: readString(user.app_metadata?.['role']) ?? ''
  };
}

/**
 * The local part of the address, so the topbar has something to show for a user
 * who never set a name. It is not a display name and is not stored anywhere.
 */
function emailName(email: string): string {
  return email.split('@')[0] ?? '';
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}
