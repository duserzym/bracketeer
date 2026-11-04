import { expect, test } from '@playwright/test';
import { commitCell, generatedExample } from './helpers';

test('light is the default, Dark persists, and System follows the OS', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(
    page.getByRole('combobox', { name: 'Theme', exact: true }),
  ).toHaveValue('light');
  await page
    .getByRole('combobox', { name: 'Theme', exact: true })
    .selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page
    .getByRole('combobox', { name: 'Theme', exact: true })
    .selectOption('system');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('autosave restores rows, manual edit protection, and layout without storing theme in project', async ({
  page,
}) => {
  await generatedExample(page);
  await commitCell(page, 'Row 2 Laser Scan Position Number', '875');
  await page.getByRole('button', { name: 'Fold inputs', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const stored = JSON.parse(
          localStorage.getItem('bracketeer.project') ?? 'null',
        );
        return stored?.sessions[1]?.rows[1]?.['Laser Scan Position Number'];
      }),
    )
    .toBe(875);
  await page.reload();
  await expect(page.getByTestId('counts')).toContainText('332 rows');
  await expect(
    page.getByRole('button', { name: 'Unfold inputs', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: 'Rows 1, 2 share spot 875.',
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Replace manual edits?' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('bracketeer.project')!),
  );
  expect(stored).not.toHaveProperty('theme');
  expect(stored).not.toHaveProperty('layout');
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('button', { name: 'Reset layout', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Fold inputs', exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('bracketeer.layout')))
    .toBeNull();
});

test('fixed sessions are locked, marking as run advances rotation, and plus adds an empty session', async ({
  page,
}) => {
  await generatedExample(page);
  await page
    .getByRole('button', { name: 'Session 1 · imported', exact: true })
    .click();
  await expect(
    page.getByRole('textbox', { name: 'Row 1 Label', exact: true }),
  ).toHaveAttribute('readonly', '');
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: 'Row 1 Label', exact: true }),
  ).not.toHaveAttribute('readonly', '');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: 'Session 2', exact: true }).click();
  await page.getByRole('button', { name: 'Mark as run', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Session 2 · run', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'New session from current', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Session 4', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('counts')).toContainText('0 rows');
});

test('imports a workbook into a new fixed session and imports pasted standard usage', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Import sequence', exact: true })
    .click();
  const chooserPromise = page.waitForEvent('filechooser');
  await page
    .getByRole('button', { name: 'Choose .xls, .xlsx or .csv', exact: true })
    .click();
  await (await chooserPromise).setFiles('fixtures/session-1.xls');
  await expect(page.getByTestId('counts')).toContainText('245 rows');
  await expect(
    page.getByRole('button', { name: 'Session 2 · imported', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Import sequence', exact: true })
    .click();
  await page
    .getByRole('combobox', { name: 'Import destination', exact: true })
    .selectOption('used');
  await page
    .getByRole('textbox', { name: 'Paste sequence', exact: true })
    .fill(
      'S513_650\t\t30\t<Comment>\tTRUE\tUNKNOWN\t\t1\t\t\t<Identifier>\t650\t46',
    );
  await page
    .getByRole('button', { name: 'Import pasted sequence', exact: true })
    .click();
  await expect(
    page.getByRole('textbox', { name: 'S513 used', exact: true }),
  ).toHaveValue('650');
});

test('Save project and Open project round-trip the experiment and generated rows', async ({
  page,
}, testInfo) => {
  await generatedExample(page);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(
    'Zircon_04Nov26_Synthetic.bracketeer.json',
  );
  const file = testInfo.outputPath('round-trip.bracketeer.json');
  await download.saveAs(file);
  await page
    .getByRole('textbox', { name: 'Experiment title', exact: true })
    .fill('Changed');
  await page
    .getByRole('textbox', { name: 'Experiment title', exact: true })
    .press('Tab');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open project', exact: true }).click();
  await (await chooser).setFiles(file);
  await expect(
    page.getByRole('textbox', { name: 'Experiment title', exact: true }),
  ).toHaveValue('Zircon_04Nov26_Synthetic');
  await expect(page.getByTestId('counts')).toContainText('332 rows');
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByTestId('warnings')).toHaveText('No warnings');
});
