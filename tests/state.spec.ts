import { expect, test } from '@playwright/test';
import {
  addCountSample,
  commitCell,
  generatedExample,
  menuAction,
  startZircon,
} from './helpers';

test('light is the default, Dark persists, and System follows the OS', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(
    page.getByRole('combobox', { name: 'Theme', exact: true }),
  ).toHaveValue('light');
  const lightCrystal = await page
    .getByRole('radio', { name: 'Zircon', exact: true })
    .locator('img')
    .getAttribute('src');
  await page
    .getByRole('combobox', { name: 'Theme', exact: true })
    .selectOption('dark');
  await expect(
    page.getByRole('radio', { name: 'Zircon', exact: true }).locator('img'),
  ).not.toHaveAttribute('src', lightCrystal!);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page
    .getByRole('combobox', { name: 'Theme', exact: true })
    .selectOption('system');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('Continue restores autosaved rows and manual edit protection without storing theme in project', async ({
  page,
}) => {
  await generatedExample(page);
  await commitCell(page, 'Row 2 Laser Scan Position Number', '875');
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
  await expect(page.getByTestId('welcome-panel')).toBeVisible();
  await page.getByRole('button', { name: /^Continue:/ }).click();
  await expect(page.getByTestId('counts')).toContainText('332 rows');
  await expect(
    page.getByRole('button', {
      name: 'Rows 1, 2 share spot 875.',
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole('button', { name: '3 Bracketing', exact: true }).click();
  await page
    .getByRole('button', { name: 'Generate and review', exact: true })
    .click();
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
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('bracketeer.layout')))
    .toBeNull();
});

test('fixed sessions are locked and Start another session advances rotation and opens empty unknowns', async ({
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
  await page.getByRole('button', { name: '3 Bracketing', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Chunking', exact: true })
    .selectOption('size');
  await page
    .getByRole('button', { name: 'Generate and review', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Start another session', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Session 2 · run', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Session 4', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(
    page.getByRole('button', { name: '2 Unknowns', exact: true }),
  ).toHaveAttribute('aria-current', 'step');
  await expect(
    page.getByTestId('samples-panel').getByTestId('unknown-total'),
  ).toContainText('0 unknowns');
  await expect(
    page.getByRole('textbox', { name: 'Unknown 1 name', exact: true }),
  ).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const stored = JSON.parse(
          localStorage.getItem('bracketeer.project') ?? 'null',
        );
        return stored?.recipe?.rotationStart;
      }),
    )
    .toBe(1); // 13 pairs from Seiland end on Seiland; 91500 is next.
  await page
    .getByRole('button', { name: 'Next: bracketing', exact: true })
    .click();
  await expect(
    page.getByRole('spinbutton', { name: 'S513 begin', exact: true }),
  ).toHaveValue('628');
  await expect(page.getByTestId('standard-S513')).toContainText(
    'Session 2 used:',
  );
  await expect
    .poll(() =>
      page.evaluate(() => {
        const stored = JSON.parse(
          localStorage.getItem('bracketeer.project') ?? 'null',
        );
        return stored?.sessions?.at(-1);
      }),
    )
    .toEqual({ number: 4, unknowns: [], rows: [], fixed: false });
});

test('imports a workbook into a new fixed session and imports pasted standard usage', async ({
  page,
}) => {
  await startZircon(page);
  await menuAction(page, 'Import sequence');
  const chooserPromise = page.waitForEvent('filechooser');
  await page
    .getByRole('button', { name: 'Choose .xls, .xlsx or .csv', exact: true })
    .click();
  await (await chooserPromise).setFiles('fixtures/synthetic-session-1.xls');
  await expect(page.getByTestId('counts')).toContainText('245 rows');
  await expect(
    page.getByRole('button', { name: 'Session 2 · imported', exact: true }),
  ).toBeVisible();
  await menuAction(page, 'Import sequence');
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
  await page.getByRole('button', { name: '2 Unknowns', exact: true }).click();
  await page.getByRole('button', { name: 'Session 1', exact: true }).click();
  await addCountSample(page, 'New sample', 1, 1);
  await page
    .getByRole('button', { name: 'Next: bracketing', exact: true })
    .click();
  await expect(
    page.getByRole('textbox', { name: 'S513 used', exact: true }),
  ).toHaveValue('650');
});

test('Save and Open project restore step, mineral, experiment and generated rows', async ({
  page,
}, testInfo) => {
  await generatedExample(page);
  const downloadPromise = page.waitForEvent('download');
  await menuAction(page, 'Save project');
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(
    'synthetic-zircon-2026-11-04.bracketeer.json',
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
  await menuAction(page, 'Open project');
  await (await chooser).setFiles(file);
  await expect(
    page.getByRole('textbox', { name: 'Experiment title', exact: true }),
  ).toHaveValue('synthetic-zircon-2026-11-04');
  await expect(page.getByTestId('counts')).toContainText('332 rows');
  await expect(
    page.getByRole('button', { name: '4 Review', exact: true }),
  ).toHaveAttribute('aria-current', 'step');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('bracketeer.project') ?? 'null')
            ?.wizard,
      ),
    )
    .toEqual({ step: 4, mineral: 'zircon' });
  await page.getByRole('button', { name: '3 Bracketing', exact: true }).click();
  await page
    .getByRole('button', { name: 'Generate and review', exact: true })
    .click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByTestId('warnings')).toHaveText('No warnings');
});

test('a saved Bracketing step restores even when the project has generated rows', async ({
  page,
}, testInfo) => {
  await generatedExample(page);
  await page.getByRole('button', { name: '3 Bracketing', exact: true }).click();
  const downloading = page.waitForEvent('download');
  await menuAction(page, 'Save project');
  const file = testInfo.outputPath('step-three.bracketeer.json');
  await (await downloading).saveAs(file);
  await page.getByRole('button', { name: '4 Review', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await menuAction(page, 'Open project');
  await (await chooser).setFiles(file);
  await expect(
    page.getByRole('button', { name: '3 Bracketing', exact: true }),
  ).toHaveAttribute('aria-current', 'step');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('bracketeer.project') ?? 'null')
            ?.wizard,
      ),
    )
    .toEqual({ step: 3, mineral: 'zircon' });
  await page.getByRole('button', { name: '1 Mineral', exact: true }).click();
  await expect(
    page.getByRole('radio', { name: 'Zircon', exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
});

test('Mark as run keeps the session list and Unlock permits editing again', async ({
  page,
}) => {
  await generatedExample(page);
  await page.getByRole('button', { name: 'Mark as run', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Session 2 · run', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(
    page.getByRole('spinbutton', { name: 'Row 1 Duration [s]', exact: true }),
  ).toHaveAttribute('readonly', '');
  await expect(
    page.getByRole('button', { name: 'Session 4', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await commitCell(page, 'Row 1 Duration [s]', '39');
  await expect(
    page.getByRole('spinbutton', { name: 'Row 1 Duration [s]', exact: true }),
  ).toHaveValue('39');
});
