import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { startZircon } from './helpers';
import type { Project } from '../src/lib/engine/types';
import { formatSpots } from '../src/lib/engine/parse';
import { groupUnknowns, rangeSpots } from '../src/lib/ui/unknowns';

const next = (page: Page) =>
  page.getByRole('button', { name: 'Next: bracketing', exact: true });
const field = (page: Page, row: number, name: string) =>
  page.getByRole('textbox', { name: `Unknown ${row} ${name}`, exact: true });
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

test('three samples accept spot lists, persist runs immediately and keep invalid text through navigation', async ({
  page,
}) => {
  await startZircon(page);
  for (const [i, name, spots] of [
    [1, 'SYN-H3', '1-30, 35, 40-42'],
    [2, 'SYN-H4', '50-55'],
    [3, 'SYN-H5', '60-65'],
  ] as const) {
    await page.getByRole('button', { name: 'Add sample', exact: true }).click();
    await expect(field(page, i, 'name')).toBeFocused();
    await field(page, i, 'name').fill(name);
    await field(page, i, 'tag').fill('S');
    await field(page, i, 'spots').fill(spots);
    await field(page, i, 'spots').press('Enter');
  }
  await expect(
    page.getByRole('cell', { name: '1–30, 35, 40–42 · 34 spots', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByTestId('samples-panel').getByTestId('unknown-total'),
  ).toContainText('46 unknowns');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            JSON.parse(
              localStorage.getItem('bracketeer.project') ?? 'null',
            ) as {
              sessions: { unknowns: unknown[] }[];
            } | null
          )?.sessions[0]?.unknowns,
      ),
    )
    .toEqual([
      { name: 'SYN-H3', tag: 'S', from: 1, to: 30 },
      { name: 'SYN-H3', tag: 'S', from: 35, to: 35 },
      { name: 'SYN-H3', tag: 'S', from: 40, to: 42 },
      { name: 'SYN-H4', tag: 'S', from: 50, to: 55 },
      { name: 'SYN-H5', tag: 'S', from: 60, to: 65 },
    ]);
  await field(page, 2, 'spots').fill('55-50');
  await field(page, 2, 'spots').press('Tab');
  await expect(field(page, 2, 'spots')).toHaveAttribute('aria-invalid', 'true');
  await expect(next(page)).toBeDisabled();
  await page.getByRole('button', { name: '+ Session', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Session 1', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Session 1', exact: true }).click();
  await expect(field(page, 2, 'spots')).toHaveValue('55-50');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page
    .getByRole('button', { name: 'Next: unknowns', exact: true })
    .click();
  await expect(field(page, 1, 'name')).toHaveValue('SYN-H3');
  await expect(field(page, 2, 'name')).toHaveValue('SYN-H4');
  await expect(field(page, 3, 'name')).toHaveValue('SYN-H5');
  await expect(field(page, 2, 'spots')).toHaveValue('55-50');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('bracketeer.project')!).sessions[0]
            .unknowns[3].from,
      ),
    )
    .toBe(50);
});

