import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { addCountSample, commitCell, startZircon } from './helpers';

test.skip(
  process.env.SCREENSHOTS !== '1',
  'Set SCREENSHOTS=1 to refresh the wizard images.',
);

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
]) {
  test(`wizard screenshots at ${viewport.width}`, async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium',
      'One set of documentation images.',
    );
    await mkdir('docs/screenshots', { recursive: true });
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.getByRole('radio', { name: 'Zircon', exact: true }).click();
    await page.screenshot({
      path: `docs/screenshots/wizard-${viewport.width}-1-mineral.png`,
    });
    await page
      .getByRole('button', { name: 'Open example', exact: true })
      .click();
    await page.getByRole('button', { name: '2 Unknowns', exact: true }).click();
    await page.screenshot({
      path: `docs/screenshots/synthetic-wizard-${viewport.width}-2-unknowns.png`,
    });
    await page
      .getByRole('button', { name: 'Next: bracketing', exact: true })
      .click();
    await expect(page.getByTestId('formula-S513')).toContainText(
      '37 brackets × 2',
    );
    await page.screenshot({
      path: `docs/screenshots/synthetic-wizard-${viewport.width}-3-bracketing.png`,
    });
    await page
      .getByRole('button', { name: 'Generate and review', exact: true })
      .click();
    await expect(page.getByTestId('counts')).toContainText('332 rows');
    await page.screenshot({
      path: `docs/screenshots/synthetic-wizard-${viewport.width}-4-review.png`,
    });
    await page
      .getByRole('button', { name: 'Qtegra paste', exact: true })
      .click();
    await expect(page.getByTestId('paste-scroll')).toBeVisible();
    await page.screenshot({
      path: `docs/screenshots/synthetic-wizard-${viewport.width}-4-paste.png`,
    });
  });
}

test('design formulas and automatic unknown numbering screenshots', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium',
    'One set of documentation images.',
  );
  await mkdir('docs/screenshots', { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await startZircon(page);
  for (const [i, name] of ['SYN-1', 'SYN-2', 'SYN-3'].entries())
    await addCountSample(page, name, 30, i + 1);
  await commitCell(page, 'Unknown 1 begin', '1');
  await commitCell(page, 'Unknown 3 begin', '80');
  await page.locator('.samples-panel h2').click();
  await page
    .getByRole('spinbutton', { name: 'Unknown 1 begin', exact: true })
    .hover();
  await expect(
    page.getByRole('spinbutton', { name: 'Unknown 3 begin', exact: true }),
  ).not.toBeFocused();
  await expect(
    page.getByRole('button', { name: 'Auto Unknown 1 begin', exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: 'docs/screenshots/synthetic-wizard-1440-2-numbering.png',
  });
  await page
    .getByRole('button', { name: 'Next: bracketing', exact: true })
    .click();
  await commitCell(page, 'S513 begin', '200');
  await page
    .getByRole('heading', { name: 'Live summary', exact: true })
    .click();
  await expect(page.getByTestId('formula-S513')).toContainText(
    '5 brackets × 2',
  );
  await expect(page.getByTestId('budget')).toHaveText(
    '5 brackets, 5 secondary pairs.',
  );
  await page.screenshot({ path: 'docs/screenshots/wizard-1440-3-design.png' });
});

test('two minerals screenshot keeps the additional mineral controls in view', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium',
    'One set of documentation images.',
  );
  await mkdir('docs/screenshots', { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('radio', { name: 'Zircon', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Another mineral in this run', exact: true })
    .selectOption('apatite');
  await page
    .locator('.another-mineral')
    .getByRole('button', { name: 'Add', exact: true })
    .click();
  const another = page.locator('.another-mineral');
  await another.scrollIntoViewIfNeeded();
  await expect(another).toBeInViewport();
  await expect(
    page.getByRole('heading', { name: 'Apatite', exact: true }),
  ).toBeInViewport();
  await expect(
    page.getByRole('radio', { name: 'Use MAD', exact: true }),
  ).toBeChecked();
  await page.screenshot({
    path: 'docs/screenshots/wizard-1440-1-two-minerals.png',
  });
});

test('GrainAtlas screenshot shows the loaded file and the mount warning', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium',
    'One set of documentation images.',
  );
  await mkdir('docs/screenshots', { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await startZircon(page);
  for (const [i, name] of ['SYN-1', 'SYN-2', 'SYN-3'].entries())
    await addCountSample(page, name, 18, i + 1);
  const file = testInfo.outputPath('mount.csv');
  await writeFile(
    file,
    'name,x_stage,y_stage,kind,grain,sample\n' +
      Array.from(
        { length: 40 },
        (_, i) => `SYN-1_${i + 1},${i},0,spot,${i + 1},SYN-1\n`,
      ).join(''),
  );
  const chooser = page.waitForEvent('filechooser');
  await page
    .getByRole('button', { name: 'Load GrainAtlas spots…', exact: true })
    .click();
  await (await chooser).setFiles(file);
  await expect(
    page.getByText('GrainAtlas: 40 spots from mount.csv', { exact: false }),
  ).toBeInViewport();
  await expect(
    page
      .getByTestId('samples-panel')
      .getByText(/This run uses .*GrainAtlas placed 40/u),
  ).toBeInViewport();
  await page.screenshot({
    path: 'docs/screenshots/synthetic-wizard-1440-2-grainatlas.png',
  });
});

// Supervisor refreshes these with SCREENSHOTS=1, alongside the existing images.
for (const viewport of [
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1536, height: 864 },
]) {
  for (const theme of ['light', 'dark']) {
    test(`step 1 standards at ${viewport.width} in ${theme}`, async ({
      page,
    }, testInfo) => {
      test.skip(
        testInfo.project.name !== 'chromium',
        'One set of documentation images.',
      );
      await mkdir('docs/screenshots', { recursive: true });
      await page.setViewportSize(viewport);
      await page.goto('/');
      await page
        .getByRole('combobox', { name: 'Theme', exact: true })
        .selectOption(theme);
      await page.getByRole('radio', { name: 'Zircon', exact: true }).click();
      await expect(
        page.getByRole('textbox', { name: 'Rename Plešovice', exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: `docs/screenshots/wizard-${viewport.width}-1-mineral-${theme}.png`,
      });
      await page
        .getByRole('button', { name: 'Move 91500 to…', exact: true })
        .click();
      await expect(
        page.getByRole('menuitem', { name: 'Reference glasses', exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: `docs/screenshots/wizard-${viewport.width}-1-move-menu-${theme}.png`,
      });
    });
  }
}
