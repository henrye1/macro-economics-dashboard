import { firstValueFrom } from 'rxjs';

import {
  FIXTURE_ATTRIBUTION,
  FIXTURE_COUNTRIES,
  FIXTURE_INDICATORS,
  FIXTURE_VINTAGES
} from './macro-fixtures';
import { FixtureMacroDataProvider, filterIndicators } from './fixture-macro-data.provider';

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

  describe('indicator filters', () => {
    async function codes(query?: Parameters<FixtureMacroDataProvider['indicators']>[0]) {
      const envelope = await firstValueFrom(provider.indicators(query));
      return envelope.data.map((indicator) => indicator.code);
    }

    it('returns the curated set by default', async () => {
      expect((await codes()).length).toBe(FIXTURE_INDICATORS.length);
    });

    it('filters by exact category', async () => {
      expect(await codes({ category: 'fiscal' }))
        .toEqual(['GOVT_DEBT_GDP', 'FISCAL_BALANCE_GDP']);
    });

    it('returns nothing for an unknown category rather than everything', async () => {
      expect(await codes({ category: 'nope' })).toEqual([]);
    });

    it('filters by source when any source entry matches', async () => {
      const wdiOnly = await codes({ source: 'WB_WDI' });

      expect(wdiOnly).toContain('REAL_INTEREST_RATE');
      expect(wdiOnly).toContain('GDP_GROWTH_REAL');
      expect(wdiOnly).not.toContain('GOVT_DEBT_GDP');
    });

    it('matches q against the code, case-insensitively', async () => {
      expect(await codes({ q: 'gdp_growth' })).toEqual(['GDP_GROWTH_REAL']);
    });

    it('matches q against the name too', async () => {
      expect(await codes({ q: 'unemployment' })).toEqual(['UNEMPLOYMENT_RATE']);
    });

    it('ignores surrounding whitespace in q', async () => {
      expect(await codes({ q: '  reer  ' })).toEqual(['REER_INDEX']);
    });

    it('returns an empty list for a term that matches nothing', async () => {
      expect(await codes({ q: 'zzzz' })).toEqual([]);
    });

    it('combines filters with AND', async () => {
      expect(await codes({ category: 'monetary', source: 'WB_WDI', q: 'rate' }))
        .toEqual(['REAL_INTEREST_RATE', 'LENDING_RATE']);
    });

    it('reports the filtered total in meta, not the unfiltered one', async () => {
      const envelope = await firstValueFrom(provider.indicators({ category: 'fiscal' }));

      expect(envelope.meta.totalCount).toBe(2);
      expect(envelope.data.length).toBe(2);
    });

    it('curated false still returns the fixtures, which are all curated', async () => {
      expect((await codes({ curated: false })).length).toBe(FIXTURE_INDICATORS.length);
    });

    it('excludes a non-curated entry when curated is on', () => {
      const nonCurated = { ...FIXTURE_INDICATORS[0], code: 'WEO_NGAP_NPGDP', curated: false };

      expect(filterIndicators([nonCurated]).length).toBe(0);
      expect(filterIndicators([nonCurated], { curated: false }).length).toBe(1);
    });
  });

  it('does not hand out the shared fixture arrays', async () => {
    const first = await firstValueFrom(provider.countries());
    first.data.pop();

    const second = await firstValueFrom(provider.countries());

    expect(second.data.length).toBe(FIXTURE_COUNTRIES.length);
  });
});
