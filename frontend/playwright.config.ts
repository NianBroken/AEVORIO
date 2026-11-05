import { defineConfig } from '@playwright/test';
// 工作进程由测试运行器设置终端颜色，移除继承的冲突配置。
delete process.env.NO_COLOR;

// 浏览器基准尺寸以同一个 1440 逻辑画布为准，单测与正式服务均通过真实接口。
const baseURL = process.env.AEVORIO_E2E_BASE_URL ?? 'http://127.0.0.1:24681';

export default defineConfig({
  testDir: './e2e',
  expect: { timeout: 15000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['json', { outputFile: 'reports/browser-test-report.json' }],
  ],
  projects: [
    { name: "visual-options", testMatch: "visual-options.spec.ts", dependencies: ["maintenance", "admin-compatibility"] },
    { name: 'admin-routes', testMatch: ['admin-routes.spec.ts', 'loading.spec.ts', 'upload-layout.spec.ts'] },
    { name: 'website', testMatch: ['site.spec.ts', 'failure-state.spec.ts', 'layout-compatibility.spec.ts', 'native-zoom.spec.ts'] },
    { name: 'admin', testMatch: 'admin.spec.ts', dependencies: ['website'] },
    { name: 'global-settings', testMatch: 'global-settings.spec.ts', dependencies: ['admin'] },
    { name: 'admin-compatibility', testMatch: 'admin-compatibility.spec.ts', dependencies: ['global-settings'] },
    {
      name: 'maintenance',
      testMatch: 'maintenance.spec.ts',
      dependencies: ['global-settings'],
    },
    {
      name: 'coverage',
      testMatch: 'coverage.spec.ts',
      dependencies: ['maintenance'],
    },
  ],
  use: {
    baseURL,
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1440, height: 960 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  outputDir: './test-results',
});
