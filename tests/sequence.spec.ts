import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import * as XLSX from 'xlsx';
import { toTSV } from '../src/lib/engine/export';
import { planProject } from '../src/lib/engine/sequence';
import { parseProject } from '../src/lib/engine/project';
import { QTEGRA_COLUMNS } from '../src/lib/engine/types';
import {
  commitCell,
  exampleBracketing,
  generatedExample,
  startZircon,
} from './helpers';

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

test('the four-step example plans the shared budget and exports both exact BIFF8 fixtures', async ({
  page,
}, testInfo) => {
  await exampleBracketing(page);
  const summary = page.getByTestId('plan-summary');
  await expect(summary).toContainText('2 sessions planned');
  await expect(summary).toContainText(
    'Session 1, imported, 245 rows, read-only',
  );
  await expect(page.getByTestId('budget')).toHaveText(
    '37 brackets for 2 sessions (19 + 18), 40 secondary pairs. Doubled brackets: 13, 25, 37.',
  );
  await expect(page.getByTestId('session-plan-2')).toContainText(
    '6 × 13, 13 × 12',
  );
  await expect(page.getByTestId('session-plan-2')).toContainText(
    '19 brackets · Mid block: bracket 10',
  );
  await expect(page.getByTestId('session-plan-3')).toContainText(
    '12 × 13, 6 × 12',
  );
  await expect(page.getByTestId('session-plan-3')).toContainText(
    '18 brackets · Mid block: bracket 9',
  );
  await expect(page.getByTestId('placed-S513')).toHaveText('78 / 78');
  await page
    .getByRole('button', { name: 'Generate and review', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: '4 Review', exact: true }),
  ).toHaveAttribute('aria-current', 'step');
  for (const [number, rows] of [
    [2, 332],
    [3, 324],
  ]) {
    await page
      .getByRole('button', { name: `Session ${number}`, exact: true })
      .click();
    await expect(page.getByRole('grid').locator('tbody tr')).toHaveCount(rows!);
    await expect(page.getByTestId('counts')).toContainText(`${rows} rows`);
    await expect(page.getByTestId('warnings')).toHaveText('No warnings');
    const downloadPromise = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Export .xls', exact: true })
      .click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(
      `synthetic-zircon-2026-11-04_${number}.xls`,
    );
    const output = testInfo.outputPath(`session-${number}.xls`);
    await download.saveAs(output);
    expect(cells(await readFile(output))).toEqual(
      cells(await readFile(`fixtures/synthetic-session-${number}.xls`)),
    );
  }
});

test('Copy and the Qtegra paste table equal toTSV byte for byte and keep the copy notice', async ({
  page,
  context,
  browserName,
}) => {
  // WebKit has no clipboard permissions to grant; it checks the paste table only.
  const clipboard = browserName === 'chromium';
  if (clipboard)
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await generatedExample(page);
  const project = parseProject(
    await readFile('fixtures/synthetic-session-1.bracketeer.json', 'utf8'),
  );
  const expected = toTSV(planProject(project).sessions[1]!.rows);
  await page
    .getByRole('button', { name: 'Copy for Qtegra', exact: true })
    .click();
  const notice = page.getByRole('status');
  await expect(notice).toHaveText(
    'Copied 332 rows. Paste into the LabBook sample list.',
  );
  if (clipboard)
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      expected,
    );
  await page.getByRole('button', { name: 'Qtegra paste', exact: true }).click();
  await expect(page.getByText('Copied 332 rows.')).toHaveCount(0);
  const paste = page.getByRole('table', { name: 'Qtegra paste', exact: true });
  await expect(paste.locator('tbody tr')).toHaveCount(332);
  await expect(paste.locator('thead th[title]')).toHaveText(
    'ABCDEFGHIJKLM'.split(''),
  );
  expect(
    await paste
      .locator('thead th[title]')
      .evaluateAll((headers) =>
        headers.map((cell) => cell.getAttribute('title')),
      ),
  ).toEqual([...QTEGRA_COLUMNS]);
  expect(
    await paste
      .locator('tbody tr')
      .evaluateAll((rows) =>
        rows
          .map(
            (row) =>
              [...row.querySelectorAll('td')]
                .map((cell) => cell.textContent)
                .join('\t') + '\r\n',
          )
          .join(''),
      ),
  ).toBe(expected);
  await expect(paste.locator('input')).toHaveCount(0);
  await page
    .locator('.paste-heading')
    .getByRole('button', { name: 'Copy for Qtegra', exact: true })
    .click();
  if (clipboard)
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      expected,
    );
  await expect(notice).toHaveText(
    'Copied 332 rows. Paste into the LabBook sample list.',
  );
  // The old toast timed out after four seconds; a copy notice must survive that timer.
  await page.waitForTimeout(4200);
  await expect(notice).toHaveText(
    'Copied 332 rows. Paste into the LabBook sample list.',
  );
  await page.getByRole('button', { name: 'Grid', exact: true }).click();
  await expect(page.getByText('Copied 332 rows.')).toHaveCount(0);
  await expect(page.getByRole('grid').locator('tbody tr')).toHaveCount(332);
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
  await page.getByRole('button', { name: '3 Bracketing', exact: true }).click();
  await page.getByRole('button', { name: '4 Review', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Replace manual edits?' });
  await expect(dialog).toContainText('656 rows');
  await expect(
    dialog.getByRole('button', { name: 'Cancel', exact: true }),
  ).toBeFocused();
  await expect(dialog.getByRole('button')).toHaveCount(3);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '3 Bracketing', exact: true }),
  ).toHaveAttribute('aria-current', 'step');
  await page
    .getByRole('button', { name: 'Generate and review', exact: true })
    .click();
  await dialog.getByRole('button', { name: 'Regenerate', exact: true }).click();
  await expect(page.getByTestId('warnings')).toHaveText('No warnings');
});

