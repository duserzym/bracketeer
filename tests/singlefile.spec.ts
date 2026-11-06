import { existsSync } from 'node:fs';
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
}) => {
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
  await page
    .getByRole('button', { name: 'Generate and review', exact: true })
    .click();
  await expect(page.getByTestId('counts')).toContainText('332 rows');
  await expect(page.getByTestId('warnings')).toHaveText('No warnings');
  expect(errors).toEqual([]);
  expect(
    requests.filter(
      (request) => request !== url && !request.startsWith('data:'),
    ),
  ).toEqual([]);
});
