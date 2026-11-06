import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

export default defineConfig(
  {
    ignores: [
      '.pnpm-store/**',
      'dist/**',
      'node_modules/**',
      'test-results/**',
      'playwright-report/**',
      'src-tauri/target/**',
      'src-tauri/gen/**',
    ],
  },
  js.configs.recommended,
  ts.configs.recommended,
  svelte.configs['flat/recommended'],
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: {
      parserOptions: { parser: ts.parser, svelteConfig },
    },
  },
  prettier,
  svelte.configs['flat/prettier'],
);
