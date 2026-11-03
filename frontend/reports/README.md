# AEVORIO 前台与运行验收记录

此目录中的生成报告和运行记录仅保存在本机，由 Git 忽略，不随源码提交。此说明文件保留在版本库中。

报告保存真实运行结果，不包含数据库密码和管理员密码。完整交付说明见 backend/DELIVERY.md。

| 文件 | 核验内容 |
| --- | --- |
| browser-test-report.json | 完整 Chromium 回归，15 项全部通过 |
| admin-browser-report.json | 后台发布、上传与替换、历史恢复、新建、隐藏、排序、删除和八种尺寸 |
| resource-dom-coverage.json | 隔离环境中 1447 个可编辑字段的实际显示、持久化和恢复 |
| browser-maintenance-report.json | 维护工具、产品文字、图片像素与版本地址、原内容恢复 |
| layout-home.json、layout-products.json、layout-about.json | 三页八种窗口尺寸、画布比例、高度、五列产品和横向边界 |
| frontend-build-verification.json | 前台类型检查、代码规范检查、正式构建的实际完成记录 |
| dependency-audit.json | npm 依赖审计 |
| migration-repeat-verification.json | 见 backend/reports，对重复迁移前后公开数据摘要进行比较 |
| persistence-verification.json | 服务重新启动后，内容和媒体版本摘要保持一致 |
| recovery-verification.json | 实际终止前后端进程后，守护进程恢复服务并通过 HTTP 检查 |
| autostart-task.json、autostart-verification.json | SYSTEM 设备启动任务注册和实际启动验收，未重启整台电脑 |
| runtime-services.json | 当前守护进程与两个服务的实际 PID、启动时间、地址和状态 |
| final-delivery-audit.json | 后端最终运行审计的同步副本 |

runtime-output.log 和 runtime-error.log 保存当前前台输出。后端同名文件保存后端输出。backend/reports/supervisor-error.log 保存守护进程错误输出。每次启动前的旧日志保留在各自 runtime-history 目录。
