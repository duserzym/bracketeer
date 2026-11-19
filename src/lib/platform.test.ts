import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  open: vi.fn(),
  save: vi.fn(),
  invoke: vi.fn(),
  writeText: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: native.open,
  save: native.save,
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: native.invoke }));
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({
  writeText: native.writeText,
}));

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
});
afterEach(() => vi.unstubAllGlobals());

describe('native platform', () => {
  it('opens projects with the compound extension and preserves binary bytes and Windows basenames', async () => {
    native.open.mockResolvedValue('C:\\runs\\mount.bracketeer.json');
    native.invoke.mockResolvedValue(new Uint8Array([0, 128, 255]).buffer);
    const { platform } = await import('./platform');
    expect(await platform.openFile('.bracketeer.json,.json')).toEqual({
      name: 'mount.bracketeer.json',
      bytes: new Uint8Array([0, 128, 255]),
    });
    expect(native.open).toHaveBeenCalledWith({
      multiple: false,
      directory: false,
      filters: [
        { name: 'bracketeer project', extensions: ['bracketeer.json'] },
      ],
    });
    expect(native.invoke).toHaveBeenCalledWith('read_file', {
      path: 'C:\\runs\\mount.bracketeer.json',
    });
  });

  it('opens sequences with workbook and CSV filters and a macOS basename', async () => {
    native.open.mockResolvedValue('/runs/session.xls');
    native.invoke.mockResolvedValue([0, 255]);
    const { platform } = await import('./platform');
    expect(await platform.openFile('.xls,.xlsx,.csv,.tsv,.txt')).toEqual({
      name: 'session.xls',
      bytes: new Uint8Array([0, 255]),
    });
    expect(native.open.mock.calls[0]![0].filters).toEqual([
      { name: 'Sequence', extensions: ['xls', 'xlsx', 'csv'] },
    ]);
  });

  it('opens GrainAtlas CSV and text files with the requested native filters', async () => {
    native.open.mockResolvedValue('/runs/mount.csv');
    native.invoke.mockResolvedValue([]);
    const { platform } = await import('./platform');
    expect((await platform.openFile('.csv,.txt'))?.name).toBe('mount.csv');
    expect(native.open.mock.calls[0]![0].filters).toEqual([
      { name: 'GrainAtlas spots', extensions: ['csv', 'txt'] },
    ]);
  });

  it('cancels dialogs without reading or writing files', async () => {
    native.open.mockResolvedValue(null);
    native.save.mockResolvedValue(null);
    const { platform } = await import('./platform');
    expect(await platform.openFile('.xls')).toBeNull();
    await platform.saveFile('session.xls', new Uint8Array([42]));
    expect(native.invoke).not.toHaveBeenCalled();
  });

  it.each(['xls', 'xlsx', 'csv', 'bracketeer.json'])(
    'saves %s with its suggested name, filter and bytes',
    async (extension) => {
      const name = `mount.${extension}`;
      native.save.mockResolvedValue(`/runs/${name}`);
      const { platform } = await import('./platform');
      await platform.saveFile(name, new Uint8Array([0, 128, 255]));
      expect(native.save).toHaveBeenCalledWith({
        defaultPath: name,
        filters: [
          {
            name:
              extension === 'bracketeer.json'
                ? 'bracketeer project'
                : extension.toUpperCase(),
            extensions: [extension],
          },
        ],
      });
      expect(native.invoke).toHaveBeenCalledWith('write_file', {
        path: `/runs/${name}`,
        bytes: [0, 128, 255],
      });
    },
  );

  it('encodes text as UTF-8 and passes clipboard text without changing CRLF', async () => {
    native.save.mockResolvedValue('/runs/mount.csv');
    const { platform } = await import('./platform');
    await platform.saveFile('mount.csv', 'é,TRUE\r\n');
    expect(native.invoke).toHaveBeenCalledWith('write_file', {
      path: '/runs/mount.csv',
      bytes: Array.from(new TextEncoder().encode('é,TRUE\r\n')),
    });
    await platform.copyText('S513_650\tTRUE\r\n');
    expect(native.writeText).toHaveBeenCalledWith('S513_650\tTRUE\r\n');
    await platform.resetWindow();
    expect(native.invoke).toHaveBeenCalledWith('reset_window');
  });

  it('propagates native errors to the UI', async () => {
    native.open.mockResolvedValue('/runs/session.xls');
    native.invoke.mockRejectedValue(new Error('Permission denied'));
    const { platform } = await import('./platform');
    await expect(platform.openFile('.xls')).rejects.toThrow(
      'Permission denied',
    );
  });
});

it('uses the browser implementation without the Tauri runtime', async () => {
  vi.stubGlobal('window', {});
  const { platform } = await import('./platform');
  await platform.resetWindow();
  expect(native.invoke).not.toHaveBeenCalled();
});
