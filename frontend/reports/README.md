# 前端验收记录

`npm run test:e2e` 在 `reports/browser-test-report.json` 中保存实际 Chromium 浏览器检查结果。报告只记录页面、视口、图片状态、数据库响应、结果与浏览器错误，不保存数据库配置。

`layout-home.json`、`layout-products.json`和`layout-about.json`分别保存三页八种宽度的测量。`browser-maintenance-report.json`保存真实维护验证和恢复结果。`dependency-audit.json`为npm实际依赖审计。

`final-delivery-audit.json`来自后端`npm run audit:delivery`，验证数据库数据、文件、三个页面、媒体哈希、配置隔离与错误日志。`runtime-services.json`由启动脚本记录实际进程和启动时间。`runtime-output.log`与`runtime-error.log`分别保留正式进程的标准输出与错误输出。
