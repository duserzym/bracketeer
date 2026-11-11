import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const button = (page: Page) => page.getByTestId('check-updates');
const popover = (page: Page) => page.getByTestId('check-updates-popover');
const networkMessage =
  "Can't reach the update server. Check your internet connection and try again.";

async function fits(locator: Locator, page: Page) {
  await expect(locator).toBeVisible();
  const box = (await locator.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'bracketeer.updates',
      JSON.stringify({ autoDownload: false }),
    );
  });
});

test('idle button has a stable accessible name and no badge', async ({
  page,
}) => {
  await page.goto('/?update-preview=idle');
  await expect(button(page)).toHaveAccessibleName('Check for updates');
  await expect(button(page)).toHaveAttribute('title', /^Check for updates/);
  await expect(button(page)).not.toHaveAttribute('data-badge', 'true');
  await expect(popover(page)).not.toBeVisible();
  await expect(page.getByTestId('version-chip')).toBeVisible();
});

for (const [scenario, text, badge] of [
  ['available', 'Update available: v0.2.0', true],
  ['none', 'Up to date (v0.1.0)', false],
  ['error', networkMessage, false],
  ['ready', 'v0.2.0 is ready', true],
  ['unsupported', 'Update available: v0.2.0', true],
] as const) {
  test(`manual check restores the ${scenario} preview outcome`, async ({
    page,
  }) => {
    await page.goto(`/?update-preview=${scenario}`);
    if (badge) await expect(button(page)).toHaveAttribute('data-badge', 'true');
    else await expect(button(page)).not.toHaveAttribute('data-badge', 'true');
    await button(page).click();
    await expect(popover(page)).toContainText('Checking for updates…');
    await expect(popover(page)).toContainText(text);
    await expect(button(page)).not.toHaveAttribute('data-busy', 'true');
    if (badge) await expect(button(page)).toHaveAttribute('data-badge', 'true');
    if (scenario === 'available') {
      await expect(popover(page)).toContainText('Current version: v0.1.0');
      await expect(
        popover(page).getByRole('button', { name: 'Download', exact: true }),
      ).toBeVisible();
    }
    if (scenario === 'ready')
      await expect(
        popover(page).getByRole('button', { name: 'Restart to update' }),
      ).toBeVisible();
    if (scenario === 'unsupported')
      await expect(
        popover(page).getByRole('link', { name: 'Open download page' }),
      ).toHaveAttribute(
        'href',
        'https://github.com/duserzym/bracketeer/releases/latest',
      );
    await page.keyboard.press('Escape');
    await expect(popover(page)).not.toBeVisible();
    await expect(button(page)).toHaveAttribute('aria-expanded', 'false');
  });
}

test('checking stays busy, supports reduced motion, and dismisses without restarting', async ({
  page,
}) => {
  await page.goto('/?update-preview=checking');
  await button(page).click();
  await expect(popover(page)).toContainText('Checking for updates…');
  await expect(button(page)).toHaveAttribute('data-busy', 'true');
  await expect(button(page).locator('svg')).toHaveCSS(
    'animation-name',
    /spin$/,
  );
  // Advancing time cannot complete the deliberately frozen checking preview.
  await page.clock.install();
  await page.clock.fastForward(2000);
  await expect(popover(page)).toContainText('Checking for updates…');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(button(page).locator('svg')).toHaveCSS('animation-name', 'none');
  await expect(
    popover(page).getByText('Checking…', { exact: true }),
  ).toBeVisible();
  await button(page).click();
  await expect(popover(page)).not.toBeVisible();
  await button(page).click();
  await page
    .getByTestId('topbar')
    .getByRole('heading', { name: 'bracketeer' })
    .click();
  await expect(popover(page)).not.toBeVisible();
});

test('opening during a download keeps its progress and settings opens the shared panel', async ({
  page,
}) => {
  await page.goto('/?update-preview=downloading');
  await button(page).click();
  await expect(popover(page)).toContainText('Downloading v0.2.0… 43%');
  await expect(button(page)).toHaveAttribute('data-busy', 'true');
  await popover(page).getByRole('button', { name: 'Update settings…' }).click();
  await expect(popover(page)).not.toBeVisible();
  await expect(page.getByTestId('updates-panel')).toHaveJSProperty(
    'open',
    true,
  );
  await expect(page.getByTestId('updates-panel')).toContainText(
    'Downloading 0.2.0, 43%',
  );
});

test('available actions respect automatic downloads', async ({ page }) => {
  await page.goto('/?update-preview=available');
  await page.getByTestId('version-chip').click();
  const panel = page.getByTestId('updates-panel');
  await panel.getByLabel('Download updates automatically').check();
  await panel.getByRole('button', { name: 'Close', exact: true }).click();
  await button(page).click();
  await expect(popover(page)).toContainText('Update available: v0.2.0');
  await expect(
    popover(page).getByRole('button', { name: 'Download', exact: true }),
  ).toHaveCount(0);
});

for (const viewport of [
  { width: 1512, height: 982 },
  { width: 1280, height: 800 },
  { width: 1024, height: 640 },
]) {
  test(`button and popover fit ${viewport.width}x${viewport.height}`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/?update-preview=idle');
    await fits(button(page), page);
    const screenshot =
      process.env.SCREENSHOTS === '1' &&
      browserName === 'chromium' &&
      viewport.width === 1512;
    const shotDir = process.env.SHOT_DIR ?? 'docs/screenshots';
    if (screenshot) {
      await mkdir(shotDir, { recursive: true });
      await page.screenshot({ path: join(shotDir, 'check-updates-idle.png') });
    }
    await page.goto('/?update-preview=available');
    await button(page).click();
    await expect(popover(page)).toContainText('Update available: v0.2.0');
    await fits(button(page), page);
    await fits(popover(page), page);
    // All top-bar controls share one line, including the last Menu button.
    const center = (await button(page).boundingBox())!;
    for (const locator of [
      page.getByLabel('Theme', { exact: true }),
      page.locator('.menu-wrap > button'),
      page.locator('.step-bar'),
    ]) {
      await fits(locator, page);
      const box = (await locator.boundingBox())!;
      expect(
        Math.abs(box.y + box.height / 2 - center.y - center.height / 2),
      ).toBeLessThan(2);
    }
    if (screenshot)
      await page.screenshot({
        path: join(shotDir, 'check-updates-available.png'),
      });
    await page.setViewportSize({ width: 1280, height: 800 });
    await fits(popover(page), page);
  });
}
