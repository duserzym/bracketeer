import { expect, test } from '@playwright/test';

test('the page loads with the bracket title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('bracket');
  await expect(page.getByRole('heading', { name: 'bracket' })).toBeVisible();
});
