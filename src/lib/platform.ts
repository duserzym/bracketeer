/** File and clipboard access selected at runtime; the browser stays fully offline. */
export interface Platform {
  openFile(accept: string): Promise<{ name: string; bytes: Uint8Array } | null>;
  saveFile(name: string, contents: Uint8Array | string): Promise<void>;
  copyText(text: string): Promise<void>;
  resetWindow(): Promise<void>;
}

const browser: Platform = {
  openFile(accept) {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.hidden = true;
      document.body.append(input);
      input.oncancel = () => {
        input.remove();
        resolve(null);
      };
      input.onchange = async () => {
        try {
          const file = input.files?.[0];
          resolve(
            file
              ? {
                  name: file.name,
                  bytes: new Uint8Array(await file.arrayBuffer()),
                }
              : null,
          );
        } catch (error) {
          reject(error);
        } finally {
          input.remove();
        }
      };
      input.click();
    });
  },
  async saveFile(name, contents) {
    const blob = new Blob(
      [typeof contents === 'string' ? contents : new Uint8Array(contents)],
      {
        type:
          typeof contents === 'string'
            ? 'text/plain;charset=utf-8'
            : 'application/octet-stream',
      },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  async copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const previous = document.activeElement;
      const area = document.createElement('textarea');
      area.value = text;
      area.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.append(area);
      area.select();
      const copied = document.execCommand('copy');
      area.remove();
      if (previous instanceof HTMLElement) previous.focus();
      if (!copied)
        throw new Error('Clipboard unavailable. Export a file instead.');
    }
  },
  async resetWindow() {},
};

const desktop: Platform = {
  async openFile(accept) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const { invoke } = await import('@tauri-apps/api/core');
    const path = await open({
      multiple: false,
      directory: false,
      filters: accept.includes('.json')
        ? [{ name: 'bracketeer project', extensions: ['bracketeer.json'] }]
        : [{ name: 'Sequence', extensions: ['xls', 'xlsx', 'csv'] }],
    });
    if (path === null) return null;
    const bytes = await invoke<ArrayBuffer | number[]>('read_file', { path });
    return {
      name: path.split(/[/\\]/).pop() ?? path,
      bytes: new Uint8Array(bytes),
    };
  },
  async saveFile(name, contents) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { invoke } = await import('@tauri-apps/api/core');
    const extension = name.endsWith('.bracketeer.json')
      ? 'bracketeer.json'
      : name.split('.').pop()!;
    const path = await save({
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
    if (path === null) return;
    const bytes =
      typeof contents === 'string'
        ? new TextEncoder().encode(contents)
        : contents;
    await invoke('write_file', { path, bytes: Array.from(bytes) });
  },
  async copyText(text) {
    const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
    await writeText(text);
  },
  async resetWindow() {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('reset_window');
  },
};

export const platform: Platform =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
    ? desktop
    : browser;
