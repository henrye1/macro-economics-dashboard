/**
 * Build-time configuration for the browser.
 *
 * Both values are publishable by design. The anon key is a claim about which
 * project to talk to, not a credential: it is in the shipped bundle of every
 * Supabase app there has ever been, and what it may do is decided by the
 * project's own policies, never by keeping it quiet. Nothing secret belongs in
 * this file, and the service key in particular must never appear here.
 *
 * Blank is a supported state. `supabaseClient()` returns null rather than
 * throwing, so a checkout with no project still builds, still serves, and says
 * that sign-in is unavailable instead of failing at boot.
 */
export const environment = {
  production: true,
  /** Project origin, scheme included, no trailing slash. */
  supabaseUrl: '',
  /** The project's publishable anon key. */
  supabaseAnonKey: ''
} as const;
