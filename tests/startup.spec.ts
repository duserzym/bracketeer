import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

// Exercise the production split, without the dev server's HMR timers/imports.
async function serveBuild(
  page: Page,
  beforeFile?: (path: string) => Promise<void>,
) {
  await page.route('http://bracketeer.test/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    await beforeFile?.(path);
    const file = resolve('dist', path === '/' ? 'index.html' : path.slice(1));
    const type = file.endsWith('.js')
      ? 'text/javascript'
      : file.endsWith('.css')
        ? 'text/css'
        : file.endsWith('.svg')
          ? 'image/svg+xml'
          : 'text/html';
    await route.fulfill({ body: await readFile(file), contentType: type });
  });
}

test('Mineral loads no file I/O chunks and stays idle for five seconds', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await serveBuild(page);
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.addInitScript(() => {
    type Counts = Record<string, number>;
    const counts: Counts = {};
    (window as typeof window & { timerCounts: Counts }).timerCounts = counts;
    // Group by API, callback source and registration stack, so re-arming a
    // timeout/RAF cannot hide behind a fresh timer ID on each iteration.
    for (const name of [
      'setInterval',
      'setTimeout',
      'requestAnimationFrame',
    ] as const) {
      const original = window[name].bind(window) as (
        callback: (...values: unknown[]) => void,
        ...args: number[]
      ) => number;
      Object.defineProperty(window, name, {
        value: (
          callback: TimerHandler | FrameRequestCallback,
          ...args: number[]
        ) => {
          const key = `${name}:${String(callback)}:${new Error().stack}`;
          const wrapped = (...values: unknown[]) => {
            counts[key] = (counts[key] ?? 0) + 1;
            if (typeof callback === 'function')
              (callback as (...values: unknown[]) => unknown)(...values);
            else (0, eval)(callback);
          };
          return original(wrapped, ...args);
        },
      });
    }
  });
  await page.goto('http://bracketeer.test/');
  await expect(
    page.getByRole('button', { name: '1 Mineral', exact: true }),
  ).toHaveAttribute('aria-current', 'step');
  await page.waitForTimeout(5000);
  const counts = await page.evaluate(
    () =>
      (window as typeof window & { timerCounts: Record<string, number> })
        .timerCounts,
  );
  expect(Object.values(counts).length).toBeGreaterThan(0); // startup autosave
  expect(Object.entries(counts).filter(([, fired]) => fired > 1)).toEqual([]);
  expect(
    requests.filter((url) =>
      /\/(xlsx|import|export|QtegraPaste)-[^/]+\.js/.test(url),
    ),
  ).toEqual([]);

  expect(
    requests.filter((url) => /\/Step2Unknowns-[^/]+\.js/.test(url)),
  ).toHaveLength(1);
  expect(requests.filter((url) => /\/Step[34][^/]+\.js/.test(url))).toEqual([]);
  // Prefetch loads code without mounting hidden input panels on the launch screen.
  await expect(page.locator('.unknowns-step, .bracketing-step')).toHaveCount(0);

  // Prove this log can see the lazy dependency, rather than a renamed/missing chunk.
  await page.getByRole('button', { name: 'Open example', exact: true }).click();
  await page
    .getByRole('button', { name: 'Generate and review', exact: true })
    .click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export .xls', exact: true }).click();
  await download;
  expect(requests.some((url) => /\/xlsx-[^/]+\.js/.test(url))).toBe(true);
});

// Stall production chunks to make the module-ready boundary observable.
test('keeps the current step painted until a requested chunk is ready', async ({
  page,
}) => {
  let releaseUnknowns!: () => void;
  let releaseBracketing!: () => void;
  let releaseReview!: () => void;
  const unknowns = new Promise<void>((done) => (releaseUnknowns = done));
  const bracketing = new Promise<void>((done) => (releaseBracketing = done));
  const review = new Promise<void>((done) => (releaseReview = done));
  await serveBuild(page, async (path) => {
    if (/\/Step2Unknowns-/.test(path)) await unknowns;
    if (/\/Step3Bracketing-/.test(path)) await bracketing;
    if (/\/Step4Review-/.test(path)) await review;
  });
  try {
    await page.goto('http://bracketeer.test/');
    await page.getByRole('radio', { name: 'Zircon', exact: true }).click();
    await page
      .getByRole('button', { name: 'Next: unknowns', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: '2 Unknowns', exact: true }),
    ).toHaveAttribute('aria-current', 'step');
    await expect(
      page.getByRole('radiogroup', { name: 'Mineral', exact: true }),
    ).toBeVisible();
    releaseUnknowns();
    await expect(
      page.getByRole('textbox', { name: 'Paste unknowns', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page
      .getByRole('button', { name: 'Open example', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: '3 Bracketing', exact: true }),
    ).toHaveAttribute('aria-current', 'step');
    await expect(
      page.getByRole('radiogroup', { name: 'Mineral', exact: true }),
    ).toBeVisible();
    releaseBracketing();
    await expect(page.getByTestId('budget')).toContainText('37 brackets');
    await page
      .getByRole('button', { name: 'Generate and review', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: '4 Review', exact: true }),
    ).toHaveAttribute('aria-current', 'step');
    await expect(page.getByTestId('plan-summary')).toBeVisible();
    releaseReview();
    await expect(page.getByTestId('counts')).toContainText('332 rows');
    await expect(
      page.getByRole('button', { name: '4 Review', exact: true }),
    ).toHaveAttribute('aria-current', 'step');
  } finally {
    releaseUnknowns();
    releaseBracketing();
    releaseReview();
  }
});

test('opening the example keeps its project when navigation replaces a stalled bracketing step', async ({
  page,
}) => {
  let releaseBracketing!: () => void;
  let startedBracketing!: () => void;
  const stalled = new Promise<void>((done) => (releaseBracketing = done));
  const started = new Promise<void>((done) => (startedBracketing = done));
  await serveBuild(page, async (path) => {
    if (/\/Step3Bracketing-/.test(path)) {
      startedBracketing();
      await stalled;
    }
  });
  try {
    await page.goto('http://bracketeer.test/');
    await page
      .getByRole('button', { name: 'Open example', exact: true })
      .click();
    // Do not wait for the target panel: this is the sequence used by exampleBracketing.
    await page.getByRole('button', { name: '1 Mineral', exact: true }).click();
    await page
      .getByRole('button', { name: 'Next: unknowns', exact: true })
      .click();
    await expect(page.getByTestId('unknown-total')).toHaveText(
      '234 unknowns in this session',
    );
    await expect(
      page.getByRole('button', { name: 'Session 2', exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    // Step 2 also prefetches step 3, so the same in-flight import can finish later.
    await started;
    const loaded = page.waitForResponse((response) =>
      /\/Step3Bracketing-/.test(response.url()),
    );
    releaseBracketing();
    await (await loaded).finished();
    await expect(
      page.getByRole('button', { name: '2 Unknowns', exact: true }),
    ).toHaveAttribute('aria-current', 'step');
    await expect(page.getByTestId('unknown-total')).toHaveText(
      '234 unknowns in this session',
    );
    await page
      .getByRole('button', { name: 'Next: bracketing', exact: true })
      .click();
    await expect(page.getByTestId('budget')).toContainText(
      '37 brackets for 2 sessions (19 + 18), 40 secondary pairs',
    );
  } finally {
    releaseBracketing();
  }
});
