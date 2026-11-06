import { readFile } from 'node:fs/promises';
import type { Project } from '../src/lib/engine/types';
import { expect, test } from '@playwright/test';
import { menuAction, startZircon } from './helpers';

test('launch offers nine minerals and Zircon has the lab preselection and rotation', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('welcome-panel')).toBeVisible();
  const tiles = page
    .getByRole('radiogroup', { name: 'Mineral', exact: true })
    .getByRole('radio');
  await expect(tiles).toHaveText([
    'Zircon',
    'Apatite',
    'Rutile',
    'Titanite',
    'Garnet',
    'Monazite',
    'Xenotime',
    'Carbonate',
    'Other',
  ]);
  await expect(
    page.getByRole('button', { name: 'Next: unknowns', exact: true }),
  ).toBeDisabled();
  await page
    .getByRole('button', { name: 'Choose a mineral', exact: true })
    .click();
  await expect(tiles.first()).toBeFocused();
  await tiles.first().click();
  await expect(
    page.getByRole('radio', { name: 'Use S513', exact: true }),
  ).toBeChecked();
  const secondaries = page.getByRole('region', {
    name: 'Secondaries',
    exact: true,
  });
  const checked = secondaries.locator('input[type="checkbox"]:checked');
  await expect(checked).toHaveCount(4);
  expect(
    await checked.evaluateAll((els) =>
      els.map((el) => el.getAttribute('aria-label')),
    ),
  ).toEqual(['Use Seiland', 'Use 91500', 'Use PL', 'Use LTSE']);
  await expect(
    secondaries.getByLabel('Rotation number', { exact: true }),
  ).toHaveText(['1', '2', '3', '4']);
  for (const name of ['NIST610', 'NIST612'])
    await expect(
      page.getByRole('checkbox', { name: `Use ${name}`, exact: true }),
    ).toBeChecked();
  await page
    .getByRole('button', { name: 'Next: unknowns', exact: true })
    .click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(
    page.getByRole('radio', { name: 'Use S513', exact: true }),
  ).toBeChecked();
  await expect(checked).toHaveCount(4);
});

test('Garnet requires a primary and its edited catalogue survives reload', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('radio', { name: 'Garnet', exact: true }).click();
  const next = page.getByRole('button', {
    name: 'Next: unknowns',
    exact: true,
  });
  await expect(next).toBeDisabled();
  await page
    .getByRole('button', { name: 'Add your primary standard', exact: true })
    .click();
  const add = page.getByRole('textbox', {
    name: 'Add primary standard',
    exact: true,
  });
  await expect(add).toBeFocused();
  await add.fill('Lab garnet');
  await page
    .getByRole('button', { name: 'Add to primary', exact: true })
    .click();
  await expect(
    page.getByRole('radio', { name: 'Use Lab garnet', exact: true }),
  ).toBeChecked();
  await expect(next).toBeEnabled();
  await next.click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(
    page.getByRole('radio', { name: 'Use Lab garnet', exact: true }),
  ).toBeChecked();
  await page.reload();
  await expect(page.getByTestId('welcome-panel')).toBeVisible();
  await page.getByRole('radio', { name: 'Garnet', exact: true }).click();
  await expect(
    page.getByRole('radio', { name: 'Use Lab garnet', exact: true }),
  ).toBeChecked();
});

