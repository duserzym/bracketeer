import { expect, test, type Page } from '@playwright/test';

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
  { width: 1536, height: 864 },
]) {
  test(`all four wizard steps fit ${viewport.width} × ${viewport.height}`, async ({
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
    const entry = page.locator('.catalogue-entry').filter({
      has: page.getByRole('radio', { name: 'Use S513', exact: true }),
    });
    const entryBounds = (await entry.boundingBox())!;
    // Step 1 tools may wrap below the name; every control stays inside its row.
    for (const control of await entry.locator('input, button').all()) {
      const bounds = (await control.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(entryBounds.x);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(
        entryBounds.x + entryBounds.width + 1,
      );
      expect(bounds.y).toBeGreaterThanOrEqual(entryBounds.y);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(
        entryBounds.y + entryBounds.height + 1,
      );
      expect(
        await control.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
    }
    const groups = await page.locator('.catalogue-group').all();
    const bounds = await Promise.all(
      groups.map((group) => group.boundingBox()),
    );
    expect(bounds[0]!.x).toBeLessThan(bounds[1]!.x);
    expect(bounds[1]!.x).toBeLessThan(bounds[2]!.x);
    expect(bounds[0]!.y).toBe(bounds[1]!.y);
    expect(bounds[1]!.y).toBe(bounds[2]!.y);
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

    await page
      .getByRole('button', { name: 'Open example', exact: true })
      .click();
    await page.getByRole('button', { name: '2 Unknowns', exact: true }).click();
    await pageFits(page);
    for (const name of ['samples-panel']) {
      const panel = page.getByTestId(name);
      const bounds = (await panel.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(
        viewport.height - 50,
      );
      expect(await panel.evaluate((el) => el.scrollWidth)).toBe(
        await panel.evaluate((el) => el.clientWidth),
      );
    }
    for (const name of ['samples-scroll']) {
      const scroll = page.getByTestId(name);
      expect(
        await scroll.evaluate((el) => el.scrollHeight > el.clientHeight),
      ).toBe(true);
      await scroll.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      expect(await scroll.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    }
    await expect(
      page.getByRole('button', { name: 'Next: bracketing', exact: true }),
    ).toBeEnabled();

    await page
      .getByRole('button', { name: 'Next: bracketing', exact: true })
      .click();
    await expect(page.getByTestId('budget')).toContainText('37 brackets');
    for (const mode of ['budget', 'size']) {
      await page
        .getByRole('combobox', { name: 'Chunking', exact: true })
        .selectOption(mode);
      if (mode === 'size')
        await page
          .getByRole('combobox', { name: 'Secondaries', exact: true })
          .selectOption('cadence');
      const table = page.getByRole('table', {
        name: 'Standard spots',
        exact: true,
      });
      for (const header of await table.getByRole('columnheader').all()) {
        const bounds = (await header.boundingBox())!;
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
      }
      await pageFits(page);
    }
    await page
      .getByRole('combobox', { name: 'Chunking', exact: true })
      .selectOption('budget');

    await pageFits(page);
    for (const id of ['recipe-scroll', 'plan-summary']) {
      const panel = page.getByTestId(id);
      const bounds = (await panel.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(
        viewport.height - 50,
      );
      expect(
        await panel.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      expect(await panel.evaluate((el) => getComputedStyle(el).overflowY)).toBe(
        'auto',
      );
    }
    const recipe = page.getByTestId('recipe-scroll');
    expect(
      await recipe.evaluate((el) => el.scrollHeight > el.clientHeight),
    ).toBe(true);
    await recipe.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    expect(await recipe.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    await page.locator('.sheet-columns summary').click();
    await recipe.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect(
      page.getByRole('checkbox', { name: 'Evaluate', exact: true }),
    ).toBeInViewport();
    await page
      .getByRole('button', { name: 'Generate and review', exact: true })
      .click();
    await expect(page.getByTestId('counts')).toContainText('332 rows');
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
    await page
      .getByRole('button', { name: 'Qtegra paste', exact: true })
      .click();
    const paste = page.getByTestId('paste-scroll');
    expect(
      await paste.evaluate((el) => el.scrollHeight > el.clientHeight),
    ).toBe(true);
    await paste.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
      el.scrollLeft = el.scrollWidth;
    });
    expect(await paste.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    await pageFits(page);
    // Every populated step also remains inside the window in Dark.
    await page
      .getByRole('combobox', { name: 'Theme', exact: true })
      .selectOption('dark');
    for (const step of ['3 Bracketing', '2 Unknowns', '1 Mineral']) {
      await page.getByRole('button', { name: step, exact: true }).click();
      await pageFits(page);
    }
    await page.getByRole('button', { name: '4 Review', exact: true }).click();
    await expect(page.getByTestId('counts')).toContainText('332 rows');
    await pageFits(page);
  });
}
