import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import * as XLSX from 'xlsx';
import { QTEGRA_COLUMNS } from '../src/lib/engine/types';
import { startZircon } from './helpers';

function cells(bytes: Uint8Array) {
  const sheet = XLSX.read(bytes, { type: 'array' }).Sheets.Sheet1!;
  const range = XLSX.utils.decode_range(sheet['!ref']!);
  return Array.from({ length: range.e.r + 1 }, (_, r) =>
    QTEGRA_COLUMNS.map((_, c) => {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      return cell ? { t: cell.t, v: cell.v } : null;
    }),
  );
}

// Today's sessions 2 and 3 typed from scratch: no example file, no import.
// Session 1's standard use is typed into the Used lists instead.
const sessions = [
  `SYN-H3 S 1-30
SYN-H4 S 31-55
SYN-H5 S 56-83
SYN-H11 S 84-90
SYN-T1 S 91-116
SYN-T2 S 117-119
DKR1 S 120-131
SYN-W2 S 132-142
SYN-S2 S 143-167
SYN-S12 S 168-181
SYN-K2 S 182-192
SYN-W1 S 193-234`,
  `SYN-J1 xs 235-252
SYN-M1 xs 253-302
SYN-F1 xs 303-322
SYN-A1 xs 488-627`,
];
const spots: Record<string, [string, string]> = {
  S513: ['628-727', '628-649'],
  Seiland: ['758-787', '768-777'],
  '91500': ['728-757', '738-747'],
  PL: ['818-847', '828-837'],
  LTSE: ['788-817', '798-807'],
  NIST610: ['848-874', '857-865'],
  NIST612: ['875-901', '893-901'],
};

test('sessions typed through all four steps export the exact fixtures', async ({
  page,
}, testInfo) => {
  await startZircon(page);
  for (const [i, text] of sessions.entries()) {
    if (i > 0)
      await page
        .getByRole('button', { name: '+ Session', exact: true })
        .click();
    await page
      .getByRole('textbox', { name: 'Paste unknowns', exact: true })
      .fill(text);
    await page
      .getByRole('button', { name: 'Add pasted unknowns', exact: true })
      .click();
  }
  for (const [name, [pool, used]] of Object.entries(spots)) {
    for (const [field, value] of [
      ['ranges', pool],
      ['used', used],
    ] as const) {
      const input = page.getByRole('textbox', {
        name: `${name} ${field}`,
        exact: true,
      });
      await input.fill(value);
      await input.press('Tab');
    }
  }
  await page
    .getByRole('button', { name: 'Next: bracketing', exact: true })
    .click();
  await expect(page.getByTestId('budget')).toHaveText(
    '37 brackets for 2 sessions (19 + 18), 40 secondary pairs. Doubled brackets: 13, 25, 37.',
  );
  await page
    .getByRole('button', { name: 'Generate and review', exact: true })
    .click();
  for (const [number, fixture, rows] of [
    [1, 2, 332],
    [2, 3, 324],
  ] as const) {
    await page
      .getByRole('button', { name: `Session ${number}`, exact: true })
      .click();
    await expect(page.getByTestId('counts')).toContainText(`${rows} rows`);
    await expect(page.getByTestId('warnings')).toHaveText('No warnings');
    const download = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Export .xls', exact: true })
      .click();
    const output = testInfo.outputPath(`typed-${number}.xls`);
    await (await download).saveAs(output);
    expect(cells(await readFile(output))).toEqual(
      cells(await readFile(`fixtures/session-${fixture}.xls`)),
    );
  }
});
