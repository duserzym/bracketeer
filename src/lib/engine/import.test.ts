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
  row('SYN-K2_S_182', 182),
  row('SYN-V1_384', 384),
  row('SYN-K1_S_323', 323),
  row('SYN-A1_xs_488', 488),
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
        'SYN-K2',
        'SYN-V1',
        'SYN-K1',
        'SYN-A1',
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

describe('session derivation', () => {
  it('splits unknowns at sample/tag changes, position gaps, descending spots and standard interruptions', () => {
    const input = [
      row('A_S_1', 1),
      row('A_S_2', 2),
      row('A_S_4', 4),
      row('A_S_3', 3),
      row('A_xs_5', 5),
      row('B_6', 6),
      row('S513_650', 650),
      row('B_7', 7),
    ];
    const derived = deriveSession(input, SESSION_2_STANDARDS);
    expect(derived.unknowns).toEqual([
      { name: 'A', tag: 'S', from: 1, to: 2 },
      { name: 'A', tag: 'S', from: 4, to: 4 },
      { name: 'A', tag: 'S', from: 3, to: 3 },
      { name: 'A', tag: 'xs', from: 5, to: 5 },
      { name: 'B', tag: '', from: 6, to: 6 },
      { name: 'B', tag: '', from: 7, to: 7 },
    ]);
    expect(derived.structure.chunks).toEqual([6, 1]);
    expect(derived.structure.brackets).toEqual([
      [{ standard: 'S513', count: 1 }],
      [],
    ]);
    expect(derived.used.S513).toEqual([650]);
    expect(derived.issues).toEqual([]);
  });
  it('reports invalid unknown positions, deduplicates used spots and counts exhausted standards', () => {
    const input = [
      row('S513_650', 650),
      row('S513_650', 650),
      row('A_1', null),
      row('S513_?', null),
    ];
    const d = deriveSession(input, SESSION_2_STANDARDS);
    expect(d.used.S513).toEqual([650]);
    expect(d.unknowns).toEqual([]);
    expect(d.issues.map((i) => i.rowIndex)).toEqual([2]);
    expect(d.structure.opening).toEqual([{ standard: 'S513', count: 2 }]);
    expect(d.structure.brackets).toEqual([[{ standard: 'S513', count: 1 }]]);
    expect(deriveSession([], SESSION_2_STANDARDS).structure).toEqual({
      opening: [],
      chunks: [],
      brackets: [],
      closing: [],
    });
  });
});
