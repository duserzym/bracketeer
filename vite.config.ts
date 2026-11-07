import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig(({ mode }) => {
  const singlefile = mode === 'singlefile';
  return {
    define: {
      __APP_VERSION__: JSON.stringify(
        JSON.parse(
          readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
        ).version,
      ),
    },
    plugins: [
      svelte(),
      {
        name: 'clean-web-output',
        apply: 'build',
        configResolved(config) {
          if (resolve(config.build.outDir) !== resolve('dist')) return;
          // The root web output shares dist with separately built deliverables.
          // Empty this frontend only; Tauri and singlefile empty their own dirs.
          const keep = new Set([
            'windows',
            'macos',
            'tauri',
            'bracketeer.html',
          ]);
          for (const entry of existsSync('dist')
            ? readdirSync('dist', { withFileTypes: true })
            : []) {
            if (!keep.has(entry.name))
              rmSync(resolve('dist', entry.name), {
                recursive: true,
                force: true,
              });
          }
        },
      },
      ...(singlefile
        ? [
            viteSingleFile(),
            {
              name: 'inline-favicon',
              transformIndexHtml(html: string) {
                const svg = readFileSync(
                  new URL('./public/favicon.svg', import.meta.url),
                );
                return html.replace(
                  /(?:\.\/|\/)favicon\.svg/g,
                  `data:image/svg+xml;base64,${svg.toString('base64')}`,
                );
              },
            },
          ]
        : []),
    ],
    base: './',
    build: {
      assetsInlineLimit: singlefile ? Infinity : 0,
      outDir: singlefile ? 'dist/.singlefile' : 'dist',
      // Root web output is cleaned selectively above to preserve deliverables.
      emptyOutDir: singlefile,
      copyPublicDir: !singlefile,
    },
  };
});
