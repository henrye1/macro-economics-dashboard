import type { ObservationsQuery } from '../macro-contracts';
import {
  CORE_API_HOST,
  REQUEST_ENDPOINTS,
  consumerUrl,
  curlCommand,
  proxyUrl
} from './request-text';

function query(overrides: Partial<ObservationsQuery> = {}): ObservationsQuery {
  return {
    indicators: ['GDP_GROWTH_REAL'],
    countries: ['ZAF'],
    page: 1,
    pageSize: 25,
    ...overrides
  };
}

describe('REQUEST_ENDPOINTS', () => {
  it('offers only the two routes the working query answers', () => {
    expect(REQUEST_ENDPOINTS.map((spec) => spec.endpoint)).toEqual(['observations', 'series']);
  });

  it('labels each one as the method and path the design shows', () => {
    expect(REQUEST_ENDPOINTS.map((spec) => spec.label)).toEqual([
      'GET /api/macro/observations',
      'GET /api/macro/series'
    ]);
  });
});

describe('the two URLs', () => {
  it('differ only in origin', () => {
    const consumer = consumerUrl('series', query());
    const proxy = proxyUrl('series', query());

    expect(consumer).toBe(`https://${CORE_API_HOST}${proxy}`);
  });

  it('names the endpoint that was chosen', () => {
    expect(proxyUrl('observations', query())).toContain('/api/macro/observations?');
    expect(proxyUrl('series', query())).toContain('/api/macro/series?');
  });

  it('uses the placeholder host, never an invented one', () => {
    // The overview lists CORE_API_BASE_URL among the secrets; the browser
    // cannot know it and must not pretend to.
    expect(consumerUrl('series', query())).toContain('https://<core-api-host>/');
  });

  it('joins several indicators into one comma-separated parameter', () => {
    const url = proxyUrl('series', query({ indicators: ['GDP_GROWTH_REAL', 'CPI_INFLATION_AVG'] }));

    // Percent-encoded by HttpParams, and one key rather than two: the live
    // service silently drops the second of a repeated key.
    expect(url).toContain('indicators=GDP_GROWTH_REAL,CPI_INFLATION_AVG');
    expect(url.match(/indicators=/g)?.length).toBe(1);
  });

  it('omits an empty countries array entirely, rather than sending a blank', () => {
    // An empty `countries=` is a filter matching nothing, not "all countries".
    expect(proxyUrl('series', query({ countries: [] }))).not.toContain('countries=');
  });

  it('omits a null year bound', () => {
    expect(proxyUrl('series', query({ yearFrom: null, yearTo: 2030 }))).not.toContain('yearFrom');
  });

  it('has no trailing question mark when there is nothing to send', () => {
    expect(proxyUrl('series', {} as ObservationsQuery)).toBe('/api/macro/series');
  });
});

describe('curlCommand', () => {
  const url = 'https://<core-api-host>/api/macro/series?indicators=GDP_GROWTH_REAL';

  it('quotes the URL and carries the token placeholder, never a real token', () => {
    const curl = curlCommand(url, null);

    expect(curl).toContain(`curl -s "${url}"`);
    expect(curl).toContain('-H "Authorization: Bearer $TOKEN"');
  });

  it('omits If-None-Match until a validator has been seen', () => {
    expect(curlCommand(url, null)).not.toContain('If-None-Match');
  });

  it('carries exactly one If-None-Match line once one is held', () => {
    const curl = curlCommand(url, '"v14-p1"');

    expect(curl.match(/If-None-Match/g)?.length).toBe(1);
  });

  it('escapes the quotes an ETag carries, which the shell would otherwise eat', () => {
    expect(curlCommand(url, '"v14-p1"')).toContain('-H "If-None-Match: \\"v14-p1\\""');
  });

  it('ends every line but the last with a continuation', () => {
    for (const held of [null, '"v14-p1"']) {
      const lines = curlCommand(url, held).split('\n');

      expect(lines[lines.length - 1].endsWith('\\'))
        .withContext(`held ${held}`)
        .toBeFalse();
      expect(lines.slice(0, -1).every((line) => line.endsWith(' \\')))
        .withContext(`held ${held}`)
        .toBeTrue();
    }
  });

  it('indents the continuation lines, as the design shows', () => {
    expect(curlCommand(url, null).split('\n')[1].startsWith('  -H')).toBeTrue();
  });
});
