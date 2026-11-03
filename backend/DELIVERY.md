# AEVORIO 项目交付说明

交付日期为 2026 年 11 月 3 日。项目名称 AEVORIO，作者 NianBroken。本项目在当前 Windows 11 x64 设备完成开发、正式构建、数据库恢复校验和实际运行验收。保留原有示例公司、产品资料与工程图片。

## 1. 交付范围与实际结果

项目根目录只保留 frontend 和 backend 两个业务目录。前台使用 TypeScript、Next.js、React，后端使用 Node.js、Express、MySQL。管理应用位于 backend/admin-ui，使用 React、TypeScript、Vite、Ant Design，正式文件由 Express 的 /admin/ 提供。

| 核验项 | 最终结果 |
| --- | --- |
| 公开页面 | 首页、产品介绍、关于我们，共 3 页 |
| 页面板块 | 首页 12 个、产品页 13 个、关于我们 12 个，共 37 个 |
| 当前产品与类别 | 45 款产品，9 个类别 |
| 当前媒体 | 53 项，原有 52 项图片与 1 项可管理站点图标 |
| 可编辑字段 | 1447 个，全部完成隔离浏览器验证 |
| 可维护资源条目 | 1584 项，包含列表中的独立条目 |
| 资源映射与验证 | 1584 项映射，1584 项通过，未通过 0 项 |
| 后端测试 | 45 项全部通过 |
| 完整浏览器回归 | 15 项全部通过，失败 0 项、跳过 0 项、重试通过 0 项 |
| 后台专项复测 | 图片替换与原文件恢复、新建、隐藏、排序、删除、关联信息均通过 |
| 指定窗口尺寸 | 前台三页和后台均完成八种尺寸检查 |
| 截图 | 正式验收 50 张，修改前基准 6 张 |
| 正式服务 | Express 与 Next.js 由无窗口守护进程维持运行 |

统计以 reports/resource-coverage-report.json、reports/final-delivery-audit.json 和前台实际测试报告为准。字段数和资源条目数分别统计，媒体数量不代替资源覆盖数量。

## 2. 实施与保留情况

1. 保存原有三个页面的首屏和完整截图，登记数据库、组件、图标、页面元信息和弹窗中的维护资源。
2. 备份数据库结构、实际行数据、媒体、资源映射和私有配置，在独立 MySQL 测试库恢复并比较行内容与文件校验值。
3. 扩展原有六张业务表，保留现有 ID 和内容，集中维护 database/schema.sql。增加管理员、会话、历史版本、操作记录、媒体版本与迁移状态。
4. 建立统一资源服务，执行字段允许名单、引用校验、事务、版本冲突、重复操作检查、软删除和历史恢复。
5. 建立管理界面，产品、类别、板块、共享文案、SEO、图标、媒体和展示参数使用对应表单维护。
6. 将前台展示内容接入数据库，类别名称只使用类别记录，产品目录按类别 ID 关联，移除原有固定类别和产品数量校验。
7. 处理不可变媒体文件与历史文件引用，上传失败保持原图片，独立对象恢复不改动其他对象的共享图片。
8. 统一 1440 像素逻辑画布，核对首屏比例、正文对比、标题换行、产品文字容量、引言、结尾导航、弹窗和页面高度。
9. 完成接口、事务、安全、故障、浏览器、逐字段、八种尺寸与正式构建检查，再执行真实运行审计。
10. 清理临时验收账户与凭据，保留可追溯的测试操作历史和可恢复删除记录，原示例公开内容已恢复。

## 3. 管理与发布

后台地址为 http://127.0.0.1:3101/admin/。正式用户名为 administrator。随机首次登录凭据保存在 storage/private/administrator-credentials.json，终端和普通日志不打印密码。首次登录必须修改密码。

保存并发布立即更新公开内容，不设置草稿。公开网站下一次请求或刷新读取已提交数据。保存失败保留表单输入，版本冲突拒绝覆盖其他管理员的修改。

历史与恢复先显示差异，再生成新的当前版本。历史记录保留，不回写或删除旧历史。产品、板块、类别和媒体支持符合引用约束的可恢复删除。被产品引用的类别不能直接删除，每个公开页面必须至少保留十个有效板块。

常用操作、管理员创建与重置、图片替换、字段长度、迁移、备份和整库恢复见 README.md。列表字段通过结构化表单编辑，不要求填写 JSON。

## 4. 安全与文件一致性

密码使用 Argon2id，服务器端会话保存在 MySQL。登录更换会话标识，密码重置使旧会话失效。Cookie 使用 HttpOnly 与 SameSite，Secure 依据明确配置的访问协议启用，兼容本机 HTTP。

管理接口验证身份、CSRF 和来源。登录限速，请求体和文件大小受限。可编辑资源与字段由服务端允许名单控制，不接受任意表名、SQL、路径、脚本或 SVG 上传。

