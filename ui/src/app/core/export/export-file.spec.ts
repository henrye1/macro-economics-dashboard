import type { Envelope, EnvelopeMeta, Observation } from '../macro-contracts';
import { EXPORT_COLUMNS, toCsv } from './export-csv';
import { exportFilename } from './export-filename';
import { EXPORT_FORMATS, exportFormatSpec } from './export-format';
import { toJson } from './export-json';

const NOW = '2026-09-11T13:24:05.221Z';

function meta(overrides: Partial<EnvelopeMeta> = {}): EnvelopeMeta {
  return {
    page: 1,
    pageSize: 5000,
    totalCount: 2,
    vintages: [
      { id: 12, source: 'IMF_WEO', label: 'WEO 10.0.0 2026-04-14' },
      { id: 7, source: 'WB_WDI', label: 'WDI 2026-03-27' }
    ],
    attribution: [
      'Source: IMF World Economic Outlook database',
      'Source: World Bank World Development Indicators (CC BY 4.0)'
    ],
    ...overrides
  };
}

function row(overrides: Partial<Observation> = {}): Observation {
  return {
    indicator: 'GDP_GROWTH_REAL',
    country: 'ZAF',
    year: 2024,
    value: 1.1,
    isForecast: false,
    source: 'IMF_WEO',
    vintageId: 12,
    ...overrides
  };
}

/** The mark is asserted on its own; every other case is about the text. */
const BOM = '\ufeff';

/**
 * Splits on CRLF only, which also asserts the line ending is right, and drops
 * the byte-order mark so the header assertions stay about the header.
 */
function lines(csv: string): string[] {
  return csv.replace(BOM, '').split('\r\n');
}

function dataLines(csv: string): string[] {
  return lines(csv).filter((line) => line !== '' && !line.startsWith('#'));
}

