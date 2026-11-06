import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { readFileSync } from 'node:fs';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig(({ mode }) => {
  const singlefile = mode === 'singlefile';
  return {
    plugins: [
      svelte(),
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
      // Other modes keep dist/windows, dist/macos and bracketeer.html intact.
      emptyOutDir: singlefile,
      copyPublicDir: !singlefile,
    },
  };
});
