import * as XLSX from 'xlsx';
import { QTEGRA_COLUMNS, type Row } from './types';

function cells(row: Row): string[] {
  return QTEGRA_COLUMNS.map((column) => {
    const value = row[column];
    if (value === null) return '';
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    return String(value);
  });
}

/** Qtegra clipboard text: literal tabs, no header, CRLF including the final row. */
export function toTSV(rows: readonly Row[]): string {
  return rows.map((row) => cells(row).join('\t') + '\r\n').join('');
}

/** Header plus RFC 4180 fields, boolean literals, and CRLF records. */
export function toCSV(rows: readonly Row[]): string {
  const quote = (value: string) =>
    /[",\r\n]/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
  return [QTEGRA_COLUMNS, ...rows.map(cells)]
    .map((record) => record.map(quote).join(',') + '\r\n')
    .join('');
}

/** A fresh, unstyled Sheet1 with explicit Qtegra cell types. */
export function toWorksheet(rows: readonly Row[]): XLSX.WorkSheet {
  const sheet: XLSX.WorkSheet = {};
  QTEGRA_COLUMNS.forEach((column, c) => {
    sheet[XLSX.utils.encode_cell({ r: 0, c })] = { t: 's', v: column };
  });
  rows.forEach((row, r) =>
    QTEGRA_COLUMNS.forEach((column, c) => {
      const value = row[column];
      // Status and exhausted positions must have no cell, even in BIFF8.
      if (column === 'Status' || value === null) return;
      sheet[XLSX.utils.encode_cell({ r: r + 1, c })] = {
        t:
          typeof value === 'boolean'
            ? 'b'
            : typeof value === 'number'
              ? 'n'
              : 's',
        v: value,
      };
    }),
  );
  sheet['!ref'] = `A1:M${rows.length + 1}`;
  return sheet;
}

/** BIFF8 is the default instrument format; bytes work in browsers and Node. */
export function exportWorkbook(
  rows: readonly Row[],
  format: 'xls' | 'xlsx' = 'xls',
): Uint8Array {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, toWorksheet(rows), 'Sheet1');
  return new Uint8Array(
    XLSX.write(workbook, {
      type: 'array',
      bookType: format === 'xls' ? 'biff8' : 'xlsx',
      cellStyles: false,
    }),
  );
}
