import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import * as XLSX from 'xlsx';
import { QTEGRA_COLUMNS } from '../src/lib/engine/types';
import { commitCell, generatedExample } from './helpers';

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

test('example generates both sessions without warnings and exports the exact BIFF8 fixture', async ({
  page,
}, testInfo) => {
  await generatedExample(page);
  await expect(page.getByRole('grid').locator('tbody tr')).toHaveCount(332);
  await expect(page.getByTestId('warnings')).toHaveText('No warnings');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export .xls', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(
    'Zircon_04Nov26_Synthetic_2.xls',
  );
  const output = testInfo.outputPath('session-2.xls');
  await download.saveAs(output);
  expect(cells(await readFile(output))).toEqual(
    cells(await readFile('fixtures/session-2.xls')),
  );
  await page.getByRole('button', { name: 'Session 3', exact: true }).click();
  await expect(page.getByTestId('counts')).toContainText('324 rows');
  await expect(page.getByRole('grid').locator('tbody tr')).toHaveCount(324);
  await expect(page.getByTestId('warnings')).toHaveText('No warnings');
});

test('Copy for Qtegra writes 332 TSV rows with exact boolean and number text', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await generatedExample(page);
  await page
    .getByRole('button', { name: 'Copy for Qtegra', exact: true })
    .click();
  await expect(page.getByRole('status')).toHaveText('Copied 332 rows');
  const text = await page.evaluate(() => navigator.clipboard.readText());
  const lines = text.replace(/\r\n$/u, '').split(/\r?\n/u);
  expect(lines).toHaveLength(332);
  expect(lines[0]!.split('\t')).toEqual([
    'NIST612_875',
    '',
    '30',
    '<Comment>',
    'TRUE',
    'UNKNOWN',
    '',
    '1',
    '',
    '',
    '<Identifier>',
    '875',
    '46',
  ]);
  expect(lines.every((line) => line.split('\t').length === 13)).toBe(true);
});

test('duplicate warning selects its rows and regeneration protects manual edits', async ({
  page,
}) => {
  await generatedExample(page);
  await commitCell(page, 'Row 2 Laser Scan Position Number', '875');
  const warning = page.getByRole('button', {
    name: 'Rows 1, 2 share spot 875.',
    exact: true,
  });
  await expect(warning).toBeVisible();
  await warning.click();
  await expect(
    page.getByRole('grid').locator('tr[aria-selected="true"]'),
  ).toHaveCount(2);
  await expect(
    page.getByRole('button', { name: 'Select row 1', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByRole('button', { name: 'Select row 2', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Replace manual edits?' });
  await expect(dialog).toContainText('656 rows');
  await expect(
    dialog.getByRole('button', { name: 'Cancel', exact: true }),
  ).toBeFocused();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(warning).toBeVisible();
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  await dialog.getByRole('button', { name: 'Regenerate', exact: true }).click();
  await expect(page.getByTestId('warnings')).toHaveText('No warnings');
});

test('unknown paste shows line errors and fills the editable table', async ({
  page,
}) => {
  await page.goto('/');
  const paste = page.getByRole('textbox', {
    name: 'Paste unknowns',
    exact: true,
  });
  await paste.fill('SYN-H3 S 1-30\nbad line');
  await expect(
    page.getByText('Line 2: bad line', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Add pasted unknowns', exact: true }),
  ).toBeDisabled();
  await paste.fill('SYN-H3 S 1-30\nHH4 S 31-55');
  await page
    .getByRole('button', { name: 'Add pasted unknowns', exact: true })
    .click();
  await expect(
    page.getByRole('textbox', { name: 'Unknown 1 name', exact: true }),
  ).toHaveValue('SYN-H3');
  await expect(
    page.getByRole('spinbutton', { name: 'Unknown 2 to', exact: true }),
  ).toHaveValue('55');
  await expect(page.getByTestId('unknown-total')).toHaveText(
    '55 unknowns in this session',
  );
});

test('row actions and keyboard undo and redo preserve edits and numeric types', async ({
  page,
}) => {
  await generatedExample(page);
  await commitCell(page, 'Row 1 Duration [s]', '45');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(
    page.getByRole('spinbutton', { name: 'Row 1 Duration [s]', exact: true }),
  ).toHaveValue('30');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(
    page.getByRole('spinbutton', { name: 'Row 1 Duration [s]', exact: true }),
  ).toHaveValue('45');
  await page.getByRole('button', { name: 'Select row 1', exact: true }).click();
  await page
    .getByRole('button', { name: 'Select row 2', exact: true })
    .click({ modifiers: ['Shift'] });
  await page.keyboard.press('Alt+ArrowDown');
  await expect(
    page.getByRole('textbox', { name: 'Row 1 Label', exact: true }),
  ).toHaveValue('NIST612_877');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(
    page.getByRole('textbox', { name: 'Row 1 Label', exact: true }),
  ).toHaveValue('NIST612_875');
  await page.getByRole('button', { name: 'Insert below', exact: true }).click();
  await expect(page.getByTestId('counts')).toContainText('333 rows');
  await page.getByRole('button', { name: 'Delete rows', exact: true }).click();
  await expect(page.getByTestId('counts')).toContainText('332 rows');
});

test('cell edits do not replan the project and record browser edit timings', async ({
  page,
}, testInfo) => {
  await generatedExample(page);
  const planStart = await page.evaluate(
    () => performance.getEntriesByName('bracketeer.plan').at(-1)!.startTime,
  );
  const times: number[] = [];
  for (let i = 0; i < 10; i++) {
    const name = 'Row 1 Duration [s]';
    const before = await page.evaluate(
      () =>
        performance.getEntriesByName('bracketeer.cell-edit').at(-1)
          ?.startTime ?? -1,
    );
    await commitCell(page, name, String(31 + i));
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            performance.getEntriesByName('bracketeer.cell-edit').at(-1)
              ?.startTime ?? -1,
        ),
      )
      .toBeGreaterThan(before);
    times.push(
      await page.evaluate(
        () =>
          performance.getEntriesByName('bracketeer.cell-edit').at(-1)!.duration,
      ),
    );
  }
  expect(
    await page.evaluate(
      () => performance.getEntriesByName('bracketeer.plan').at(-1)!.startTime,
    ),
  ).toBe(planStart);
  await testInfo.attach('browser-timings.json', {
    body: JSON.stringify(
      {
        rows: 332,
        columns: 13,
        editMilliseconds: times,
        generationMilliseconds: await page.evaluate(
          () =>
            performance.getEntriesByName('bracketeer.generate').at(-1)
              ?.duration,
        ),
      },
      null,
      2,
    ),
    contentType: 'application/json',
  });
});
