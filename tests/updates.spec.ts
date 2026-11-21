import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { APP_VERSION } from './app-version';

const currentReleaseNotes = readFileSync(
  new URL(`../release-notes/${APP_VERSION}.md`, import.meta.url),
  'utf8',
).trim();

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
      await expect(chip).toHaveText(`v${APP_VERSION}`);
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
          path: `docs/screenshots/synthetic-updates-ready-${suffix}`,
        });
      }
      await chip.click();
      const panel = page.getByTestId('updates-panel');
      await expect(panel).toHaveJSProperty('open', true);
      await expect(panel).toContainText('v0.2.0 is ready');
      await expect(
        panel.getByRole('button', { name: 'Restart to update' }),
      ).toBeVisible();
      await fits(panel, page);
      if (screenshots)
        await page.screenshot({
          path: `docs/screenshots/synthetic-updates-panel-${suffix}`,
        });
      await panel.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(panel).not.toBeVisible();
      await page.goto('/?update-preview=available');
      await expect(chip).toHaveText(`v${APP_VERSION}`);
      await page.goto('/?update-preview=none');
      await expect(chip).toHaveText(`v${APP_VERSION}`);
    });
  }
}

for (const [state, panelText] of [
  ['downloading', 'Downloading v0.2.0… 43%'],
  ['error', 'No internet connection, or github.com did not answer.'],
  [
    'unsupported',
    'bracketeer cannot replace itself in this folder. Download the new version from GitHub.',
  ],
] as const) {
  test(`preview ${state}`, async ({ page }) => {
    await page.goto(`/?update-preview=${state}`);
    await expect(page.getByTestId('version-chip')).toHaveText(
      `v${APP_VERSION}`,
    );
    await page.getByTestId('version-chip').click();
    await expect(page.getByTestId('updates-panel')).toContainText(panelText);
    if (state === 'error') {
      const details = page.getByTestId('updates-panel').locator('.details');
      await expect(details).toHaveText(
        'Details: Network error: Could not reach GitHub',
      );
      await expect(details).toHaveCSS('user-select', 'text');
    }
    if (state === 'unsupported')
      await expect(
        page.getByRole('link', { name: 'Open download page' }),
      ).toHaveAttribute(
        'href',
        'https://github.com/duserzym/bracketeer/releases/tag/v0.2.0',
      );
  });
}
test('browser version and persisted update preferences', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('version-chip')).toHaveText(`v${APP_VERSION}`);
  await page.getByTestId('version-chip').click();
  const panel = page.getByTestId('updates-panel');
  await expect(panel).toContainText('Updates come with the desktop app.');
  await expect(panel.getByRole('button', { name: 'Check now' })).toBeDisabled();
  await panel.getByLabel('Download updates automatically').uncheck();
  await expect(panel.getByLabel('Channel')).toHaveCount(0);
  await page.reload();
  await page.getByTestId('version-chip').click();
  await expect(
    panel.getByLabel('Download updates automatically'),
  ).not.toBeChecked();
  await expect(panel.getByLabel('Channel')).toHaveCount(0);
});

test('a stored beta preference migrates silently to stable', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('bracketeer.updates'))
      localStorage.setItem(
        'bracketeer.updates',
        JSON.stringify({
          channel: 'beta',
          autoDownload: false,
          lastResult: 'Previous check',
        }),
      );
  });
  await page.goto('/');
  await page.getByTestId('version-chip').click();
  const panel = page.getByTestId('updates-panel');
  await expect(panel.getByLabel('Channel')).toHaveCount(0);
  await expect(
    panel.getByLabel('Download updates automatically'),
  ).not.toBeChecked();
  await expect(panel).toContainText('Previous check');
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem('bracketeer.updates')!),
    ),
  ).not.toHaveProperty('channel');
});

for (const theme of ['light', 'dark']) {
  test(`what's new shows once, reopens and fits 1280x800 in ${theme}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addInitScript((theme) => {
      localStorage.setItem('bracketeer.theme', theme);
      if (!localStorage.getItem('bracketeer.updates'))
        localStorage.setItem(
          'bracketeer.updates',
          JSON.stringify({ lastSeenVersion: '0.0.9' }),
        );
    }, theme);
    await page.goto('/?update-preview=idle');
    const card = page.getByTestId('whats-new');
    await expect(card).toContainText(`What's new in v${APP_VERSION}`);
    await expect(card).toContainText(currentReleaseNotes);
    await fits(card, page);
    await card.getByRole('button', { name: "Dismiss what's new" }).click();
    await expect(card).not.toBeVisible();
    await expect(page.getByTestId('check-updates')).toBeFocused();
    await page.reload();
    await expect(card).not.toBeVisible();
    await page.getByTestId('check-updates').click();
    await page
      .getByTestId('check-updates-popover')
      .getByRole('button', { name: "What's new", exact: true })
      .click();
    await expect(card).toBeVisible();
    await fits(card, page);
    await page.keyboard.press('Escape');
    await expect(card).not.toBeVisible();
    await expect(page.getByTestId('check-updates')).toBeFocused();
  });
}

test('first install records its version and shows no automatic card', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('version-chip')).toHaveText(`v${APP_VERSION}`);
  await expect(page.getByTestId('whats-new')).not.toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('bracketeer.updates')!).lastSeenVersion,
    ),
  ).toBe(APP_VERSION);
  await page.getByTestId('check-updates').click();
  await page.getByRole('button', { name: "What's new", exact: true }).click();
  await expect(page.getByTestId('whats-new')).toContainText(
    currentReleaseNotes,
  );
});
