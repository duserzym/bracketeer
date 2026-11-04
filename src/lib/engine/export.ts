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

// TODO (milestone 2): XLSX/XLS bytes via the official SheetJS 0.20.3 tarball.
