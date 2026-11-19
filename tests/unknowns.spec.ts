import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { addCountSample, commitCell, startZircon } from './helpers';
import type { Project } from '../src/lib/engine/types';

const next = (page: Page) =>
  page.getByRole('button', { name: 'Next: bracketing', exact: true });
async function pasteSamples(page: Page, text: string) {
  await page
    .getByRole('textbox', { name: 'Paste unknowns', exact: true })
    .fill(text);
  await page
    .getByRole('button', { name: 'Add pasted unknowns', exact: true })
    .click();
}
async function exampleUnknowns(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open example', exact: true }).click();
  await page.getByRole('button', { name: '2 Unknowns', exact: true }).click();
}

test('paste makes separate continued entries and keeps hand values in the project', async ({
  page,
}) => {
  await startZircon(page);
  await pasteSamples(page, 'SYN-H3, S, 1-30, 35, 40-42\nHH4 S 50-55\nHH5,S,60,65');
  await expect(
    page
      .getByRole('table', { name: 'Unknowns', exact: true })
      .getByText('↳ continued'),
  ).toHaveCount(2);
  await expect(page.getByTestId('unknown-total')).toHaveText(
    '46 unknowns in this session',
  );
  for (const [i, begin, end] of [
    [1, 1, 30],
    [2, 35, 35],
    [3, 40, 42],
    [4, 50, 55],
    [5, 60, 65],
  ]) {
    await expect(
      page.getByRole('spinbutton', { name: `Unknown ${i} begin`, exact: true }),
    ).toHaveValue(String(begin));
    await expect(
      page.getByRole('spinbutton', { name: `Unknown ${i} end`, exact: true }),
    ).toHaveValue(String(end));
  }
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('bracketeer.project') ?? 'null')
            ?.sessions[0]?.unknowns,
      ),
    )
    .toEqual([
      { name: 'SYN-H3', tag: 'S', from: 1, to: 30 },
      { name: 'SYN-H3', tag: 'S', from: 35, to: 35 },
      { name: 'SYN-H3', tag: 'S', from: 40, to: 42 },
      { name: 'SYN-H4', tag: 'S', from: 50, to: 55 },
      { name: 'SYN-H5', tag: 'S', from: 60, to: 65 },
    ]);
  await expect(next(page)).toBeEnabled();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page
    .getByRole('button', { name: 'Next: unknowns', exact: true })
    .click();
  await expect(
    page.getByRole('spinbutton', { name: 'Unknown 3 begin', exact: true }),
  ).toHaveValue('40');
});

