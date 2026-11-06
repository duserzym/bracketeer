import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

async function fits(locator: Locator, page: Page) {
  await expect(locator).toBeVisible();
  const box = (await locator.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
}
async function footerFits(page: Page) {
  await fits(page.getByTestId('version-chip'), page);
  // The wizard intentionally omits Back on step 1 and Next on step 4.
  for (const button of await page.locator('.wizard-footer > button').all()) {
    await fits(button, page);
  }
  expect(
    (await page.getByTestId('version-chip').boundingBox())!.width,
  ).toBeLessThanOrEqual(220);
}
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
]) {
  for (const theme of ['light', 'dark']) {
    test(`updates fit ${theme} ${viewport.width}x${viewport.height}`, async ({
      page,
      browserName,
    }) => {
      await page.setViewportSize(viewport);
      await page.addInitScript(
        (value) => localStorage.setItem('bracketeer.theme', value),
        theme,
      );
      await page.goto('/?update-preview=ready');
      const chip = page.getByTestId('version-chip');
      await expect(chip).toHaveText('Update ready, restart');
      await footerFits(page);
      await page
        .getByRole('button', { name: 'Open example', exact: true })
        .click();
      await page
        .getByRole('button', { name: '1 Mineral', exact: true })
        .click();
      await footerFits(page);
      await page
        .getByRole('button', { name: 'Next: unknowns', exact: true })
        .click();
      await footerFits(page);
      // Force a long blocking message without changing app code or sample data.
      await page.evaluate(() => {
        const footer = document.querySelector('.wizard-footer')!;
        const message = document.createElement('button');
        message.className = 'blocking-message';
        message.textContent =
          'Check the unknown sample ranges before continuing. '.repeat(30);
        message.dataset.testid = 'long-update-blocker';
        footer.insertBefore(message, footer.querySelector('.primary'));
      });
      await footerFits(page);
      await page
        .getByTestId('long-update-blocker')
        .evaluate((element) => element.remove());
      await page
        .getByRole('button', { name: 'Next: bracketing', exact: true })
        .click();
      await page
        .getByRole('button', { name: 'Generate and review', exact: true })
        .click();
      await expect(page.getByTestId('counts')).toContainText('332 rows');
      await footerFits(page);
      const suffix = `${theme}-${viewport.width}x${viewport.height}.png`;
      // One browser writes the shared screenshots, avoiding concurrent writers.
      const screenshots =
        process.env.SCREENSHOTS === '1' && browserName === 'chromium';
      if (screenshots) {
        await mkdir('docs/screenshots', { recursive: true });
        await page.screenshot({
          path: `docs/screenshots/updates-ready-${suffix}`,
        });
      }
      await chip.click();
      const panel = page.getByTestId('updates-panel');
      await expect(panel).toHaveJSProperty('open', true);
      await expect(panel).toContainText('Version 0.2.0 is ready to install');
      await expect(
        panel.getByRole('button', { name: 'Restart to update' }),
      ).toBeVisible();
      await fits(panel, page);
      if (screenshots)
        await page.screenshot({
          path: `docs/screenshots/updates-panel-${suffix}`,
        });
      await panel.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(panel).not.toBeVisible();
      await page.goto('/?update-preview=available');
      await expect(chip).toHaveText('Update available');
      await page.goto('/?update-preview=none');
      await expect(chip).toHaveText('Up to date');
    });
  }
}

for (const [state, chipText, panelText] of [
  ['downloading', 'Downloading 43%', 'Downloading 0.2.0, 43%'],
  ['error', 'Check failed', 'Update check failed: Could not reach GitHub'],
  [
    'unsupported',
    'Update available',
    'This portable copy cannot update itself',
  ],
] as const) {
  test(`preview ${state}`, async ({ page }) => {
    await page.goto(`/?update-preview=${state}`);
    await expect(page.getByTestId('version-chip')).toHaveText(chipText);
    await page.getByTestId('version-chip').click();
    await expect(page.getByTestId('updates-panel')).toContainText(panelText);
    if (state === 'unsupported')
      await expect(
        page.getByRole('link', { name: 'Open download page' }),
      ).toHaveAttribute(
        'href',
        'https://github.com/duserzym/bracketeer/releases/latest',
      );
  });
}
test('browser version and persisted update preferences', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('version-chip')).toHaveText('v0.1.0');
  await page.getByTestId('version-chip').click();
  const panel = page.getByTestId('updates-panel');
  await expect(panel).toContainText('Updates come with the desktop app.');
  await expect(panel.getByRole('button', { name: 'Check now' })).toBeDisabled();
  await panel.getByLabel('Download updates automatically').uncheck();
  await panel.getByLabel('Channel').selectOption('beta');
  await page.reload();
  await page.getByTestId('version-chip').click();
  await expect(
    panel.getByLabel('Download updates automatically'),
  ).not.toBeChecked();
  await expect(panel.getByLabel('Channel')).toHaveValue('beta');
});
