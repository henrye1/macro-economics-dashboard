-- Feature 16: saved queries tied to an account.
--
-- Apply in the Supabase SQL editor. Safe to re-run.
--
-- Only the API reads or writes this table, with the service role key, and it
-- scopes every query to the verified caller's user id. Row level security is on
-- with no policies and the browser-facing roles hold no privileges, so the
-- anon key shipped in the console can never reach a row, even by calling
-- PostgREST directly.

create table if not exists public.saved_queries (
  user_id     uuid        not null references auth.users (id) on delete cascade,
  name        text        not null check (name <> '' and name = btrim(name)),
  query       jsonb       not null,
  vintage_ids integer[]   not null default '{}',
  saved_at    timestamptz not null default now(),
  primary key (user_id, name)
);

alter table public.saved_queries enable row level security;

revoke all on table public.saved_queries from anon, authenticated;
