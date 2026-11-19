import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { addCountSample, commitCell, startZircon } from './helpers';

test('design counts, automatic chains, hand endpoints, Auto and GrainAtlas warnings', async ({
  page,
}, testInfo) => {
  await startZircon(page);
  for (const [i, name] of ['A', 'B', 'C'].entries()) {
    await addCountSample(page, name, 18, i + 1);
    await expect(
      page.getByRole('spinbutton', {
        name: `Unknown ${i + 1} begin`,
        exact: true,
      }),
    ).toHaveValue(String(i * 18 + 1));
  }
  await page
    .getByRole('button', { name: 'Next: bracketing', exact: true })
    .click();
  await expect(
    page.getByRole('combobox', { name: 'Chunking', exact: true }),
  ).toHaveValue('size');
  for (const name of [
    'S513',
    'Seiland',
    '91500',
    'PL',
    'LTSE',
    'NIST610',
    'NIST612',
  ]) {
    await expect(page.getByTestId(`placed-${name}`)).toContainText('/');
    await expect(page.getByTestId(`formula-${name}`)).not.toBeEmpty();
  }
  await expect(page.getByTestId('formula-S513')).toHaveText(
    '1 opening × 2 + 3 brackets × 2 = 8',
  );
  await expect(
    page.getByRole('spinbutton', { name: 'S513 begin', exact: true }),
  ).toHaveValue('55');
  await expect(
    page.getByRole('spinbutton', { name: 'S513 end', exact: true }),
  ).toHaveValue('62');
  await commitCell(page, 'S513 begin', '100');
  await expect(
    page.getByRole('spinbutton', { name: 'S513 end', exact: true }),
  ).toHaveValue('107');
  await expect(
    page.getByRole('spinbutton', { name: 'Seiland begin', exact: true }),
  ).toHaveValue('108');
  await commitCell(page, 'Seiland end', '120');
  const hand = page.getByRole('spinbutton', {
    name: 'Seiland end',
    exact: true,
  });
  await expect(hand).toHaveAttribute(
    'title',
    'Typed by hand; kept when rows above change.',
  );
  await commitCell(page, 'Unknowns per chunk', '9');
  await expect(hand).toHaveValue('120');
  await expect(
    page.getByRole('spinbutton', { name: 'S513 end', exact: true }),
  ).toHaveValue('113');
  await expect(page.getByTestId('formula-S513')).toContainText(
    '6 brackets × 2',
  );
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await commitCell(page, 'Unknown 3 begin', '80');
  await commitCell(page, 'Unknown 1 count', '24');
  await expect(
    page.getByRole('spinbutton', { name: 'Unknown 2 begin', exact: true }),
  ).toHaveValue('25');
  await expect(
    page.getByRole('spinbutton', { name: 'Unknown 2 end', exact: true }),
  ).toHaveValue('42');
  const third = page.getByRole('spinbutton', {
    name: 'Unknown 3 begin',
    exact: true,
  });
  await expect(third).toHaveValue('80');
  await third.focus();
  await page
    .getByRole('button', { name: 'Auto Unknown 3 begin', exact: true })
    .click();
  await expect(third).toHaveValue('43');
  await expect(third).not.toHaveAttribute('title');
  const csv = testInfo.outputPath('mount.csv');
  await writeFile(
    csv,
    'name,x_stage,y_stage,kind,grain,sample\nA_1,0,0,spot,1,A\nA_S_2,1,0,spot,2,A\n',
  );
  const chooser = page.waitForEvent('filechooser');
  await page
    .getByRole('button', { name: 'Load GrainAtlas spots…', exact: true })
    .click();
  await (await chooser).setFiles(csv);
  await expect(page.locator('.step-two')).toContainText(
    'GrainAtlas: 2 spots from mount.csv',
  );
  await expect(page.getByTestId('samples-panel')).toContainText(
    'GrainAtlas placed 2 (mount.csv)',
  );
  await expect(page.getByTestId('samples-panel')).toContainText(
    'Not placed in GrainAtlas:',
  );
  await page
    .getByRole('button', { name: 'Next: bracketing', exact: true })
    .click();
  await commitCell(page, 'S513 end', '101');
  await expect(page.getByTestId('placed-S513')).toContainText('14 short'); // ceil(60 / 9) = 7 brackets, plus opening.
  await expect(page.getByTestId('standard-S513')).toContainText(
    'S513: needs 16, 2 available (14 short).',
  );
});