test('overlaps block and focus the numbered field across session tabs', async ({
  page,
}) => {
  await exampleUnknowns(page);
  await commitCell(page, 'Unknown 3 begin', '31');
  await commitCell(page, 'Unknown 3 end', '32');
  const message = page.locator('.wizard-footer').getByRole('button', {
    name: 'Row 3, SYN-H5: spots 31–32 are also in row 2, SYN-H4.',
    exact: true,
  });
  await expect(next(page)).toBeDisabled();
  await page.getByRole('button', { name: 'Session 3', exact: true }).click();
  await message.click();
  await expect(
    page.getByRole('button', { name: 'Session 2', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(
    page.getByRole('spinbutton', { name: 'Unknown 3 begin', exact: true }),
  ).toBeFocused();
  await commitCell(page, 'Unknown 3 end', '83');
  await commitCell(page, 'Unknown 3 begin', '56');
  await expect(next(page)).toBeEnabled();
});

test('invalid endpoints and duplicate separated names block; pool checks belong to Bracketing', async ({
  page,
}) => {
  await exampleUnknowns(page);
  await commitCell(page, 'Unknown 3 begin', '84');
  await expect(next(page)).toBeDisabled();
  await expect(page.locator('.wizard-footer')).toContainText(
    'Row 3, SYN-H5: end must be at least begin.',
  );
  await commitCell(page, 'Unknown 3 begin', '56');
  const name = page.getByRole('textbox', {
    name: 'Unknown 3 name',
    exact: true,
  });
  await name.fill('SYN-H3');
  await name.press('Tab');
  await expect(next(page)).toBeDisabled();
  await expect(page.locator('.wizard-footer')).toContainText(
    'this name and tag are also in row 1',
  );
  await name.fill('SYN-H5');
  await name.press('Tab');
  await expect(next(page)).toBeEnabled();
  await expect(page.getByTestId('spots-panel')).toBeHidden();
  await next(page).click();
  await expect(page.getByTestId('standard-NIST610')).toContainText(
    'Session 1 used: 857–865',
  );
  await commitCell(page, 'NIST610 end', '847');
  await expect(page.getByTestId('standard-NIST610')).toContainText(
    'end must be at least begin',
  );
  await expect(
    page.getByRole('button', { name: 'Generate and review', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(next(page)).toBeEnabled();
  await next(page).click();
  await expect(
    page.getByRole('spinbutton', { name: 'NIST610 end', exact: true }),
  ).toHaveValue('847');
});

test('paste reports line errors, experiment names commit, and import remains available', async ({
  page,
}) => {
  await startZircon(page);
  const paste = page.getByRole('textbox', {
    name: 'Paste unknowns',
    exact: true,
  });
  await paste.fill('SYN-H3, S, 1-30, 35, 40-42\nHH4 S 50-55\nHH5,S,60,65\nbad');
  await expect(page.getByTestId('samples-panel')).toContainText('Line 4: bad');
  await expect(
    page.getByRole('button', { name: 'Add pasted unknowns', exact: true }),
  ).toBeDisabled();
  await pasteSamples(page, 'SYN-H3, S, 1-30, 35, 40-42\nHH4 S 50-55\nHH5,S,60,65');
  await expect(
    page.getByRole('textbox', { name: 'Unknown 5 name', exact: true }),
  ).toHaveValue('SYN-H5');
  const name = page.getByRole('textbox', {
    name: 'Experiment name',
    exact: true,
  });
  await name.fill('Mount A');
  await name.press('Tab');
  await expect(
    page.getByRole('textbox', { name: 'Experiment title', exact: true }),
  ).toHaveValue('Mount A');
  await page
    .getByRole('textbox', { name: 'Experiment title', exact: true })
    .fill('Mount B');
  await expect(name).toHaveValue('Mount B');
  await page
    .getByRole('button', { name: 'Import sequence…', exact: true })
    .click();
  await expect(
    page.getByRole('dialog', { name: 'Import sequence', exact: true }),
  ).toBeVisible();
});

test('all fixture entries stay visible, fixed rows are read-only, and empty sessions remain open', async ({
  page,
}) => {
  await exampleUnknowns(page);
  const fixture = JSON.parse(
    await readFile('fixtures/session-1.bracketeer.json', 'utf8'),
  ) as Project;
  for (const number of [2, 3]) {
    await page
      .getByRole('button', { name: `Session ${number}`, exact: true })
      .click();
    const expected = fixture.sessions.find(
      (s) => s.number === number,
    )!.unknowns;
    await expect(
      page
        .getByRole('table', { name: 'Unknowns', exact: true })
        .locator('tbody input'),
    ).toHaveCount(expected.length * 5);
    for (const [i, sample] of expected.entries()) {
      await expect(
        page.getByRole('textbox', {
          name: `Unknown ${i + 1} name`,
          exact: true,
        }),
      ).toHaveValue(sample.name);
      await expect(
        page.getByRole('spinbutton', {
          name: `Unknown ${i + 1} begin`,
          exact: true,
        }),
      ).toHaveValue(String(sample.from));
      await expect(
        page.getByRole('spinbutton', {
          name: `Unknown ${i + 1} end`,
          exact: true,
        }),
      ).toHaveValue(String(sample.to));
    }
    await expect(next(page)).toBeEnabled();
  }
  await page
    .getByRole('button', { name: 'Session 1 · imported', exact: true })
    .click();
  await expect(
    page.getByRole('spinbutton', { name: 'Unknown 1 begin', exact: true }),
  ).toHaveAttribute('readonly', '');
  await expect(
    page.getByRole('button', { name: 'Add sample', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Session 2', exact: true }).click();
  await page.getByRole('button', { name: '+ Session', exact: true }).click();
  await expect(page.getByTestId('unknown-total')).toHaveText(
    '0 unknowns in this session',
  );
  await expect(next(page)).toBeEnabled();
  await expect(page.getByTestId('samples-panel')).toContainText(
    'Session 4 has no unknowns.',
  );
  await addCountSample(page, 'New', 3, 1);
  await expect(
    page.getByRole('spinbutton', { name: 'Unknown 1 begin', exact: true }),
  ).toHaveValue('628');
});
