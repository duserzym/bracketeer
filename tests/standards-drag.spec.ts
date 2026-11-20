import { expect, test, type Locator, type Page } from '@playwright/test';
import { addCountSample } from './helpers';

const list = (page: Page, mineral = 'zircon') =>
  page.locator(`[data-catalogue="${mineral}"]`);
const group = (page: Page, name: string, mineral = 'zircon') =>
  list(page, mineral).getByRole('region', { name, exact: true });
const handle = (page: Page, name: string, mineral = 'zircon') =>
  list(page, mineral).getByRole('button', {
    name: `Drag ${name}`,
    exact: true,
  });

async function start(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('radio', { name: 'Zircon', exact: true }).click();
}
async function pickUp(page: Page, source: Locator) {
  await source.scrollIntoViewIfNeeded();
  const box = (await source.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 8, box.y + box.height / 2, {
    steps: 3,
  });
  await expect(page.locator('.catalogue-lifted')).toBeVisible();
}
async function pointAt(page: Page, destination: Locator) {
  const box = (await destination.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
    steps: 12,
  });
}
async function drag(page: Page, source: Locator, destination: Locator) {
  await pickUp(page, source);
  await pointAt(page, destination);
  await expect(page.locator('.drop-indicator')).toHaveCount(1);
  await page.mouse.up();
  await expect(page.locator('.catalogue-lifted')).toHaveCount(0);
}
async function checkedOrder(page: Page) {
  return group(page, 'Secondaries')
    .locator('input:checked')
    .evaluateAll((inputs) =>
      inputs.map((input) => input.getAttribute('aria-label')),
    );
}

