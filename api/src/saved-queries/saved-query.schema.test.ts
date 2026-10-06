import { describe, expect, it } from 'vitest';

import {
  firstPerName,
  importBodySchema,
  saveBodySchema,
  savedQuerySchema,
  toSavedQuery,
  type SavedQuery,
} from './saved-query.schema.js';

const query = {
  indicators: ['NGDP_RPCH'],
  countries: ['ZAF'],
  yearFrom: 2018,
  yearTo: 2030,
  source: 'preferred',
  forecast: 'all',
  vintage: 'latest',
  page: 1,
  pageSize: 25,
};

const body = { name: 'Q1 ECL', query, vintageIds: [12] };

describe('saveBodySchema', () => {
  it('accepts the shape the console sends', () => {
    expect(saveBodySchema.parse(body)).toEqual(body);
  });

  it('trims the name', () => {
    expect(saveBodySchema.parse({ ...body, name: '  Q1 ECL  ' }).name).toBe('Q1 ECL');
  });

  it.each(['', '   '])('refuses a name that is empty after trimming (%j)', (name) => {
    expect(saveBodySchema.safeParse({ ...body, name }).success).toBe(false);
  });

  it('accepts null years and a numeric vintage', () => {
    const parsed = saveBodySchema.parse({
      ...body,
      query: { ...query, yearFrom: null, yearTo: null, vintage: 14 },
    });

    expect(parsed.query.vintage).toBe(14);
  });

  it.each<[string, Record<string, unknown>]>([
    ['indicators not strings', { indicators: [1] }],
    ['countries missing', { countries: undefined }],
    ['yearFrom a string', { yearFrom: '2018' }],
    ['source missing', { source: undefined }],
    ['forecast a number', { forecast: 1 }],
    ['vintage null', { vintage: null }],
    ['page missing', { page: undefined }],
    ['pageSize a string', { pageSize: '25' }],
  ])('refuses a query with %s', (_label, change) => {
    expect(saveBodySchema.safeParse({ ...body, query: { ...query, ...change } }).success).toBe(
      false,
    );
  });

  it('refuses vintage ids that are not integers', () => {
    expect(saveBodySchema.safeParse({ ...body, vintageIds: [1.5] }).success).toBe(false);
    expect(saveBodySchema.safeParse({ ...body, vintageIds: ['12'] }).success).toBe(false);
  });

  it('strips unknown keys at every level, an owner above all', () => {
    const parsed = saveBodySchema.parse({
      ...body,
      userId: 'someone-else',
      user_id: 'someone-else',
      query: { ...query, extra: true },
    });

    expect(parsed).toEqual(body);
  });
});

describe('savedQuerySchema', () => {
  it('requires an ISO savedAt', () => {
    expect(savedQuerySchema.safeParse({ ...body, savedAt: '2026-10-06T07:45:21.000Z' }).success).toBe(
      true,
    );
    expect(savedQuerySchema.safeParse({ ...body, savedAt: 'yesterday' }).success).toBe(false);
    expect(savedQuerySchema.safeParse(body).success).toBe(false);
  });
});

describe('importBodySchema', () => {
  it('accepts an empty list', () => {
    expect(importBodySchema.parse({ data: [] })).toEqual({ data: [] });
  });

  it('refuses the whole batch when one entry is invalid', () => {
    const good = { ...body, savedAt: '2026-10-06T07:45:21.000Z' };

    expect(importBodySchema.safeParse({ data: [good, { ...good, name: '' }] }).success).toBe(false);
  });
});

describe('toSavedQuery', () => {
  it('maps a row to the locked shape with a Z timestamp', () => {
    expect(
      toSavedQuery({
        name: 'Q1 ECL',
        query,
        vintage_ids: [12],
        saved_at: '2026-10-06 07:45:21.123+00',
      }),
    ).toEqual({ name: 'Q1 ECL', query, vintageIds: [12], savedAt: '2026-10-06T07:45:21.123Z' });
  });
});

describe('firstPerName', () => {
  it('keeps the first entry for a repeated name', () => {
    const entries = [
      { name: 'A', savedAt: '1' },
      { name: 'B', savedAt: '2' },
      { name: 'A', savedAt: '3' },
    ] as SavedQuery[];

    expect(firstPerName(entries).map((entry) => entry.savedAt)).toEqual(['1', '2']);
  });
});
