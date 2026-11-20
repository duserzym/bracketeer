import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { deriveSession, importText, importWorkbook } from './import';
import { exportWorkbook, toCSV, toTSV } from './export';
import { SESSION_2_STANDARDS } from './test-data';
import { DEFAULT_EXPERIMENT, QTEGRA_COLUMNS, type Row } from './types';

const row = (Label: string, spot: number | null): Row => ({
  ...DEFAULT_EXPERIMENT.defaults,
  Label,
  Status: null,
  'Laser Scan Position Number': spot,
  meta: { kind: 'unknown', name: 'stale metadata', block: 'unknowns' },
});
const rows = [
  row('SYN-11.7_S_182', 182),
  row('SYN-18_384', 384),
  row('SYN-17.7R-02_S_323', 323),
  row('SYN-16-gc1_xs_488', 488),
  row('S513_650', 650),
];

describe('sequence import', () => {
  it('reads TSV and CSV, each with or without a header, restoring numeric and boolean types', () => {
    for (const text of [
      toTSV(rows),
      QTEGRA_COLUMNS.join('\t') + '\r\n' + toTSV(rows),
      toCSV(rows),
      toCSV(rows).split('\r\n').slice(1).join('\r\n'),
    ]) {
      const result = importText(text, SESSION_2_STANDARDS);
      expect(result.issues).toEqual([]);
      expect(toTSV(result.rows)).toBe(toTSV(rows));
      expect(result.rows.map((r) => r.meta.name)).toEqual([
        'SYN-11.7',
        'SYN-18',
        'SYN-17.7R-02',
        'SYN-16-gc1',
        'S513',
      ]);
      expect(result.rows[0]!.Evaluate).toBe(true);
      expect(typeof result.rows[0]!['Duration [s]']).toBe('number');
    }
  });
  it.each(['xls', 'xlsx'] as const)(
    'reads %s bytes without needing Node file APIs',
    (format) => {
      const bytes = exportWorkbook(rows, format);
      for (const input of [bytes, bytes.buffer as ArrayBuffer]) {
        const result = importWorkbook(input, SESSION_2_STANDARDS);
        expect(result.issues).toEqual([]);
        expect(toTSV(result.rows)).toEqual(toTSV(rows));
      }
    },
  );
  it('handles quoted CSV commas, escaped quotes, embedded newlines and lowercase false', () => {
    const edited = {
      ...rows[0]!,
      Comment: 'said "yes", then\r\nnext',
      Identifier: 'line\n2',
      Evaluate: false,
      'Dilution Factor': 1.25,
    };
    const result = importText(
      '\uFEFF' + toCSV([edited]).replace(',FALSE,', ',false,'),
      SESSION_2_STANDARDS,
    );
    expect(result.issues).toEqual([]);
    expect(toCSV(result.rows)).toBe(toCSV([edited]));
    expect(importText('', SESSION_2_STANDARDS)).toEqual({
      rows: [],
      issues: [],
    });
  });
  it('keeps unrecognized and malformed rows, reporting their actual row indexes', () => {
    const input = [
      rows[0]!,
      row('manually edited label', 99),
      row('', 100),
      rows[1]!,
    ];
    const result = importText(toCSV(input), SESSION_2_STANDARDS);
    expect(result.rows).toHaveLength(4);
    expect(toCSV(result.rows)).toBe(toCSV(input));
    expect(result.issues.map((i) => i.rowIndex)).toEqual([1, 2]);
    expect(
      deriveSession(result.rows, SESSION_2_STANDARDS).issues.map(
        (i) => i.rowIndex,
      ),
    ).toEqual([1, 2]);
    const short = importText('unrecognized', SESSION_2_STANDARDS);
    expect(short.rows).toHaveLength(1);
    expect(short.issues.map((i) => i.message).join(' ')).toContain(
      'expected 13 columns',
    );
    const invalid = toTSV([rows[0]!])
      .replace('\t30\t', '\tbad number\t')
      .replace('\tTRUE\t', '\t1\t');
    expect(importText(invalid, SESSION_2_STANDARDS).issues).toHaveLength(2);
  });
  it('rejects a misleading header, a missing Sheet1, and unclosed quoted text', () => {
    expect(() =>
      importText('Label,wrong header\r\n', SESSION_2_STANDARDS),
    ).toThrow('column headers');
    expect(() => importText('"unclosed', SESSION_2_STANDARDS)).toThrow(
      'Unclosed',
    );
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([['not Qtegra']]),
      'Other',
    );
    expect(() =>
      importWorkbook(
        XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }),
        SESSION_2_STANDARDS,
      ),
    ).toThrow('no Sheet1');
    workbook.SheetNames = ['Sheet1'];
    workbook.Sheets.Sheet1 = workbook.Sheets.Other!;
    expect(() =>
      importWorkbook(
        XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }),
        SESSION_2_STANDARDS,
      ),
    ).toThrow('header row');
  });
});
