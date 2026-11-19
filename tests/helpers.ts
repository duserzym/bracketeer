import { expect, type Page } from '@playwright/test';

export async function exampleBracketing(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('welcome-panel')).toBeVisible();
  await page.getByRole('button', { name: 'Open example', exact: true }).click();
  // Visit the populated Mineral and Unknowns steps before planning the example.
  await page.getByRole('button', { name: '1 Mineral', exact: true }).click();
  await page
    .getByRole('button', { name: 'Next: unknowns', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Session 2', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('unknown-total')).toHaveText(
    '234 unknowns in this session',
  );
  await page
    .getByRole('button', { name: 'Next: bracketing', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: '3 Bracketing', exact: true }),
  ).toHaveAttribute('aria-current', 'step');
}

export async function generatedExample(page: Page) {
  await exampleBracketing(page);
  await page
    .getByRole('button', { name: 'Generate and review', exact: true })
    .click();
  await expect(page.getByTestId('counts')).toContainText('332 rows');
}

export async function menuAction(page: Page, name: string) {
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page
    .locator('#app-menu')
    .getByRole('button', { name, exact: true })
    .click();
}

export async function startZircon(page: Page) {
  await page.goto('/');
  await page.getByRole('radio', { name: 'Zircon', exact: true }).click();
  await page
    .getByRole('button', { name: 'Next: unknowns', exact: true })
    .click();
}

export async function commitCell(page: Page, name: string, value: string) {
  const input = page.getByRole('spinbutton', { name, exact: true });
  await input.fill(value);
  await input.press('Tab');
}

export async function addCountSample(
  page: Page,
  name: string,
  count: number,
  row: number,
) {
  await page.getByRole('button', { name: 'Add sample', exact: true }).click();
  const input = page.getByRole('textbox', {
    name: `Unknown ${row} name`,
    exact: true,
  });
  await expect(input).toBeFocused();
  await input.fill(name);
  await input.press('Tab');
  await commitCell(page, `Unknown ${row} count`, String(count));
}
