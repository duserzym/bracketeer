import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { importWorkbook, importText } from '../src/lib/engine/import';
import { parseProject } from '../src/lib/engine/project';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';

const file = resolve('dist/bracketeer.html');

test.skip(
  !existsSync(file),
  'dist/bracketeer.html is missing; run make web to test the standalone build.',
);

test('single-file web build opens the offline example and generates 332 rows from file://', async ({
  page,
  context,
}, testInfo) => {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  page.on('pageerror', (error) => errors.push(error.message));
  await context.setOffline(true);
  const url = pathToFileURL(file).href;
  await page.goto(url);
  await expect(page).toHaveTitle('bracketeer');
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    'href',
    /^data:image\/svg\+xml;base64,/,
  );
  await page.getByRole('button', { name: 'Open example', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '3 Bracketing', exact: true }),
  ).toHaveAttribute('aria-current', 'step');
  await page.getByRole('button', { name: '1 Mineral', exact: true }).click();
  await page
    .getByRole('button', { name: 'Next: unknowns', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Next: bracketing', exact: true })
    .click();
  await expect(page.getByTestId('budget')).toContainText(
    '37 brackets for 2 sessions (19 + 18), 40 secondary pairs',
  );
  await page
    .getByRole('button', { name: 'Generate and review', exact: true })
    .click();
  await expect(page.getByTestId('counts')).toContainText('332 rows');
  await expect(page.getByTestId('warnings')).toHaveText('No warnings');
  await page.getByRole('button', { name: 'Qtegra paste', exact: true }).click();
  await expect(
    page
      .getByRole('table', { name: 'Qtegra paste', exact: true })
      .locator('tbody tr'),
  ).toHaveCount(332);
  await expect(
    page.getByRole('button', { name: '4 Review', exact: true }),
  ).toHaveAttribute('aria-current', 'step');
  const project = parseProject(
    await readFile('fixtures/synthetic-session-1.bracketeer.json', 'utf8'),
  );
  const expected = importWorkbook(
    await readFile('fixtures/synthetic-session-2.xls'),
    project.standards,
  );
  for (const format of ['xls', 'xlsx', 'csv']) {
    const downloading = page.waitForEvent('download');
    await page
      .getByRole('button', {
        name: format === 'xls' ? 'Export .xls' : `.${format}`,
        exact: true,
      })
      .click();
    const download = await downloading;
    const output = testInfo.outputPath(`offline-session-2.${format}`);
    await download.saveAs(output);
    const bytes = await readFile(output);
    const imported =
      format === 'csv'
        ? importText(bytes.toString('utf8'), project.standards)
        : importWorkbook(bytes, project.standards);
    expect(imported).toEqual(expected);
  }
  expect(errors).toEqual([]);
  expect(
    requests.filter(
      (request) => request !== url && !request.startsWith('data:'),
    ),
  ).toEqual([]);
});
