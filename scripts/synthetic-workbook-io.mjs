// SheetJS bridge for the independent Python fixture generator and verifier.
// Deliberately does not import the app's engine or its export helpers.
import { readFileSync, writeFileSync } from 'node:fs';
import * as XLSX from 'xlsx';

const input = JSON.parse(readFileSync(0, 'utf8'));
if (process.argv[2] === 'write') {
  for (const { path, table } of input) {
    const sheet = {};
    table.forEach((row, r) =>
      row.forEach((value, c) => {
        if (value === null) return;
        sheet[XLSX.utils.encode_cell({ r, c })] = {
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
    sheet['!ref'] = `A1:M${table.length}`;
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Sheet1');
    writeFileSync(
      path,
      XLSX.write(book, {
        type: 'buffer',
        bookType: path.endsWith('.xls') ? 'biff8' : 'xlsx',
        cellStyles: false,
      }),
    );
  }
} else if (process.argv[2] === 'read') {
  process.stdout.write(
    JSON.stringify(
      input.map((path) => {
        const book = XLSX.read(readFileSync(path));
        if (book.SheetNames.join() !== 'Sheet1')
          throw new Error('Expected only Sheet1');
        const sheet = book.Sheets.Sheet1;
        const range = XLSX.utils.decode_range(sheet['!ref']);
        return Array.from({ length: range.e.r + 1 }, (_, r) =>
          Array.from({ length: 13 }, (_, c) => {
            const cell = sheet[XLSX.utils.encode_cell({ r, c })];
            return cell ? { t: cell.t, v: cell.v } : null;
          }),
        );
      }),
    ),
  );
} else {
  throw new Error('Expected read or write');
}
