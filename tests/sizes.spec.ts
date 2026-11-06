import { expect, test, type Page } from '@playwright/test';
import { generatedExample } from './helpers';

async function pageFits(page: Page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth &&
        document.documentElement.scrollHeight <= innerHeight &&
        document.body.scrollWidth <= innerWidth &&
        document.body.scrollHeight <= innerHeight,
    ),
  ).toBe(true);
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
]) {
  test(`Mineral and review fit ${viewport.width} × ${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const welcome = page.getByTestId('welcome-panel');
    await expect(welcome).toBeVisible();
    await expect(
      page
        .getByRole('radiogroup', { name: 'Mineral', exact: true })
        .getByRole('radio'),
    ).toHaveCount(9);
    await page.getByRole('radio', { name: 'Zircon', exact: true }).click();
    await pageFits(page);
    for (const radio of await page
      .getByRole('radiogroup', { name: 'Mineral', exact: true })
      .getByRole('radio')
      .all()) {
      const bounds = (await radio.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
    }
    const main = page.locator('.welcome-main');
    expect(await main.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(
      true,
    );
    await main.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    expect(await main.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    const welcomeBounds = (await welcome.boundingBox())!;
    expect(welcomeBounds.y + welcomeBounds.height).toBeLessThanOrEqual(
      viewport.height - 50,
    );

    await generatedExample(page);
    await pageFits(page);
    const notice = page.getByRole('status');
    await expect(notice).toHaveText('Generated all open sessions');
    const noticeBounds = (await notice.boundingBox())!;
    const toolbarBounds = (await page
      .getByTestId('grid-toolbar')
      .boundingBox())!;
    expect(noticeBounds.y).toBeGreaterThanOrEqual(toolbarBounds.y);
    expect(noticeBounds.y + noticeBounds.height).toBeLessThanOrEqual(
      toolbarBounds.y + toolbarBounds.height,
    );
    for (const container of ['topbar', 'grid-toolbar']) {
      for (const button of await page
        .getByTestId(container)
        .getByRole('button')
        .all()) {
        await expect(button).toBeVisible();
        const bounds = (await button.boundingBox())!;
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.y).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
      }
    }
    const grid = page.getByTestId('grid-scroll');
    expect(await grid.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(
      true,
    );
    await grid.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    expect(await grid.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    await grid.evaluate((el) => {
      el.scrollTop = 0;
    });
    expect(await grid.evaluate((el) => el.scrollWidth)).toBe(
      await grid.evaluate((el) => el.clientWidth),
    );
    for (const name of [
      'Label',
      'Laser Scan Position Number',
      'Laser Output Setting [%]',
    ]) {
      const bounds = (await grid
        .getByRole('columnheader', { name, exact: true })
        .boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
    }
    const visibleRows = await grid.evaluate((el) => {
      const top = el.querySelector('thead')!.getBoundingClientRect().bottom;
      const bottom = el.getBoundingClientRect().top + el.clientHeight;
      return [...el.querySelectorAll('tbody tr')].filter((row) => {
        const bounds = row.getBoundingClientRect();
        return bounds.top >= top && bounds.bottom <= bottom;
      }).length;
    });
    expect(visibleRows).toBeGreaterThanOrEqual(16);
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    const inputs = page.getByTestId('inputs-scroll');
    expect(
      await inputs.evaluate((el) => el.scrollHeight > el.clientHeight),
    ).toBe(true);
    await inputs.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    expect(await inputs.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    await pageFits(page);
  });
}