test('one committed edit is one undo step, timer keeps the caret, and invalid drafts survive Back', async ({
  page,
}) => {
  await startZircon(page);
  await addCountSample(page, 'A', 18, 1);
  await addCountSample(page, 'B', 18, 2);
  const name = page.getByRole('textbox', {
    name: 'Unknown 1 name',
    exact: true,
  });
  await name.fill('Alpha');
  await name.evaluate((input: HTMLInputElement) =>
    input.setSelectionRange(2, 2),
  );
  await name.pressSequentially('x');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('bracketeer.project') ?? 'null')
            ?.sessions[0]?.unknowns[0]?.name,
      ),
    )
    .toBe('Alxpha');
  await expect(name).toBeFocused();
  expect(
    await name.evaluate((input: HTMLInputElement) => input.selectionStart),
  ).toBe(3);
  const count = page.getByRole('spinbutton', {
    name: 'Unknown 1 count',
    exact: true,
  });
  await count.fill('24');
  await expect(
    page.getByRole('spinbutton', { name: 'Unknown 2 begin', exact: true }),
  ).toHaveValue('25');
  await expect(count).toBeFocused();
  await expect(count).toHaveValue('24');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(count).toHaveValue('18');
  await expect(
    page.getByRole('spinbutton', { name: 'Unknown 2 begin', exact: true }),
  ).toHaveValue('19');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(count).toHaveValue('24');
  await count.fill('');
  await count.press('Tab');
  await expect(
    page.getByRole('button', { name: 'Next: bracketing', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page
    .getByRole('button', { name: 'Next: unknowns', exact: true })
    .click();
  await expect(count).toHaveValue('');
  await expect(
    page.getByRole('button', { name: 'Next: bracketing', exact: true }),
  ).toBeDisabled();
});

test('zircon and apatite sessions draw their own standards and share the glasses', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('radio', { name: 'Zircon', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Another mineral in this run', exact: true })
    .selectOption('apatite');
  await page
    .locator('.another-mineral')
    .getByRole('button', { name: 'Add', exact: true })
    .click();
  await expect(
    page.getByRole('radio', { name: 'Use MAD', exact: true }),
  ).toBeChecked();
  await page
    .getByRole('button', { name: 'Next: unknowns', exact: true })
    .click();
  await addCountSample(page, 'Z', 20, 1);
  await page.getByRole('button', { name: '+ Session', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Session mineral', exact: true })
    .selectOption('apatite');
  await addCountSample(page, 'A', 20, 1);
  await page
    .getByRole('button', { name: 'Next: bracketing', exact: true })
    .click();
  // Apatite has no preselected secondaries. Cadence allows a primary-only bracket.
  await page
    .getByRole('combobox', { name: 'Secondaries', exact: true })
    .selectOption('cadence');
  await page
    .getByRole('checkbox', { name: 'Opening bracket', exact: true })
    .check();
  await expect(
    page.getByRole('spinbutton', { name: 'MAD begin', exact: true }),
  ).not.toHaveValue('');
  await page
    .getByRole('button', { name: 'Generate and review', exact: true })
    .click();
  await page.getByRole('button', { name: 'Session 2', exact: true }).click();
  const labels = await page
    .getByRole('grid')
    .locator('tbody input[aria-label$=" Label"]')
    .evaluateAll((inputs) =>
      inputs.map((input) => (input as HTMLInputElement).value),
    );
  expect(labels.length).toBeGreaterThan(20);
  expect(labels.some((label) => label.startsWith('MAD_'))).toBe(true);
  expect(labels.some((label) => label.startsWith('NIST610_'))).toBe(true);
  expect(labels.some((label) => label.startsWith('NIST612_'))).toBe(true);
  expect(
    labels.every((label) => /^(A|MAD|NIST610|NIST612)_/u.test(label)),
  ).toBe(true);
  await expect(page.getByTestId('warnings')).toHaveText('No warnings');
  await page.getByRole('button', { name: '1 Mineral', exact: true }).click();
  await expect(
    page.getByRole('radio', { name: 'Use MAD', exact: true }),
  ).toBeChecked();
  await page
    .getByRole('button', { name: 'Remove Apatite', exact: true })
    .click();
  await expect(
    page.getByRole('radio', { name: 'Use MAD', exact: true }),
  ).toHaveCount(0);
});

test('single counts use singular wording and design summaries omit budget allocation', async ({
  page,
}, testInfo) => {
  await startZircon(page);
  await addCountSample(page, 'A', 1, 1);
  await expect(page.getByTestId('unknown-total')).toHaveText(
    '1 unknown in this session',
  );
  const file = testInfo.outputPath('one-spot.csv');
  await writeFile(file, 'name,x_stage\nA_1,0\n');
  const chooser = page.waitForEvent('filechooser');
  await page
    .getByRole('button', { name: 'Load GrainAtlas spots…', exact: true })
    .click();
  await (await chooser).setFiles(file);
  await expect(page.locator('.step-two')).toContainText(
    'GrainAtlas: 1 spot from one-spot.csv',
  );
  await page
    .getByRole('button', { name: 'Next: bracketing', exact: true })
    .click();
  await expect(page.getByTestId('plan-summary')).toContainText(
    '1 session planned',
  );
  await expect(page.getByTestId('session-plan-1')).toContainText(
    '1 bracket · Mid block: none',
  );
  await expect(page.getByTestId('budget')).toHaveText(
    '1 bracket, 1 secondary pair.',
  );
  await page
    .getByRole('combobox', { name: 'Secondaries', exact: true })
    .selectOption('cadence');
  await expect(page.getByTestId('budget')).toHaveText('1 bracket.');
  await page
    .getByRole('combobox', { name: 'Chunking', exact: true })
    .selectOption('budget');
  await expect(page.getByTestId('budget')).toContainText(
    '1 bracket for 1 session (1),',
  );
});
