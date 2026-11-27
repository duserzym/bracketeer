import { expect, test, type Locator } from '@playwright/test';

async function opaqueAndUnclipped(panel: Locator, background: string) {
  await expect(panel).toBeVisible();
  await expect(panel).toHaveCSS('background-color', background);
  const surface = await panel.evaluate((element) => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    const points: [number, number][] = [
      [box.left + box.width / 2, box.top + box.height / 2],
      [box.left + 8, box.top + 8],
      [box.right - 8, box.top + 8],
      [box.left + 8, box.bottom - 8],
      [box.right - 8, box.bottom - 8],
    ];
    const onTop = points.every(([x, y]) => {
      const hit = document.elementFromPoint(x, y);
      return !!hit && element.contains(hit);
    });
    const ancestors = [];
    for (let node: Element | null = element; node; node = node.parentElement) {
      ancestors.push(getComputedStyle(node).opacity);
    }
    return {
      blur: style.getPropertyValue('backdrop-filter') || 'none',
      webkitBlur: style.getPropertyValue('-webkit-backdrop-filter') || 'none',
      ancestors,
      onTop,
      fits:
        box.left >= 0 &&
        box.top >= 0 &&
        box.right <= innerWidth &&
        box.bottom <= innerHeight,
    };
  });
  expect(surface.blur).toBe('none');
  expect(surface.webkitBlur).toBe('none');
  expect(surface.ancestors.every((opacity) => opacity === '1')).toBe(true);
  expect(surface.onTop).toBe(true);
  expect(surface.fits).toBe(true);
}

for (const theme of ['light', 'dark']) {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1280, height: 800 },
  ]) {
    test.describe(`Opaque updater: ${theme}, ${viewport.width}`, () => {
      test.use({ viewport });
      for (const state of ['none', 'available', 'ready']) {
        test(`${state} menu and running-version notes cover content`, async ({
          page,
        }) => {
          await page.addInitScript(
            ({ theme }) => {
              localStorage.setItem('bracketeer.theme', theme);
              localStorage.setItem(
                'bracketeer.updates',
                JSON.stringify({ autoDownload: false }),
              );
            },
            { theme },
          );
          await page.goto(`/?update-preview=${state}`);
          await page.getByTestId('check-updates').click();
          const panel = page.getByTestId('check-updates-popover');
          await expect(panel).toContainText(
            state === 'none'
              ? 'Up to date'
              : state === 'available'
                ? 'Update available'
                : 'is ready',
          );
          const background =
            theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(18, 25, 38)';
          await opaqueAndUnclipped(panel, background);
          await panel
            .getByRole('button', { name: "What's new", exact: true })
            .click();
          await opaqueAndUnclipped(page.getByTestId('whats-new'), background);
        });
      }
    });
  }
}
