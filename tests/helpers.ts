import { expect, type Page } from '@playwright/test';

export async function generatedExample(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open example', exact: true }).click();
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(page.getByTestId('counts')).toContainText('332 rows');
}

export async function commitCell(page: Page, name: string, value: string) {
  const input = page.getByRole('spinbutton', { name, exact: true });
  await input.fill(value);
  await input.press('Tab');
}
