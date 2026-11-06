import { expect, test } from '@playwright/test';

test('the page loads with the bracketeer title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('bracketeer');
  await expect(
    page.getByRole('heading', { name: 'bracketeer', level: 1 }),
  ).toBeVisible();
});
