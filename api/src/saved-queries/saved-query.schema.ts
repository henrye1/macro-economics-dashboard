import { z } from 'zod';

/**
 * The console's `WorkingQuery`, checked the way feature 10's `isSavedQuery`
 * checks it in the browser: every key present, each of the right type.
 *
 * Mirroring that guard exactly is the point. The console migrates whatever
 * passed it out of localStorage, so a stricter server would reject a locally
 * valid entry on every visit, forever. Unknown keys are stripped.
 */
const workingQuerySchema = z.object({
  indicators: z.array(z.string()),
  countries: z.array(z.string()),
  yearFrom: z.number().nullable(),
  yearTo: z.number().nullable(),
  source: z.string(),
  forecast: z.string(),
  vintage: z.union([z.string(), z.number()]),
  page: z.number(),
  pageSize: z.number(),
});

export type WorkingQuery = z.infer<typeof workingQuerySchema>;

/** Trimmed, and empty after the trim is not a name. The table checks the same. */
const nameSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(z.string().min(1));

const vintageIdsSchema = z.array(z.number().int());

/** `PUT /api/saved-queries`. `savedAt` is the server's, so it is not accepted. */
export const saveBodySchema = z.object({
  name: nameSchema,
  query: workingQuerySchema,
  vintageIds: vintageIdsSchema,
});

export type SaveBody = z.infer<typeof saveBodySchema>;

/** One entry in its locked shape, as the console holds it. */
export const savedQuerySchema = saveBodySchema.extend({
  savedAt: z.iso.datetime({ offset: true }),
});

export type SavedQuery = z.infer<typeof savedQuerySchema>;

/** `POST /api/saved-queries/import`. Empty is allowed and just lists. */
export const importBodySchema = z.object({
  data: z.array(savedQuerySchema),
});

/** A `public.saved_queries` row, less the owner, which the caller already knows. */
export interface SavedQueryRow {
  name: string;
  query: unknown;
  vintage_ids: number[];
  saved_at: string;
}

/**
 * A row back into the locked shape.
 *
 * Postgres answers `timestamptz` as `2026-10-06 07:45:21.123+00`, so `savedAt`
 * is re-serialized to the `...Z` form the console has always written.
 */
export function toSavedQuery(row: SavedQueryRow): SavedQuery {
  return {
    name: row.name,
    query: row.query as WorkingQuery,
    vintageIds: row.vintage_ids,
    savedAt: new Date(row.saved_at).toISOString(),
  };
}

/**
 * Within one import a repeated name keeps its first entry. Postgres refuses an
 * upsert that names the same key twice, and first-wins matches "the version
 * already held wins" across imports.
 */
export function firstPerName(entries: readonly SavedQuery[]): SavedQuery[] {
  const seen = new Set<string>();

  return entries.filter((entry) => {
    if (seen.has(entry.name)) {
      return false;
    }

    seen.add(entry.name);
    return true;
  });
}