test('pointer regrouping preserves ticks; each drop is one Undo and Redo step', async ({
  page,
}) => {
  await start(page);
  const before = await checkedOrder(page);
  await drag(
    page,
    handle(page, '91500'),
    group(page, 'Reference glasses').getByRole('heading'),
  );
  await expect(
    group(page, 'Reference glasses').getByRole('checkbox', {
      name: 'Use 91500',
      exact: true,
    }),
  ).toBeChecked();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await checkedOrder(page)).toEqual(before);
  await expect(
    group(page, 'Reference glasses').getByRole('checkbox', {
      name: 'Use 91500',
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(
    group(page, 'Reference glasses').getByRole('checkbox', {
      name: 'Use 91500',
      exact: true,
    }),
  ).toBeChecked();
  await drag(
    page,
    handle(page, '91500'),
    group(page, 'Secondaries').getByRole('heading'),
  );
  await expect(
    group(page, 'Secondaries').getByRole('checkbox', {
      name: 'Use 91500',
      exact: true,
    }),
  ).toBeChecked();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(
    group(page, 'Reference glasses').getByRole('checkbox', {
      name: 'Use 91500',
      exact: true,
    }),
  ).toBeChecked();
  await page
    .getByRole('button', { name: 'Next: unknowns', exact: true })
    .click();
  await addCountSample(page, 'A', 18, 1);
  await page
    .getByRole('button', { name: 'Next: bracketing', exact: true })
    .click();
  await expect(page.getByTestId('standard-91500')).toContainText('reference');
  await expect(page.getByTestId('formula-91500')).toHaveText('0');
  await expect(
    page
      .getByRole('combobox', { name: 'Rotation start', exact: true })
      .locator('option'),
  ).toHaveText(['Seiland', 'PL', 'LTSE']);
});

test('LTSE first updates rotation numbers, standard counts, automatic numbering and the generated plan', async ({
  page,
}) => {
  await start(page);
  await drag(
    page,
    handle(page, 'LTSE'),
    group(page, 'Secondaries').getByRole('heading'),
  );
  expect(await checkedOrder(page)).toEqual([
    'Use LTSE',
    'Use Seiland',
    'Use 91500',
    'Use PL',
  ]);
  await expect(
    group(page, 'Secondaries').getByLabel('Rotation number', { exact: true }),
  ).toHaveText(['1', '2', '3', '4']);
  await page
    .getByRole('button', { name: 'Next: unknowns', exact: true })
    .click();
  await addCountSample(page, 'A', 36, 1);
  await page
    .getByRole('button', { name: 'Next: bracketing', exact: true })
    .click();
  const rotation = page.getByRole('combobox', {
    name: 'Rotation start',
    exact: true,
  });
  await expect(rotation.locator('option:checked')).toHaveText('LTSE');
  await expect(page.getByTestId('formula-LTSE')).toContainText('2');
  await expect(
    page.getByRole('spinbutton', { name: 'LTSE begin', exact: true }),
  ).toHaveValue('43');
  await expect(page.getByTestId('session-plan-1')).toContainText('2 brackets');
  await page
    .getByRole('button', { name: 'Generate and review', exact: true })
    .click();
  const labels = await page
    .getByRole('grid')
    .locator('tbody input[aria-label$=" Label"]')
    .evaluateAll((inputs) =>
      inputs.map((input) => (input as HTMLInputElement).value),
    );
  expect(
    labels
      .filter((label) => /^(LTSE|Seiland|91500|PL)_/u.test(label))
      .slice(0, 2),
  ).toEqual(['LTSE_43', 'LTSE_44']);
});

test('bringing GJ1 into Primary selects it and leaves S513 as an unticked candidate; moving it out requires a replacement', async ({
  page,
}) => {
  await start(page);
  await drag(
    page,
    handle(page, 'GJ1'),
    group(page, 'Secondaries').getByRole('heading'),
  );
  await drag(
    page,
    handle(page, 'GJ1'),
    group(page, 'Primary').getByRole('heading'),
  );
  await expect(
    group(page, 'Primary').getByRole('radio', { name: 'Use GJ1', exact: true }),
  ).toBeChecked();
  await expect(
    group(page, 'Primary').getByRole('radio', {
      name: 'Use S513',
      exact: true,
    }),
  ).not.toBeChecked();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(
    group(page, 'Primary').getByRole('radio', {
      name: 'Use S513',
      exact: true,
    }),
  ).toBeChecked();
  await expect(
    group(page, 'Secondaries').getByRole('checkbox', {
      name: 'Use GJ1',
      exact: true,
    }),
  ).not.toBeChecked();
  await drag(
    page,
    handle(page, 'S513'),
    group(page, 'Secondaries').getByRole('heading'),
  );
  await expect(
    group(page, 'Secondaries').getByRole('checkbox', {
      name: 'Use S513',
      exact: true,
    }),
  ).toBeChecked();
  await expect(
    page.getByRole('button', { name: 'Next: unknowns', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', {
      name: 'Add your primary standard',
      exact: true,
    }),
  ).toBeVisible();
});

test('pointer and keyboard reorders within Primary keep S513 active', async ({
  page,
}) => {
  await start(page);
  await drag(
    page,
    handle(page, 'GJ1'),
    group(page, 'Primary').getByRole('heading'),
  );
  await expect
    .poll(() =>
      group(page, 'Primary')
        .locator('.catalogue-entry input[type="text"]')
        .evaluateAll((inputs) =>
          inputs.map((input) => (input as HTMLInputElement).value),
        ),
    )
    .toEqual(['GJ1', 'S513', 'Plešovice']);
  await expect(
    group(page, 'Primary').getByRole('radio', {
      name: 'Use S513',
      exact: true,
    }),
  ).toBeChecked();
  await expect(
    group(page, 'Primary').getByRole('radio', { name: 'Use GJ1', exact: true }),
  ).not.toBeChecked();
  await handle(page, 'GJ1').focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect
    .poll(() =>
      group(page, 'Primary')
        .locator('.catalogue-entry input[type="text"]')
        .evaluateAll((inputs) =>
          inputs.map((input) => (input as HTMLInputElement).value),
        ),
    )
    .toEqual(['S513', 'GJ1', 'Plešovice']);
  await expect(
    group(page, 'Primary').getByRole('radio', {
      name: 'Use S513',
      exact: true,
    }),
  ).toBeChecked();
  await expect(
    group(page, 'Primary').getByRole('radio', { name: 'Use GJ1', exact: true }),
  ).not.toBeChecked();
});

test('Escape cancels, leaving the window cancels, and a click on the handle does nothing', async ({
  page,
}) => {
  await start(page);
  const before = await checkedOrder(page);
  await handle(page, 'LTSE').click();
  expect(await checkedOrder(page)).toEqual(before);
  await pickUp(page, handle(page, 'LTSE'));
  await pointAt(page, group(page, 'Secondaries').getByRole('heading'));
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.locator('.drop-indicator, .catalogue-lifted')).toHaveCount(
    0,
  );
  expect(await checkedOrder(page)).toEqual(before);
  await pickUp(page, handle(page, 'LTSE'));
  await page.mouse.move(-10, -10);
  await page.mouse.up();
  await expect(page.locator('.drop-indicator, .catalogue-lifted')).toHaveCount(
    0,
  );
  expect(await checkedOrder(page)).toEqual(before);
  // No action above created history; one Undo reverses choosing the mineral.
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(list(page)).toHaveCount(0);
});

test('keyboard pickup, position announcements, cross-group drop and cancellation', async ({
  page,
}) => {
  await start(page);
  await handle(page, 'Seiland').focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowDown');
  await expect(list(page).locator('[aria-live]')).toHaveText(
    'Seiland, Secondaries, position 2 of 10',
  );
  await page.keyboard.press('Enter');
  expect(await checkedOrder(page)).toEqual([
    'Use 91500',
    'Use Seiland',
    'Use PL',
    'Use LTSE',
  ]);
  await expect(handle(page, 'Seiland')).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Escape');
  expect(await checkedOrder(page)).toEqual([
    'Use 91500',
    'Use Seiland',
    'Use PL',
    'Use LTSE',
  ]);
  await handle(page, 'Plešovice').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  await expect(list(page).locator('[aria-live]')).toHaveText(
    'Plešovice, Secondaries, position 1 of 11',
  );
  await page.keyboard.press('Space');
  await expect(
    group(page, 'Secondaries').getByRole('checkbox', {
      name: 'Use Plešovice',
      exact: true,
    }),
  ).not.toBeChecked();
});

test('Move to… exposes full names, arrow navigation, Escape and focus return; roles reach step 3', async ({
  page,
}) => {
  await start(page);
  const button = page.getByRole('button', {
    name: 'Move 91500 to…',
    exact: true,
  });
  await button.click();
  await expect(page.getByRole('menuitem')).toHaveText([
    'Primary',
    'Reference glasses',
  ]);
  await expect(
    page.getByRole('menuitem', { name: 'Primary', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(
    page.getByRole('menuitem', { name: 'Reference glasses', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(button).toBeFocused();
  await expect(page.getByRole('menu')).toHaveCount(0);
  await button.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(
    group(page, 'Reference glasses').getByRole('checkbox', {
      name: 'Use 91500',
      exact: true,
    }),
  ).toBeChecked();
  await expect(button).toBeFocused();
  await page
    .getByRole('button', { name: 'Next: unknowns', exact: true })
    .click();
  await addCountSample(page, 'A', 18, 1);
  await page
    .getByRole('button', { name: 'Next: bracketing', exact: true })
    .click();
  await expect(page.getByTestId('standard-91500')).toContainText('reference');
  await expect(
    page
      .getByRole('combobox', { name: 'Rotation start', exact: true })
      .locator('option'),
  ).toHaveText(['Seiland', 'PL', 'LTSE']);
});

test('apatite and zircon are separate drop areas, with no extra Reference group', async ({
  page,
}) => {
  await start(page);
  await page
    .locator('.another-mineral')
    .getByRole('button', { name: 'Add', exact: true })
    .click();
  await expect(list(page, 'apatite').getByRole('region')).toHaveCount(2);
  const before = await page.evaluate(() =>
    localStorage.getItem('bracketeer.minerals'),
  );
  await pickUp(page, handle(page, 'MADUCSB', 'apatite'));
  // Scroll while captured to expose the main list, then point over it.
  await page.locator('.welcome-main').evaluate((panel) => {
    panel.scrollTop = 0;
  });
  await pointAt(page, group(page, 'Primary').getByRole('heading'));
  await expect(page.locator('.drop-indicator')).toHaveCount(0);
  await page.mouse.up();
  await expect(page.locator('.catalogue-lifted')).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem('bracketeer.minerals')),
  ).toBe(before);
  await expect(
    list(page, 'apatite').getByRole('radio', {
      name: 'Use MADUCSB',
      exact: true,
    }),
  ).not.toBeChecked();
});

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1536, height: 864 },
]) {
  for (const theme of ['light', 'dark']) {
    test(`full names and wrapped controls fit at ${viewport.width} in ${theme}`, async ({
      page,
    }) => {
      await start(page);
      await page.setViewportSize(viewport);
      await page
        .getByRole('combobox', { name: 'Theme', exact: true })
        .selectOption(theme);
      const name = 'WWWWLongStandardName'; // 20 characters, including wide glyphs.
      await group(page, 'Reference glasses')
        .getByRole('textbox', {
          name: 'Add reference glasses standard',
          exact: true,
        })
        .fill(name);
      await group(page, 'Reference glasses')
        .getByRole('button', { name: 'Add to reference glasses', exact: true })
        .click();
      await page
        .locator('.another-mineral')
        .getByRole('button', { name: 'Add', exact: true })
        .click();
      for (const standard of ['Plešovice', 'Maniitsoq', 'MADUCSB', name]) {
        const input = page.getByRole('textbox', {
          name: `Rename ${standard}`,
          exact: true,
        });
        await input.scrollIntoViewIfNeeded();
        await expect(input).toHaveValue(standard);
        expect(
          await input.evaluate((el) => el.scrollWidth <= el.clientWidth),
        ).toBe(true);
      }
      expect(
        await page
          .locator('.welcome-main')
          .evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      const clipped = await page
        .locator('.catalogue-entry button')
        .evaluateAll((buttons) =>
          buttons.some((button) => button.scrollWidth > button.clientWidth),
        );
      expect(clipped).toBe(false);
      await expect(
        page.getByRole('button', { name: 'Next: unknowns', exact: true }),
      ).toBeInViewport();
    });
  }
}

test('empty groups offer a drop zone and receive the checked standard', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('radio', { name: 'Other', exact: true }).click();
  const other = list(page, 'other');
  const primary = other.getByRole('region', { name: 'Primary', exact: true });
  await drag(
    page,
    handle(page, 'NIST610', 'other'),
    primary.locator('.catalogue-empty'),
  );
  await expect(
    primary.getByRole('radio', { name: 'Use NIST610', exact: true }),
  ).toBeChecked();
  await expect(primary.locator('.catalogue-empty')).toHaveCount(0);
  await drag(
    page,
    handle(page, 'NIST612', 'other'),
    other
      .getByRole('region', { name: 'Secondaries', exact: true })
      .locator('.catalogue-empty'),
  );
  await expect(
    other.getByRole('checkbox', { name: 'Use NIST612', exact: true }),
  ).toBeChecked();
});

test('a captured pointer near the panel edge scrolls continuously and Escape stops it', async ({
  page,
}) => {
  await start(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  const panel = page.locator('.welcome-main');
  const before = await panel.evaluate((el) => el.scrollTop);
  await pickUp(page, handle(page, 'Seiland'));
  const bounds = (await panel.boundingBox())!;
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height - 8,
    { steps: 8 },
  );
  await expect
    .poll(() => panel.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(before + 20);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.locator('.drop-indicator, .catalogue-lifted')).toHaveCount(
    0,
  );
  expect(await checkedOrder(page)).toEqual([
    'Use Seiland',
    'Use 91500',
    'Use PL',
    'Use LTSE',
  ]);
});
