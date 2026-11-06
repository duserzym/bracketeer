import { expect, type Page } from '@playwright/test';

export async function generatedExample(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open example', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '3 Bracketing', exact: true }),
  ).toHaveAttribute('aria-current', 'step');
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
