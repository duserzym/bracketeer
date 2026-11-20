import { expect, test, type Page } from '@playwright/test';

type NativeTestState = {
  calls: { command: string; args: unknown }[];
  installedPrefs: Record<string, unknown> | null;
};
const nativeState = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { updateTest: NativeTestState }).updateTest,
  );

/** Mock the IPC boundary, so the real page policy runs without a native install. */
async function desktop(
  page: Page,
  options: {
    version?: string;
    notes?: string | null;
    prefs?: Record<string, unknown>;
  } = {},
) {
  await page.addInitScript(
    ({ version, notes, prefs }) => {
      if (!localStorage.getItem('bracketeer.updates'))
        localStorage.setItem('bracketeer.updates', JSON.stringify(prefs));
      const state: NativeTestState = { calls: [], installedPrefs: null };
      Object.defineProperty(window, 'updateTest', { value: state });
      const info = {
        version: '0.2.0',
        currentVersion: version,
        notes,
        date: null,
        ready: false,
      };
      Object.defineProperty(window, '__TAURI_INTERNALS__', {
        value: {
          transformCallback: () => 1,
          async invoke(command: string, args?: unknown) {
            state.calls.push({ command, args });
            switch (command) {
              case 'plugin:app|version':
                return version;
              case 'update_supported':
                return true;
              case 'update_status':
                return null;
              case 'update_check':
                return info;
              case 'plugin:event|listen':
                return 1;
              case 'plugin:event|unlisten':
                return;
              case 'update_download':
                return { ...info, ready: true };
              case 'open_release_url':
                return;
              case 'update_install':
                state.installedPrefs = JSON.parse(
                  localStorage.getItem('bracketeer.updates')!,
                );
                return new Promise(() => {});
              default:
                throw new Error(`Unexpected IPC: ${command}`);
            }
          },
        },
      });
      Object.defineProperty(window, '__TAURI_EVENT_PLUGIN_INTERNALS__', {
        value: { unregisterListener() {} },
      });
    },
    {
      version: options.version ?? '0.1.0',
      notes:
        options.notes === undefined
          ? '- Print sheets fit A4 and Letter.'
          : options.notes,
      prefs: options.prefs ?? { autoDownload: false },
    },
  );
}

test('manual update renders manifest notes as text, uses the native opener and saves notes before installation', async ({
  page,
}) => {
  const notes =
    '- Print sheets fit A4 and Letter.\n<img src=x onerror="alert(1)">';
  await desktop(page, {
    notes,
    prefs: { channel: 'beta', autoDownload: false },
  });
  await page.goto('/');
  const button = page.getByTestId('check-updates');
  await button.click();
  const popover = page.getByTestId('check-updates-popover');
  await expect(popover).toContainText('Update available: v0.2.0');
  await expect(popover.locator('.notes')).toHaveText(notes);
  await expect(popover.locator('img')).toHaveCount(0);
  await popover
    .getByRole('link', { name: 'Release notes', exact: true })
    .click();
  await expect
    .poll(async () =>
      (await nativeState(page)).calls.filter(
        (call) => call.command === 'open_release_url',
      ),
    )
    .toEqual([
      {
        command: 'open_release_url',
        args: {
          url: 'https://github.com/duserzym/bracketeer/releases/tag/v0.2.0',
        },
      },
    ]);
  expect(page.context().pages()).toHaveLength(1);
  await popover.getByRole('button', { name: 'Download', exact: true }).click();
  await expect(popover).toContainText('v0.2.0 is ready');
  await expect(popover.locator('.notes')).toHaveText(notes);
  await popover.getByRole('button', { name: 'Restart to update' }).click();
  await expect(popover).toContainText('Installing v0.2.0 and restarting…');
  await expect(button.locator('svg')).toHaveCSS('animation-name', /spin$/);
  await expect
    .poll(async () => (await nativeState(page)).installedPrefs)
    .toMatchObject({
      lastSeenVersion: '0.1.0',
      pendingNotes: { version: '0.2.0', notes },
    });
  // Stable only: the check passes no channel or endpoint (no args, or an empty object).
  expect(
    (await nativeState(page)).calls.find(
      (call) => call.command === 'update_check',
    )?.args ?? {},
  ).toEqual({});
  expect((await nativeState(page)).installedPrefs).not.toHaveProperty(
    'channel',
  );
});

test('automatic download shows ready notes in both surfaces', async ({
  page,
}) => {
  await page.clock.install();
  await desktop(page, { prefs: { autoDownload: true } });
  await page.goto('/');
  await expect(page.getByTestId('version-chip')).toHaveText('v0.1.0');
  await expect
    .poll(async () =>
      (await nativeState(page)).calls.some(
        (call) => call.command === 'update_status',
      ),
    )
    .toBe(true);
  await page.clock.fastForward(8100);
  await expect(page.getByTestId('check-updates')).toHaveAttribute(
    'data-badge',
    'true',
  );
  await page.getByTestId('version-chip').click();
  const panel = page.getByTestId('updates-panel');
  await expect(panel).toContainText('v0.2.0 is ready');
  await expect(panel).toContainText('Print sheets fit A4 and Letter.');
  await panel.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByTestId('check-updates').click();
  await expect(page.getByTestId('check-updates-popover')).toContainText(
    'Print sheets fit A4 and Letter.',
  );
});

for (const saved of [true, false]) {
  test(`unbundled running version uses ${saved ? 'saved manifest notes' : 'the version fallback'}`, async ({
    page,
  }) => {
    await desktop(page, {
      version: '9.9.9',
      prefs: {
        lastSeenVersion: '0.1.0',
        ...(saved
          ? {
              pendingNotes: { version: '9.9.9', notes: 'Saved release notes.' },
            }
          : {}),
      },
    });
    await page.goto('/');
    const card = page.getByTestId('whats-new');
    await expect(card).toContainText("What's new in v9.9.9");
    await expect(card).toContainText(
      saved ? 'Saved release notes.' : 'Updated to v9.9.9.',
    );
    await page.keyboard.press('Escape');
    await expect(card).not.toBeVisible();
    await page.reload();
    await expect(page.getByTestId('version-chip')).toHaveText('v9.9.9');
    await expect(card).not.toBeVisible();
    await page.getByTestId('check-updates').click();
    await page.getByRole('button', { name: "What's new", exact: true }).click();
    await expect(card).toContainText(
      saved ? 'Saved release notes.' : 'Updated to v9.9.9.',
    );
  });
}
