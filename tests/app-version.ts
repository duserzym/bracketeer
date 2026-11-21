import { readFileSync } from 'node:fs';

// Match Vite's __APP_VERSION__ source for browser builds.
export const APP_VERSION: string = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).version;