test('overlaps disable Next with the row message and focus its field across session tabs', async ({
  page,
}) => {
  await exampleUnknowns(page);
  await field(page, 3, 'spots').fill('31-32, 56-83');
  await field(page, 3, 'spots').press('Enter');
  const message = page.locator('.wizard-footer').getByRole('button', {
    name: 'Row 3, SYN-H5: spots 31–32 are also in row 2, SYN-H4.',
    exact: true,
  });
  await expect(next(page)).toBeDisabled();
  await expect(message).toBeVisible();
  await page.getByRole('button', { name: 'Session 3', exact: true }).click();
  await message.click();
  await expect(
    page.getByRole('button', { name: 'Session 2', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(field(page, 3, 'spots')).toBeFocused();
  await field(page, 3, 'spots').fill('56-83');
  await field(page, 3, 'spots').press('Enter');
  await expect(next(page)).toBeEnabled();
});

test('unknown spots in standard pools and duplicate names block; drafts and counts are shown on cards', async ({
  page,
}) => {
  await exampleUnknowns(page);
  await field(page, 3, 'spots').fill('56-83, 650');
  await field(page, 3, 'spots').press('Enter');
  await expect(next(page)).toBeDisabled();
  await expect(page.locator('.wizard-footer')).toContainText(
    'Row 3, SYN-H5: spot 650 is in the S513 pool.',
  );
  await field(page, 3, 'spots').fill('56-83');
  await field(page, 3, 'spots').press('Enter');
  await field(page, 3, 'name').fill('SYN-H3');
  await expect(next(page)).toBeDisabled();
  await expect(page.locator('.wizard-footer')).toContainText(
    'Row 3, SYN-H3: this name and tag are also in row 1.',
  );
  await field(page, 3, 'name').fill('SYN-H5');
  // Adjacent duplicates are also blocked while being edited, rather than silently merging.
  await field(page, 2, 'name').fill('SYN-H3');
  await expect(next(page)).toBeDisabled();
  await expect(field(page, 2, 'name')).toHaveAttribute('aria-invalid', 'true');
  await field(page, 2, 'name').fill('SYN-H4');
  const pool = page.getByRole('textbox', {
    name: 'NIST610 ranges',
    exact: true,
  });
  await pool.fill('848-856, 866-874');
  await pool.press('Enter');
  const card = page.locator('.spot-card').filter({
    has: page.getByRole('heading', {
      name: 'NIST610 reference',
      exact: true,
    }),
  });
  await expect(card).toContainText('848–856, 866–874 · 18 spots');
  await expect(card).toContainText('Session 1 used: 857–865');
  await pool.fill('874-848');
  await pool.press('Tab');
  await expect(next(page)).toBeDisabled();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page
    .getByRole('button', { name: 'Next: unknowns', exact: true })
    .click();
  await expect(pool).toHaveValue('874-848');
});

test('paste accepts old formats and spot lists, shows line errors, and shares the experiment title', async ({
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
  await expect(field(page, 3, 'name')).toHaveValue('SYN-H5');
  await page
    .getByRole('textbox', { name: 'Experiment name', exact: true })
    .fill('Mount A');
  await expect(
    page.getByRole('textbox', { name: 'Experiment title', exact: true }),
  ).toHaveValue('Mount A');
  await page
    .getByRole('textbox', { name: 'Experiment title', exact: true })
    .fill('Mount B');
  await expect(
    page.getByRole('textbox', { name: 'Experiment name', exact: true }),
  ).toHaveValue('Mount B');
  await page
    .getByRole('button', { name: 'Import sequence…', exact: true })
    .click();
  await expect(
    page.getByRole('dialog', { name: 'Import sequence', exact: true }),
  ).toBeVisible();
});

test('example sessions show every fixture sample; fixed unknowns are read-only and plus leaves sessions open', async ({
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
    const expected = groupUnknowns(
      fixture.sessions.find((s) => s.number === number)!.unknowns,
    );
    await expect(
      page
        .getByRole('table', { name: 'Unknowns', exact: true })
        .locator('tbody input'),
    ).toHaveCount(expected.length * 3);
    for (const [i, sample] of expected.entries()) {
      await expect(field(page, i + 1, 'name')).toHaveValue(sample.name);
      await expect(field(page, i + 1, 'tag')).toHaveValue(sample.tag);
      await expect(field(page, i + 1, 'spots')).toHaveValue(
        formatSpots(rangeSpots(sample.ranges)),
      );
    }
    await expect(next(page)).toBeEnabled();
  }
  await page
    .getByRole('button', { name: 'Session 1 · imported', exact: true })
    .click();
  await expect(field(page, 1, 'spots')).toHaveAttribute('readonly', '');
  await expect(
    page.getByRole('button', { name: 'Add sample', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Session 2', exact: true }).click();
  await page.getByRole('button', { name: '+ Session', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Session 2', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Session 4', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(
    page.getByTestId('samples-panel').getByTestId('unknown-total'),
  ).toContainText('0 unknowns');
  await expect(next(page)).toBeEnabled();
  await expect(page.getByTestId('samples-panel')).toContainText(
    'Session 4 has no unknowns.',
  );
});
