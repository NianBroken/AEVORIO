import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig, globalIgnores } from 'eslint/config';
import typescript from 'typescript-eslint';

export default defineConfig([
  js.configs.recommended,
  ...typescript.configs.recommended,
  {
    plugins: {
      '@next/next': nextPlugin,
      'react-hooks': reactHooks,
    },
    rules: {
      ...nextPlugin.configs['core-web-vitals'].rules,
      ...reactHooks.configs.flat.recommended.rules,
    },
  },
  globalIgnores([
    '.next/**',
    'node_modules/**',
    'playwright-report/**',
    'test-results/**',
    'next-env.d.ts',
  ]),
]);
