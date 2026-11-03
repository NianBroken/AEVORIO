# AEVORIO 企业网站

项目作者为 NianBroken。网站用于公司介绍与硬件展示，当前企业名称、业务描述及产品均明确标为示例。AEVORIO 是项目名称，不代表已经核实的现实企业。

## 环境与目录

本项目在 Windows 11 x64、Node.js 26 和 MySQL 8 上完成实际验证。Node.js 最低要求为 22.13。前端、后端分别保存自己的 `package.json` 和 `package-lock.json`，使用 `npm ci` 重现依赖。根目录只有 `frontend` 和 `backend`。

| 前端目录 | 职责 |
| --- | --- |
| `app/` | 首页、产品介绍、关于我们三条正式页面及页面元数据 |
| `components/` | 完整画布缩放、共享导航、板块、图像、产品弹窗 |
| `lib/` | 后端数据类型、页面请求和内容校验 |
| `e2e/` | 真实浏览器、故障状态、内容维护验收 |
| `scripts/` | Windows 后台启动与停止 |
| `reports/` | 实际测试报告、视口测量、审计、进程记录和日志 |
| `screenshots/` | 真实 Chromium 首屏、整页和交互截图 |

## 安装与配置

在前端目录执行：

```powershell
npm ci
```

默认内容服务为 `http://127.0.0.1:3101`。需要修改服务地址时，将 `.env.local.example` 复制为 `.env.local` 并设置 `BACKEND_ORIGIN`。该变量仅供 Next.js 服务端和同源重写使用。数据库地址、账号、密码只写在 `backend/.env` 中，不能写入前端环境文件。

后端地址影响媒体重写，变更后需要重新构建前端。前端默认端口为 3000，使用 Next.js 标准 `PORT` 环境变量或 `--port` 命令参数修改。浏览器始终通过前端同源 `/api` 和 `/media` 获取数据与图片。

## 开发与发布

先按照后端说明启动 Express，然后在前端目录执行：

```powershell
npm run dev
```

发布构建与前台启动：

```powershell
npm run lint
npm run typecheck
npm run build
npm start
```

## Windows 后台运行

前后端完成构建后，在前端目录运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-site.ps1
```

脚本从自身位置定位项目，从后端配置读取监听端口，实际验证数据库接口及网站响应后写入 `reports/runtime-services.json`。运行日志分别位于前后端的 `reports/runtime-output.log` 与 `reports/runtime-error.log`。已有端口被占用时脚本明确退出，不覆盖现有进程。

停止本项目已记录的后台进程：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\stop-site.ps1
```

停止脚本同时核验进程号和启动时间，防止进程号被其他程序重用。后台进程在关闭当前命令行后继续运行，当前方式不注册开机自动启动服务。机器重启后需重新运行启动脚本。

## 实际页面与交互

| 页面 | 路径 | 独立板块 |
| --- | --- | --- |
| 首页 | `/` | 12 |
| 产品介绍 | `/products` | 13 |
| 关于我们 | `/about` | 12 |

产品页含 9 类、每类 5 款，共 45 款不同的示例产品。点击产品打开同页说明，不生成新的产品页面。弹窗支持鼠标关闭、背景关闭、Enter 打开、Esc 关闭、Tab 焦点循环和关闭后焦点归还。未知地址重定向至首页。

页面采用 1440 像素统一设计画布，按实际浏览器可见宽度整体缩放。1920、1600、1440、1280、1024、768、390 和 320 像素宽度均使用同一版式，不切换列数，不通过禁止横向滚动掩盖问题。窄屏内容随完整画布同比缩小，这是已确认的交付要求。

图片为后端本地原创 PNG，全部具有中文说明。图片故障显示真实替代状态，内容接口失败显示错误说明与正常导航。全站支持减少动态效果设置。

## 浏览器检查

首次安装浏览器运行组件：

```powershell
npx playwright install chromium
```

运行正式前后端后执行：

```powershell
npm run test:e2e
```

浏览器报告保存为 `reports/browser-test-report.json`。维护测试在其他测试结束后执行，真实变更公司名、单产品文字和产品图片，核对实际显示后恢复原内容。测试期间不要让其他维护人员同时修改相同记录。

`reports/layout-home.json`、`reports/layout-products.json` 和 `reports/layout-about.json` 保存八种宽度的实际测量。`screenshots/` 包含三页首屏、整页、各宽度整页、320 像素弹窗、接口故障及维护验证截图。

交付总核验从后端运行 `npm run audit:delivery`，报告保存到前端 `reports/final-delivery-audit.json`。项目验收说明见 `DELIVERY.md`，内容维护和数据库初始化见后端 `README.md`。
