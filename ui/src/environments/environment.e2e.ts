/**
 * Build-time configuration for the browser suite.
 *
 * A project that does not exist, on purpose. `ui/e2e/stub-api.ts` intercepts
 * every `/auth/v1` call the client makes, so nothing here is ever dialled: what
 * this buys is a console that builds a real Supabase client and runs the real
 * sign-in path, rather than one that reports sign-in as unconfigured.
 *
 * Kept out of `environment.ts` so a developer's own project settings and the
 * suite's stub cannot overwrite each other.
 */
export const environment = {
  production: false,
  supabaseUrl: 'https://stub.supabase.co',
  supabaseAnonKey: 'stub-anon-key'
} as const;
