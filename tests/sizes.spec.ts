import { expect, test, type Page } from '@playwright/test';
import { generatedExample } from './helpers';

async function expectColumnsToFit(page: Page) {
  const grid = page.getByTestId('grid-scroll');
  const visible = await grid.evaluate((el) => {
    const bounds = el.getBoundingClientRect();
    return {
      left: bounds.left + el.clientLeft,
      right: bounds.left + el.clientLeft + el.clientWidth,
      top: bounds.top + el.clientTop,
      bottom: bounds.top + el.clientTop + el.clientHeight,
    };
  });
  expect(await grid.evaluate((el) => el.scrollWidth)).toBe(
    await grid.evaluate((el) => el.clientWidth),
  );
  for (const name of [
    'Label',
    'Laser Scan Position Number',
    'Laser Output Setting [%]',
  ]) {
    const header = grid.getByRole('columnheader', { name, exact: true });
    const bounds = await header.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(visible.left);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(visible.right);
    expect(bounds!.y).toBeGreaterThanOrEqual(visible.top);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(visible.bottom);
  }
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
]) {
  test(`the generated example fits ${viewport.width} × ${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await generatedExample(page);
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
    await grid.evaluate((el) => {
      el.scrollTop = 0;
    });
    if (viewport.width === 1440) {
      await expectColumnsToFit(page);
    } else {
      expect(await grid.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
        true,
      );
      const rowHeader = grid.getByRole('columnheader', {
        name: 'Row',
        exact: true,
      });
      const labelHeader = grid.getByRole('columnheader', {
        name: 'Label',
        exact: true,
      });
      const rowCell = grid.locator('tbody tr').first().locator('th');
      const labelCell = grid.locator('tbody tr').first().locator('td').first();
      const stickyCells = [rowHeader, labelHeader, rowCell, labelCell];
      const before = await Promise.all(
        stickyCells.map((cell) => cell.boundingBox()),
      );
      await grid.evaluate((el) => {
        el.scrollLeft = el.scrollWidth;
      });
      expect(await grid.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
      for (const [i, cell] of stickyCells.entries()) {
        const after = await cell.boundingBox();
        expect(after!.x).toBeCloseTo(before[i]!.x, 1);
        expect(after!.width).toBeCloseTo(before[i]!.width, 1);
      }
    }
    await page
      .getByRole('button', { name: 'Fold inputs', exact: true })
      .click();
    expect(
      (await page.getByTestId('left-panel').boundingBox())!.width,
    ).toBeLessThan(60);
    await grid.evaluate((el) => {
      el.scrollTop = 0;
      el.scrollLeft = 0;
    });
    await expectColumnsToFit(page);
    if (viewport.width === 1280) {
      const visibleRows = await grid.evaluate((el) => {
        const top = el.querySelector('thead')!.getBoundingClientRect().bottom;
        const bottom = el.getBoundingClientRect().top + el.clientHeight;
        return [...el.querySelectorAll('tbody tr')].filter((row) => {
          const bounds = row.getBoundingClientRect();
          return bounds.top >= top && bounds.bottom <= bottom;
        }).length;
      });
      expect(visibleRows).toBeGreaterThanOrEqual(22);
    }
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
