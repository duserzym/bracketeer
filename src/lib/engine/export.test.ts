import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { exportWorkbook, toCSV, toTSV, toWorksheet } from './export';
import { DEFAULT_EXPERIMENT, QTEGRA_COLUMNS, type Row } from './types';

const row: Row = {
  ...DEFAULT_EXPERIMENT.defaults,
  Label: 'SYN-1_S_1',
  Status: null,
  'Laser Scan Position Number': 1,
  meta: { kind: 'unknown', name: 'SYN-1', block: 'unknowns' },
};
const header =
  'Label,Status,Duration [s],Comment,Evaluate,Sample Type,Standard,Dilution Factor,Amount,Final Quantity,Identifier,Laser Scan Position Number,Laser Output Setting [%]';

describe('Qtegra text exports', () => {
  it('exports exactly 13 ordered columns, no metadata/header, TRUE and CRLF for clipboard', () => {
    expect(toTSV([row])).toBe(
      'SYN-1_S_1\t\t30\t<Comment>\tTRUE\tUNKNOWN\t\t1\t\t\t<Identifier>\t1\t46\r\n',
    );
    const text = toTSV([
      row,
      { ...row, Label: 'S513_?', 'Laser Scan Position Number': null },
    ]);
    expect(text.split('\r\n')).toHaveLength(3);
    expect(text.split('\r\n')[0]?.split('\t')).toHaveLength(13);
    expect(text).toContain('S513_?\t');
    expect(text).not.toContain('meta');
    expect(text).not.toContain('Label');
    expect(text).not.toContain('30.0');
    expect(toTSV([])).toBe('');
  });

  it('writes the exact CSV header and default cell types as text', () => {
    expect(QTEGRA_COLUMNS.join(',')).toBe(header);
    expect(toCSV([row])).toBe(
      `${header}\r\nSYN-1_S_1,,30,<Comment>,TRUE,UNKNOWN,,1,,,<Identifier>,1,46\r\n`,
    );
    expect(toCSV([])).toBe(`${header}\r\n`);
  });

  it('uses RFC 4180 quoting for commas, double quotes and embedded CR/LF', () => {
    const edited = {
      ...row,
      Label: 'A,B',
      Comment: 'said "yes"\r\nnext',
      Identifier: 'line\n2',
      Evaluate: false,
      'Duration [s]': 2.5,
    };
    expect(toCSV([edited])).toBe(
      `${header}\r\n"A,B",,2.5,"said ""yes""\r\nnext",FALSE,UNKNOWN,,1,,,"line\n2",1,46\r\n`,
    );
    expect(
      toTSV([{ ...row, Evaluate: false, 'Dilution Factor': 1.25 }]),
    ).toContain('\tFALSE\tUNKNOWN\t\t1.25\t');
  });
});

it('writes an unstyled Sheet1 with explicit types and absent Status/exhausted position cells', () => {
  const rows = [
    row,
    { ...row, Label: 'S513_?', 'Laser Scan Position Number': null },
  ];
  const sheet = toWorksheet(rows);
  expect(sheet.A1).toEqual({ t: 's', v: 'Label' });
  expect(sheet.B2).toBeUndefined();
  expect(sheet.C2).toEqual({ t: 'n', v: 30 });
  expect(sheet.E2).toEqual({ t: 'b', v: true });
  expect(sheet.G2).toEqual({ t: 's', v: '' });
  expect(sheet.I2).toEqual({ t: 's', v: '' });
  expect(sheet.J2).toEqual({ t: 's', v: '' });
  expect(sheet.L2).toEqual({ t: 'n', v: 1 });
  expect(sheet.L3).toBeUndefined();
  expect(sheet['!cols']).toBeUndefined();
  expect(sheet.A2!.s).toBeUndefined();
  for (const format of ['xls', 'xlsx'] as const) {
    const bytes = exportWorkbook(rows, format);
    const workbook = XLSX.read(bytes);
    expect(workbook.SheetNames).toEqual(['Sheet1']);
    const restored = workbook.Sheets.Sheet1!;
    expect(restored.B2).toBeUndefined();
    expect(restored.L3).toBeUndefined();
    expect(restored.E2!.t).toBe('b');
    for (const c of ['G2', 'I2', 'J2'])
      expect(restored[c]).toMatchObject({ t: 's', v: '' });
    expect(Object.keys(restored).some((k) => k.includes('meta'))).toBe(false);
  }
  expect(exportWorkbook(rows)).toEqual(exportWorkbook(rows, 'xls'));
  expect(XLSX.read(exportWorkbook([])).Sheets.Sheet1!['!ref']).toBe('A1:M1');
});