test('tiles and wizard navigation work from the keyboard and Back keeps the paste draft', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('radio', { name: 'Zircon', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(
    page.getByRole('radio', { name: 'Apatite', exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(
    page.getByRole('button', { name: '2 Unknowns', exact: true }),
  ).toHaveAttribute('aria-current', 'step');
  await expect(
    page.getByRole('button', { name: '4 Review', exact: true }),
  ).toBeDisabled();
  const paste = page.getByRole('textbox', {
    name: 'Paste unknowns',
    exact: true,
  });
  await paste.fill('draft');
  await paste.press('Alt+ArrowLeft');
  await expect(paste).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).focus();
  await page.keyboard.press('Alt+ArrowLeft');
  await page
    .getByRole('button', { name: 'Next: unknowns', exact: true })
    .click();
  await expect(paste).toHaveValue('draft');
});

test('switching mineral with unknowns confirms and keeps unknowns', async ({
  page,
}) => {
  await startZircon(page);
  await page
    .getByRole('textbox', { name: 'Paste unknowns', exact: true })
    .fill('Sample 1-4');
  await page
    .getByRole('button', { name: 'Add pasted unknowns', exact: true })
    .click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toBe(
      'Switch to Apatite? Unknowns are kept; the standards list changes.',
    );
    await dialog.accept();
  });
  await page.getByRole('radio', { name: 'Apatite', exact: true }).click();
  await page
    .getByRole('button', { name: 'Next: unknowns', exact: true })
    .click();
  await expect(
    page.getByRole('textbox', { name: 'Unknown 1 name', exact: true }),
  ).toHaveValue('Sample');
});

test('Open example derives step 3, and project menu can start blank', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open example', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '3 Bracketing', exact: true }),
  ).toHaveAttribute('aria-current', 'step');
  await menuAction(page, 'New project');
  await expect(page.getByTestId('welcome-panel')).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: 'Experiment title', exact: true }),
  ).toHaveValue('');
});

test('a stored later step with missing pools opens at the first blocking step and focuses the pool', async ({
  page,
}) => {
  await page.goto('/');
  const project = JSON.parse(
    await readFile('fixtures/session-1.bracketeer.json', 'utf8'),
  ) as Project;
  project.standards[0]!.ranges = [];
  const chooser = page.waitForEvent('filechooser');
  await menuAction(page, 'Open project');
  await (
    await chooser
  ).setFiles({
    name: 'incomplete.bracketeer.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({ ...project, wizard: { step: 4, mineral: 'zircon' } }),
    ),
  });
  await expect(
    page.getByRole('button', { name: '2 Unknowns', exact: true }),
  ).toHaveAttribute('aria-current', 'step');
  await expect(
    page.getByRole('button', { name: 'Next: bracketing', exact: true }),
  ).toBeDisabled();
  await page
    .getByRole('button', { name: 'Add a pool for S513', exact: true })
    .click();
  await expect(
    page.getByRole('textbox', { name: 'S513 ranges', exact: true }),
  ).toBeFocused();
});

test('checked secondary order, group changes and Restore list persist in the catalogue', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('radio', { name: 'Zircon', exact: true }).click();
  await page.getByRole('button', { name: 'Move PL up', exact: true }).click();
  const group = page.getByRole('region', { name: 'Secondaries', exact: true });
  expect(
    await group
      .locator('input[type="checkbox"]:checked')
      .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label'))),
  ).toEqual(['Use Seiland', 'Use PL', 'Use 91500', 'Use LTSE']);
  await page
    .getByRole('textbox', { name: 'Rename PL', exact: true })
    .fill('Lab PL');
  await page
    .getByRole('combobox', { name: 'Lab PL group', exact: true })
    .selectOption('reference');
  await expect(
    page
      .getByRole('region', { name: 'Reference glasses', exact: true })
      .getByRole('checkbox', { name: 'Use Lab PL', exact: true }),
  ).toBeChecked();
  await page.getByRole('button', { name: 'Remove FC1', exact: true }).click();
  await page.reload();
  await page.getByRole('radio', { name: 'Zircon', exact: true }).click();
  await expect(
    page.getByRole('checkbox', { name: 'Use FC1', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('checkbox', { name: 'Use Lab PL', exact: true }),
  ).toBeChecked();
  await page.getByRole('button', { name: 'Restore list', exact: true }).click();
  await expect(
    page.getByRole('checkbox', { name: 'Use FC1', exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByRole('checkbox', { name: 'Use PL', exact: true }),
  ).toBeChecked();
});