图片通过 Sharp 真实解码和像素约束校验，使用系统文件名和内容版本。当前内容、媒体版本和可恢复历史都参与文件保护。数据库、历史与操作记录在同一发布事务提交，文件完整落盘后才更新引用。

布局算法、数据库凭据、固定项目名称与作者、权限和安全规则、程序接口、内部诊断不向内容管理员开放。后台自身的系统控件属于应用程序界面，不作为网站发布内容。排除原因列入资源报告。

## 5. 测试证据

| 证据文件 | 验证内容 |
| --- | --- |
| reports/backend-unit-test-report.json | 全部后端测试与结果 |
| reports/admin-integration-report.json | 管理接口、身份、事务、版本、故障、历史和关联信息 |
| reports/resource-field-verification.json | 隔离数据库中字段发布、重读和恢复 |
| reports/resource-inventory-before.json | 实施前资源登记 |
| reports/resource-inventory.json | 当前资源来源、规则、页面、共享关系、编辑入口和验证状态 |
| reports/resource-coverage-report.json | 1584 项资源的映射、摘要与验证证据 |
| reports/migration-report.json | 兼容迁移和迁移前备份 |
| reports/migration-repeat-verification.json | 重复迁移前后公开内容摘要一致 |
| reports/live-api-report.json | 当前实际地址和公开接口 |
| reports/final-live-edit-verification.json | 最终正式构建启动后的真实发布、浏览器显示、历史恢复与无关产品保护 |
| reports/final-delivery-audit.json | 数据、媒体、页面、后台、私有配置隔离和当前日志 |
| reports/backend-build-verification.json、reports/admin-build-verification.json | 后端与管理应用正式检查和构建 |
| ../frontend/reports/browser-test-report.json | 完整浏览器回归 |
| ../frontend/reports/admin-browser-report.json | 管理界面的实际发布、恢复、上传、替换、删除和尺寸检查 |
| ../frontend/reports/resource-dom-coverage.json | 1447 个字段的实际 DOM、元信息、持久化与历史恢复 |
| ../frontend/reports/layout-*.json | 三页在八种尺寸下的画布、比例、列数和边界测量 |
| ../frontend/reports/recovery-verification.json | 两个服务异常退出后的真实自动恢复 |
| ../frontend/reports/persistence-verification.json | 重新启动后内容与媒体版本保持一致 |
| ../frontend/reports/autostart-verification.json | SYSTEM 设备启动任务实际启动与四个地址访问 |
| ../frontend/screenshots | 修改前后和八种尺寸的真实截图 |

故障检查覆盖未登录、错误密码、CSRF、伪造来源、过期会话、旧会话失效、限速、危险链接、脚本、非法字段、SQL 输入、非法路径、伪造图片、SVG、超大文件、版本冲突、重复提交、数据库事务失败、文件写入失败、共享图片恢复和并发板块数量约束。

逐字段浏览器检查使用独立 MySQL 库、独立媒体目录和独立故障缓存。正式界面联动修改在验证后恢复。恢复时核对无关对象，防止把整个网站回退到旧快照。

八种尺寸为 1920×1080、1600×900、1440×900、1280×800、1024×768、768×1024、390×844、320×700。产品矩阵保持五列，三页和后台均检查实际横向边界。

## 6. 运行、机器启动与备份

前台为 http://127.0.0.1:3000/，产品页为 /products，关于我们为 /about。实际 PID、启动时间和地址保存在 ../frontend/reports/runtime-services.json，不把历史 PID 当作当前状态。

在项目根目录执行：

```powershell
& ./frontend/scripts/start-site.ps1
& ./frontend/scripts/stop-site.ps1
```

设备启动任务 AEVORIO-ACE6A0101A 已注册，使用 SYSTEM 和 BootTrigger，启动后三十秒调用项目启动脚本。任务已经实际启动并访问四个地址，结果均为 HTTP 200。验收未重启整台电脑。

守护进程已通过实际终止 Express 和 Next.js 进程的恢复检查。两项服务均自动生成新 PID，恢复 HTTP 200。当前运行错误日志为空，旧运行日志单独归档保留。

备份位于 storage/backups，目录有本机权限限制且排除版本提交。每份通过校验的备份含 restore-verification.json。交付时生成一份清理临时账户后的最终备份，具体目录见 reports/handover-verification.json。

## 7. 重复验收命令

在项目根目录执行：

```powershell
npm --prefix backend test
npm --prefix backend run test:browser:prepare
npm --prefix frontend run test:e2e
npm --prefix backend run test:browser:cleanup
npm --prefix backend run coverage:report
npm --prefix backend run verify:live
npm --prefix backend run audit:delivery
npm --prefix backend run site:backup
```

临时验收账户由准备命令生成随机密码，只写受限文件。清理命令撤销账户与会话，删除临时凭据，并清理中断验收留下的指定临时内容。验证报告保留，正式管理员不受影响。

更换机器或路径时，按 README.md 安装项目依赖、填写实际环境配置、恢复备份、执行兼容迁移并重新注册设备启动任务。设备级工具与三个应用的依赖清单分别管理。
