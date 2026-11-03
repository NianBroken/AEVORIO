import { defineConfig } from 'vitest/config';

// 单元测试只读取 TypeScript 源码，发布产物不参与测试文件发现。
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**', 'storage/**'],
  },
});
