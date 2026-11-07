import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

// Exercise the production split, without the dev server's HMR timers/imports.
async function serveBuild(page: Page) {
  await page.route('http://bracketeer.test/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
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
