import { firstValueFrom } from 'rxjs';

import {
  FIXTURE_ATTRIBUTION,
  FIXTURE_COUNTRIES,
  FIXTURE_INDICATORS,
  FIXTURE_VINTAGES
} from './macro-fixtures';
import { FixtureMacroDataProvider } from './fixture-macro-data.provider';

describe('FixtureMacroDataProvider', () => {
  let provider: FixtureMacroDataProvider;

  beforeEach(() => {
    provider = new FixtureMacroDataProvider();
  });

  it('wraps every response in the envelope shape', async () => {
    const envelope = await firstValueFrom(provider.countries());

    expect(envelope.data.length).toBe(FIXTURE_COUNTRIES.length);
    expect(envelope.meta.page).toBe(1);
    expect(envelope.meta.totalCount).toBe(FIXTURE_COUNTRIES.length);
    expect(envelope.meta.attribution).toEqual([...FIXTURE_ATTRIBUTION]);
  });

  it('reports the latest vintage per source in meta.vintages', async () => {
    const envelope = await firstValueFrom(provider.vintages());
    const refs = envelope.meta.vintages;

    expect(refs.length).toBe(2);
    expect(refs.map((ref) => ref.source).sort()).toEqual(['IMF_WEO', 'WB_WDI']);
    expect(refs.every((ref) => Number.isInteger(ref.id))).toBeTrue();
  });

  it('returns every published vintage, newest first, from the vintages route', async () => {
    const envelope = await firstValueFrom(provider.vintages());

    expect(envelope.data.length).toBe(FIXTURE_VINTAGES.length);
    expect(envelope.data[0].id).toBe(14);
    expect(envelope.data.filter((vintage) => vintage.isLatest).length).toBe(2);
  });

  it('returns the curated indicator catalogue', async () => {
    const envelope = await firstValueFrom(provider.indicators());

    expect(envelope.data.length).toBe(FIXTURE_INDICATORS.length);
    expect(envelope.data.every((indicator) => indicator.unit.length > 0)).toBeTrue();
    expect(envelope.data.map((indicator) => indicator.code)).toContain('GDP_GROWTH_REAL');
  });

  it('returns an empty data array, not an error, where fixtures have no rows yet', async () => {
    const envelope = await firstValueFrom(
      provider.observations({ indicators: ['GDP_GROWTH_REAL'] })
    );

    expect(envelope.data).toEqual([]);
    expect(envelope.meta.totalCount).toBe(0);
    expect(envelope.meta.attribution.length).toBe(2);
  });

  it('does not hand out the shared fixture arrays', async () => {
    const first = await firstValueFrom(provider.countries());
    first.data.pop();

    const second = await firstValueFrom(provider.countries());

    expect(second.data.length).toBe(FIXTURE_COUNTRIES.length);
  });
});
