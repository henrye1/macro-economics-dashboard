import { InjectionToken } from '@angular/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { environment } from '../../../environments/environment';

/**
 * The one Supabase client, or null when this build has no project.
 *
 * Null is a supported state rather than a crash. A checkout with blank
 * environment values still boots, still renders every console screen, and
 * reports that sign-in is unavailable, which is the same posture the API takes
 * when its own settings are missing.
 *
 * Specs override this token and never construct a real client, so no test
 * reaches the network or leaves a session in browser storage.
 */
export const SUPABASE_CLIENT = new InjectionToken<SupabaseClient | null>('SUPABASE_CLIENT', {
  providedIn: 'root',
  factory: configuredClient
});

export function configuredClient(): SupabaseClient | null {
  const url = environment.supabaseUrl.trim();
  const key = environment.supabaseAnonKey.trim();

  if (url === '' || key === '') {
    return null;
  }

  return createClient(url, key, {
    auth: {
      // The client owns the tokens: it persists them, refreshes them before
      // they expire, and reads the one in a recovery link so `/set-password`
      // has a session to change a password with. Nothing in this console keeps
      // a second copy.
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
}
