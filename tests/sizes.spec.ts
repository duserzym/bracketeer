import { expect, test } from '@playwright/test';
import { generatedExample } from './helpers';

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
]) {
  test(`the generated example fits ${viewport.width} × ${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await generatedExample(page);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= innerWidth &&
          document.body.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    for (const container of ['topbar', 'grid-toolbar']) {
      const buttons = page.getByTestId(container).getByRole('button');
      for (const button of await buttons.all()) {
        await expect(button).toBeVisible();
        const bounds = await button.boundingBox();
        expect(bounds).not.toBeNull();
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.y).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
      }
    }
    for (const id of ['grid-scroll', 'inputs-scroll']) {
      const scroll = page.getByTestId(id);
      const before = await scroll.evaluate((el) => ({
        client: el.clientHeight,
        content: el.scrollHeight,
      }));
      expect(before.content).toBeGreaterThan(before.client);
      await scroll.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      expect(await scroll.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
      const bounds = await scroll.boundingBox();
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
    }
    const grid = page.getByTestId('grid-scroll');
    expect(await grid.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
      true,
    );
    await grid.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    expect(await grid.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
    await page
      .getByRole('button', { name: 'Fold inputs', exact: true })
      .click();
    expect(
      (await page.getByTestId('left-panel').boundingBox())!.width,
    ).toBeLessThan(60);
    await page
      .getByRole('button', { name: 'Unfold inputs', exact: true })
      .click();
    expect(
      (await page.getByTestId('left-panel').boundingBox())!.width,
    ).toBeGreaterThan(300);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
