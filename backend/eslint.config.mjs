import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import typescript from 'typescript-eslint';

// 服务、脚本和测试共用严格的未使用代码检查，运行产物与媒体不作为源代码扫描。
export default defineConfig([
  js.configs.recommended,
  ...typescript.configs.recommended,
  {
    languageOptions: { globals: globals.node },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  globalIgnores(['**/dist/**', '**/node_modules/**', 'storage/**', 'reports/**']),
]);