test('unknown paste shows line errors and fills the editable table', async ({
  page,
}) => {
  await startZircon(page);
  const paste = page.getByRole('textbox', {
    name: 'Paste unknowns',
    exact: true,
  });
  await paste.fill('SYN-1 S 1-30\nbad line');
  await expect(
    page
      .getByTestId('samples-panel')
      .getByText('Line 2: bad line', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Add pasted unknowns', exact: true }),
  ).toBeDisabled();
  await paste.fill('SYN-1 S 1-30\nSYN-2 S 31-55');
  await page
    .getByRole('button', { name: 'Add pasted unknowns', exact: true })
    .click();
  await expect(
    page.getByRole('textbox', { name: 'Unknown 1 name', exact: true }),
  ).toHaveValue('SYN-1');
  await expect(
    page.getByRole('spinbutton', { name: 'Unknown 2 begin', exact: true }),
  ).toHaveValue('31');
  await expect(
    page.getByTestId('samples-panel').getByTestId('unknown-total'),
  ).toHaveText('55 unknowns in this session');
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

test('Generate and review offers Keep my edits and returns to Review without replacing rows', async ({
  page,
}) => {
  await generatedExample(page);
  await commitCell(page, 'Row 1 Duration [s]', '47');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page
    .getByRole('button', { name: 'Generate and review', exact: true })
    .click();
  const dialog = page.getByRole('dialog', {
    name: 'Replace manual edits?',
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole('button', { name: 'Keep my edits', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: '4 Review', exact: true }),
  ).toHaveAttribute('aria-current', 'step');
  await expect(
    page.getByRole('spinbutton', { name: 'Row 1 Duration [s]', exact: true }),
  ).toHaveValue('47');
});

test('live recipe changes, invalid numbers, Sheet columns and Reset recipe work through Back', async ({
  page,
}) => {
  await exampleBracketing(page);
  const pairs = page.getByRole('spinbutton', {
    name: 'Max pairs per bracket',
    exact: true,
  });
  await pairs.fill('1');
  await pairs.press('Tab');
  await expect(page.getByTestId('budget')).toHaveText(
    '37 brackets for 2 sessions (19 + 18), 37 secondary pairs. Doubled brackets: none.',
  );
  await pairs.fill('');
  await expect(
    page.getByRole('button', { name: 'Generate and review', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: '4 Review', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '4 Review', exact: true }),
  ).toBeDisabled();
  await page
    .getByRole('button', { name: 'Next: bracketing', exact: true })
    .click();
  await expect(pairs).toHaveValue('');
  await page
    .getByRole('button', {
      name: 'Enter a valid value for Max pairs per bracket',
      exact: true,
    })
    .click();
  await expect(pairs).toBeFocused();
  await page.getByRole('button', { name: 'Reset recipe', exact: true }).click();
  await expect(
    page.getByRole('combobox', { name: 'Chunking', exact: true }),
  ).toHaveValue('size');
  await expect(
    page.getByRole('spinbutton', { name: 'Unknowns per chunk', exact: true }),
  ).toHaveValue('18');
  await page
    .getByRole('combobox', { name: 'Chunking', exact: true })
    .selectOption('budget');
  await expect(pairs).toHaveValue('2');
  await expect(
    page.getByRole('button', { name: 'Generate and review', exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole('spinbutton', { name: 'Duration [s]', exact: true }),
  ).toBeHidden();
  await page.locator('.sheet-columns summary').click();
  const duration = page.getByRole('spinbutton', {
    name: 'Duration [s]',
    exact: true,
  });
  await duration.fill('');
  await page.locator('.sheet-columns summary').click();
  await expect(
    page.getByRole('button', { name: '4 Review', exact: true }),
  ).toBeDisabled();
  await page
    .getByRole('button', {
      name: 'Enter a valid value for Duration [s]',
      exact: true,
    })
    .click();
  await expect(duration).toBeFocused();
  await duration.fill('35');
  await duration.press('Tab');
  await page.getByRole('button', { name: '4 Review', exact: true }).click();
  await expect(
    page.getByRole('spinbutton', { name: 'Row 1 Duration [s]', exact: true }),
  ).toHaveValue('35');
});

test('Review with an empty session offers a return to Bracketing', async ({
  page,
}) => {
  await exampleBracketing(page);
  await page.getByRole('button', { name: '2 Unknowns', exact: true }).click();
  await page.getByRole('button', { name: '+ Session', exact: true }).click();
  await page.getByRole('button', { name: '4 Review', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Nothing generated yet', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Open example', exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Back to bracketing', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: '3 Bracketing', exact: true }),
  ).toHaveAttribute('aria-current', 'step');
});
