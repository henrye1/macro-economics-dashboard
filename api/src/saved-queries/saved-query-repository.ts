import { createClient } from '@supabase/supabase-js';

import {
  firstPerName,
  toSavedQuery,
  type SaveBody,
  type SavedQuery,
  type SavedQueryRow,
} from './saved-query.schema.js';

/**
 * Saved queries, one owner at a time.
 *
 * Every method takes the owner explicitly and every implementation must scope
 * by it: the production one holds the service role key, which bypasses row
 * level security, so this filter is the only thing keeping one visitor's rows
 * from another. Routes pass `req.auth.userId` and nothing else.
 */
export interface SavedQueryRepository {
  /** Newest first, name breaking ties. */
  list(userId: string): Promise<SavedQuery[]>;
  /** Upserts by name, stamped with the server's time. */
  save(userId: string, entry: SaveBody): Promise<SavedQuery>;
  /** Inserts what the owner does not already hold by name, then lists. */
  import(userId: string, entries: readonly SavedQuery[]): Promise<SavedQuery[]>;
}

const TABLE = 'saved_queries';
const COLUMNS = 'name, query, vintage_ids, saved_at';

/**
 * Supabase's error objects carry the SQL message and sometimes a hint. They
 * are thrown as-is for the server log; the route maps every one to a fixed
 * `502` and never returns it.
 */
function check<T>(result: { data: T | null; error: unknown }): T {
  if (result.error !== null && result.error !== undefined) {
    throw result.error;
  }

  if (result.data === null) {
    throw new Error('Supabase returned no data.');
  }

  return result.data;
}

export function createSupabaseRepository(url: string, serviceKey: string): SavedQueryRepository {
  // A server-side client: there is no session to keep, and the service key is
  // not a token that expires.
  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  async function list(userId: string): Promise<SavedQuery[]> {
    const rows = check(
      await client
        .from(TABLE)
        .select(COLUMNS)
        .eq('user_id', userId)
        .order('saved_at', { ascending: false })
        .order('name', { ascending: true }),
    ) as SavedQueryRow[];

    return rows.map(toSavedQuery);
  }

  return {
    list,

    async save(userId, entry) {
      const row = check(
        await client
          .from(TABLE)
          .upsert(
            {
              user_id: userId,
              name: entry.name,
              query: entry.query,
              vintage_ids: entry.vintageIds,
              saved_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,name' },
          )
          .select(COLUMNS)
          .single(),
      ) as SavedQueryRow;

      return toSavedQuery(row);
    },

    async import(userId, entries) {
      const rows = firstPerName(entries).map((entry) => ({
        user_id: userId,
        name: entry.name,
        query: entry.query,
        vintage_ids: entry.vintageIds,
        saved_at: entry.savedAt,
      }));

      if (rows.length > 0) {
        const { error } = await client
          .from(TABLE)
          .upsert(rows, { onConflict: 'user_id,name', ignoreDuplicates: true });

        if (error !== null) {
          throw error;
        }
      }

      return list(userId);
    },
  };
}