/**
 * A quote-aware field reader, so the quoting rule is checked against a parse
 * rather than against the string the writer happened to produce.
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      fields.push(field);
      field = '';
    } else {
      field += char;
    }
  }

  fields.push(field);
  return fields;
}

describe('toCsv', () => {
  it('writes the seven contract columns in order', () => {
    const csv = toCsv([], meta(), { pinVintages: false, nowIso: NOW });

    expect(dataLines(csv)[0]).toBe('indicator,country,year,value,isForecast,source,vintageId');
    expect(EXPORT_COLUMNS.length).toBe(7);
  });

  it('writes one line per observation, values raw', () => {
    const csv = toCsv([row(), row({ year: 2025, value: 65324.1, isForecast: true })], meta(), {
      pinVintages: false,
      nowIso: NOW
    });

    // 65324.1, never the screen's grouped 65,324.1, which would split the column.
    expect(dataLines(csv)).toEqual([
      'indicator,country,year,value,isForecast,source,vintageId',
      'GDP_GROWTH_REAL,ZAF,2024,1.1,false,IMF_WEO,12',
      'GDP_GROWTH_REAL,ZAF,2025,65324.1,true,IMF_WEO,12'
    ]);
  });

  it('emits the column header and no rows for an empty result', () => {
    // An empty result is a valid answer, so the file is a valid empty file.
    expect(dataLines(toCsv([], meta({ totalCount: 0 }), { pinVintages: false, nowIso: NOW })))
      .toEqual(['indicator,country,year,value,isForecast,source,vintageId']);
  });

  describe('quoting', () => {
    it('quotes a field containing a comma, and it parses back whole', () => {
      const csv = toCsv([row({ indicator: 'GDP, REAL' })], meta(), {
        pinVintages: false,
        nowIso: NOW
      });

      const fields = parseCsvLine(dataLines(csv)[1]);
      expect(fields[0]).toBe('GDP, REAL');
      expect(fields.length).toBe(7);
    });

    it('doubles an embedded quote, and it parses back whole', () => {
      const csv = toCsv([row({ indicator: 'GDP "real"' })], meta(), {
        pinVintages: false,
        nowIso: NOW
      });

      expect(dataLines(csv)[1]).toContain('"GDP ""real"""');
      expect(parseCsvLine(dataLines(csv)[1])[0]).toBe('GDP "real"');
    });

    it('quotes a field containing a newline', () => {
      const csv = toCsv([row({ indicator: 'two\nlines' })], meta(), {
        pinVintages: false,
        nowIso: NOW
      });

      expect(csv).toContain('"two\nlines"');
    });

    it('leaves an ordinary field unquoted', () => {
      const csv = toCsv([row()], meta(), { pinVintages: false, nowIso: NOW });

      expect(dataLines(csv)[1]).not.toContain('"');
    });
  });

  describe('the header comment lines', () => {
    function commentLines(csv: string): string[] {
      const all = lines(csv);
      return all.slice(0, all.indexOf(EXPORT_COLUMNS.join(',')));
    }

    it('keeps a broken attribution line as one comment', () => {
      const csv = toCsv([row()], meta({ attribution: ['Source: IMF\nWorld Economic Outlook'] }), {
        pinVintages: false,
        nowIso: NOW
      });

      expect(commentLines(csv)).toContain('# Source: IMF World Economic Outlook');
    });

    it('collapses a carriage return the same way', () => {
      const csv = toCsv([row()], meta({ attribution: ['Source: IMF\rWorld'] }), {
        pinVintages: false,
        nowIso: NOW
      });

      expect(commentLines(csv)).toContain('# Source: IMF World');
    });

    it('collapses a CRLF pair to one space, not two', () => {
      const csv = toCsv([row()], meta({ attribution: ['Source: IMF\r\nWorld'] }), {
        pinVintages: false,
        nowIso: NOW
      });

      expect(commentLines(csv)).toContain('# Source: IMF World');
    });

    it('leaves no stray space from a leading or trailing break', () => {
      const csv = toCsv([row()], meta({ attribution: ['\nSource: IMF\n'] }), {
        pinVintages: false,
        nowIso: NOW
      });

      expect(commentLines(csv)).toContain('# Source: IMF');
    });

    it('collapses a break inside a vintage label, keeping the vintages line single', () => {
      const csv = toCsv(
        [row()],
        meta({ vintages: [{ id: 12, source: 'IMF_WEO', label: 'WEO 10.0.0\n2026-04-14' }] }),
        { pinVintages: true, nowIso: NOW }
      );

      expect(commentLines(csv)).toContain('# vintages: 12 WEO 10.0.0 2026-04-14');
    });

    it('leaves an ordinary attribution line byte-for-byte unchanged', () => {
      const csv = toCsv([row()], meta(), { pinVintages: true, nowIso: NOW });

      expect(commentLines(csv)).toContain('# Source: IMF World Economic Outlook database');
      expect(commentLines(csv)).toContain(
        '# Source: World Bank World Development Indicators (CC BY 4.0)'
      );
      expect(commentLines(csv)).toContain('# vintages: 12 WEO 10.0.0 2026-04-14; 7 WDI 2026-03-27');
    });

    it('keeps the column header as the first uncommented line', () => {
      // The property this is actually about: a break would otherwise put an
      // unclassifiable line exactly where a reader expects the header.
      const csv = toCsv(
        [row()],
        meta({ attribution: ['One\nTwo', 'Three\r\nFour'] }),
        { pinVintages: true, nowIso: NOW }
      );

      expect(dataLines(csv)[0]).toBe(EXPORT_COLUMNS.join(','));
      expect(commentLines(csv).every((line) => line.startsWith('# '))).toBeTrue();
    });

    it('does not reach data fields, where a newline is quoted and preserved', () => {
      // The line this fix must not cross: RFC 4180 keeps a break inside a value,
      // and that is correct there.
      const csv = toCsv([row({ indicator: 'two\nlines' })], meta(), {
        pinVintages: false,
        nowIso: NOW
      });

      expect(csv).toContain('"two\nlines"');
    });
  });

  describe('the formula-injection guard', () => {
    function indicatorField(indicator: string): string {
      const csv = toCsv([row({ indicator })], meta(), { pinVintages: false, nowIso: NOW });
      return parseCsvLine(dataLines(csv)[1])[0];
    }

    it('prefixes every leading trigger character, so the cell reads as text', () => {
      for (const trigger of ['=', '+', '@', '\t', '\r']) {
        expect(indicatorField(`${trigger}SUM(A1)`))
          .withContext(JSON.stringify(trigger))
          .toBe(`'${trigger}SUM(A1)`);
      }
    });

    it('prefixes a leading minus on a string, which is a formula like the rest', () => {
      expect(indicatorField('-1+1')).toBe(`'-1+1`);
    });

    it('leaves a negative VALUE alone, because a number is never a formula', () => {
      // The regression this guard would otherwise cause. Real growth is negative
      // somewhere in almost every series, so `'-1.1` would reach the value column
      // of every export ever downloaded.
      const csv = toCsv([row({ value: -1.1 })], meta(), { pinVintages: false, nowIso: NOW });

      expect(parseCsvLine(dataLines(csv)[1])[3]).toBe('-1.1');
      expect(dataLines(csv)[1]).toContain(',-1.1,');
    });

    it('leaves a negative year and vintage id alone, so the rule is about the type', () => {
      const csv = toCsv([row({ year: -2024, vintageId: -12 })], meta(), {
        pinVintages: false,
        nowIso: NOW
      });
      const fields = parseCsvLine(dataLines(csv)[1]);

      expect(fields[2]).toBe('-2024');
      expect(fields[6]).toBe('-12');
    });

    it('leaves a boolean alone', () => {
      const csv = toCsv([row({ isForecast: true })], meta(), {
        pinVintages: false,
        nowIso: NOW
      });

      expect(parseCsvLine(dataLines(csv)[1])[4]).toBe('true');
    });

    it('leaves an ordinary code untouched, with no stray quote', () => {
      expect(indicatorField('GDP_GROWTH_REAL')).toBe('GDP_GROWTH_REAL');
    });

    it('ignores a trigger that is not the first character', () => {
      // Only a leading one starts a formula, so guarding elsewhere would corrupt
      // a legitimate value for nothing.
      expect(indicatorField('GDP-GROWTH=REAL')).toBe('GDP-GROWTH=REAL');
    });

    it('guards AND quotes a value that is both dangerous and comma-bearing', () => {
      const csv = toCsv([row({ indicator: '=SUM(A1,A2)' })], meta(), {
        pinVintages: false,
        nowIso: NOW
      });

      expect(dataLines(csv)[1]).toContain(`"'=SUM(A1,A2)"`);
      expect(parseCsvLine(dataLines(csv)[1])[0]).toBe(`'=SUM(A1,A2)`);
    });

    it('guards the country code too, not only the indicator', () => {
      const csv = toCsv([row({ country: '=ZAF' })], meta(), {
        pinVintages: false,
        nowIso: NOW
      });

      expect(parseCsvLine(dataLines(csv)[1])[1]).toBe(`'=ZAF`);
    });
  });

  describe('the header lines', () => {
    it('always stamps the export with its date', () => {
      const csv = toCsv([], meta(), { pinVintages: false, nowIso: NOW });

      expect(lines(csv)[0]).toBe('# Cyte Macro Data export · 2026-09-11');
    });

    it('always writes the attribution, pinned or not', () => {
      // The overview requires attribution wherever numbers are rendered.
      const csv = toCsv([row()], meta(), { pinVintages: false, nowIso: NOW });

      expect(csv).toContain('# Source: IMF World Economic Outlook database');
      expect(csv).toContain('# Source: World Bank World Development Indicators (CC BY 4.0)');
    });

    it('writes no vintage line when pinning is off', () => {
      const csv = toCsv([row()], meta(), { pinVintages: false, nowIso: NOW });

      expect(csv).not.toContain('# vintages:');
    });

    it('names every id with its label when pinning is on', () => {
      const csv = toCsv([row()], meta(), { pinVintages: true, nowIso: NOW });

      expect(csv).toContain('# vintages: 12 WEO 10.0.0 2026-04-14; 7 WDI 2026-03-27');
    });

    it('says so plainly when a pinned export has no vintages to name', () => {
      const csv = toCsv([row()], meta({ vintages: [] }), { pinVintages: true, nowIso: NOW });

      expect(csv).toContain('# vintages: none reported for this result');
    });

    it('keeps every comment line above the column header', () => {
      const all = lines(toCsv([row()], meta(), { pinVintages: true, nowIso: NOW }));
      const header = all.indexOf('indicator,country,year,value,isForecast,source,vintageId');

      expect(header).toBeGreaterThan(0);
      expect(all.slice(0, header).every((line) => line.startsWith('# '))).toBeTrue();
    });
  });

  describe('the byte-order mark', () => {
    it('starts the document, so Excel reads it as UTF-8', () => {
      // Without it Excel falls back to the system codepage and the stamp line's
      // middle dot arrives as mojibake.
      expect(toCsv([row()], meta(), { pinVintages: false, nowIso: NOW }).startsWith(BOM))
        .toBeTrue();
    });

    it('is followed immediately by the first comment, not by a blank', () => {
      const csv = toCsv([row()], meta(), { pinVintages: false, nowIso: NOW });

      expect(csv.slice(BOM.length, BOM.length + 2)).toBe('# ');
    });

    it('is written exactly once, not per line', () => {
      const csv = toCsv([row(), row({ year: 2025 })], meta(), { pinVintages: true, nowIso: NOW });

      expect(csv.split(BOM).length - 1).toBe(1);
    });

    it('is written even for an empty result, which is still a CSV document', () => {
      expect(toCsv([], meta({ totalCount: 0 }), { pinVintages: false, nowIso: NOW }))
        .toContain(BOM);
    });
  });

  it('ends with a line terminator, so the last row is a complete line', () => {
    expect(toCsv([row()], meta(), { pinVintages: false, nowIso: NOW }).endsWith('\r\n')).toBeTrue();
  });
});

describe('toJson', () => {
  const envelope: Envelope<Observation> = { data: [row()], meta: meta() };

  it('parses back to a deep-equal envelope', () => {
    expect(JSON.parse(toJson(envelope))).toEqual(envelope);
  });

  it('carries meta.vintages, which is what makes the pin checkbox inert here', () => {
    expect(JSON.parse(toJson(envelope)).meta.vintages.length).toBe(2);
  });

  it('carries no byte-order mark, unlike the CSV', () => {
    // JSON parsers need no encoding hint, and a mark would be a stray character
    // in a document that must start with a brace.
    expect(toJson(envelope).startsWith('\ufeff')).toBeFalse();
    expect(toJson(envelope).startsWith('{')).toBeTrue();
  });

  it('is indented, because a consumer reads this one', () => {
    expect(toJson(envelope)).toContain('\n  "data"');
  });
});

describe('exportFilename', () => {
  it('names the format and the date', () => {
    expect(exportFilename('csv', NOW)).toBe('cyte-macro-observations-2026-09-11.csv');
    expect(exportFilename('json', NOW)).toBe('cyte-macro-observations-2026-09-11.json');
  });

  it('does not parse the stamp as a Date, so no timezone can shift it', () => {
    // 23:30 UTC is already the next day in some zones.
    expect(exportFilename('csv', '2026-05-02T23:30:00.000Z')).toContain('2026-05-02');
  });
});

describe('EXPORT_FORMATS', () => {
  it('declares all three the design offers', () => {
    expect(EXPORT_FORMATS.map((spec) => spec.format)).toEqual(['csv', 'json', 'xlsx']);
  });

  it('marks xlsx unavailable with a reason, rather than omitting it', () => {
    const xlsx = exportFormatSpec('xlsx');

    expect(xlsx.available).toBeFalse();
    expect(xlsx.unavailableReason).toContain('later feature');
    // Declared in full now, so 11b only flips the flag and supplies a writer.
    expect(xlsx.extension).toBe('xlsx');
    expect(xlsx.mimeType).toContain('spreadsheetml');
  });

  it('gives every available format a reason of null', () => {
    for (const spec of EXPORT_FORMATS.filter((candidate) => candidate.available)) {
      expect(spec.unavailableReason).withContext(spec.format).toBeNull();
    }
  });
});
