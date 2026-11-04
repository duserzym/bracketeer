/** The desktop implementation can replace this interface without changing the UI. */
export interface Platform {
  openFile(accept: string): Promise<{ name: string; bytes: Uint8Array } | null>;
  saveFile(name: string, contents: Uint8Array | string): Promise<void>;
  copyText(text: string): Promise<void>;
}

export const platform: Platform = {
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
};
