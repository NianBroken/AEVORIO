# AEVORIO 前台与本机交付

项目作者 NianBroken。前台使用 TypeScript、Next.js 和 React。三个公开内容页面为首页 /、产品页 /products、关于我们 /about。产品详情在当前页面弹窗中展示，不创建产品独立页面。

## 页面与内容

公开页面从 Express 动态读取 MySQL 中的已发布内容。导航、按钮、公共提示、图标、Logo、站点图标、SEO、分享信息、主题颜色、板块正文、产品规格与图片使用管理系统中的唯一数据来源。

原有首页十二个、产品页十三个、关于我们十二个板块保留各自结构。板块数量可维护，发布约束是每页至少十个有效板块。产品与类别数量从实际记录计算，产品仍使用五列矩阵。

图片来自项目内部媒体目录，地址包含文件内容版本。前台不保存数据库连接信息。内容服务故障时显示明确故障界面，公共提示使用最近一次成功发布的配置；首次启动尚无成功记录时使用技术故障初始文案。

全局内容直接在 /admin/global/settings 按用途分组编辑，每组独立保存并立即发布。保存一组保留其他组的输入。页脚署名允许留空，旧全局资源地址进入对应分组。字段分组集中定义在 shared/global-settings.ts，普通资源和全局表单共用字段控件与上传流程。全局设置各分组直接连续展示，读取失败时可重新读取。后台页面、区域和操作按钮统一使用公共加载组件。图标、字体、装饰、板块样式和图片展示选项在下拉菜单中显示实际效果，当前选中值同步显示预览。修改比较展示当前实际媒体。

## 正式构建

在项目根目录执行：

```powershell
npm --prefix frontend ci
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
```

构建使用 Next.js 官方支持的 Webpack 模式，兼容设备级依赖目录通过目录链接提供给项目的安装方式。

全部应用正式构建完成后，使用启停脚本运行。前台及后台均由 Next.js 在 24681 提供，Express 在 24682 仅提供业务接口与媒体文件服务。

```powershell
& ./frontend/scripts/start-site.ps1
& ./frontend/scripts/stop-site.ps1
```

脚本从自身位置定位项目，通过 PATH 定位 Node.js，读取 backend/.env 的实际地址与端口，检查发布文件和端口占用，然后启动无窗口守护进程。运行信息保存在 frontend/reports/runtime-services.json。

前端监听局域网连接，启动时从已连接且具有默认网关的物理网卡识别访问地址，排除 VPN 与虚拟网卡。首次配置入站规则需要管理员 PowerShell，规则仅开放前端端口给本地子网。Express 和 MySQL 保持本机访问，后台请求来源仍经过允许名单和会话令牌校验。

守护进程顺序启动 Express 和 Next.js，实际请求成功后报告运行。进程退出后自动恢复，连续健康检查失败也会触发恢复。停止脚本同时检查项目进程记录与随机操作标识，守护进程确认后停止两个服务。系统账户运行的进程同样支持正常停止，不操作其他项目进程。

## 机器启动

管理员终端执行以下命令注册设备启动任务：

```powershell
& ./frontend/scripts/install-autostart.ps1
```

任务以 SYSTEM 运行，机器启动后三十秒调用本项目启动脚本。任务名由项目绝对路径计算，避免不同项目互相覆盖。更换项目路径后重新注册，对旧路径的任务在 Windows 任务计划程序中删除。

verify-autostart.ps1 用于实际启动验收。执行前停止当前项目，再由管理员终端运行该脚本。它会通过任务启动守护进程，并逐一访问三个公开页面和后台，结果保存为 autostart-verification.json。交付验证不重启整台电脑。

## 画布与交互

前台与后台共用 lib/use-scaled-canvas.ts，采用 1440 像素逻辑画布，按实际可用宽度整体缩放。内容真实高度由观察器计算。窄窗口保留横向布局与五列产品矩阵，横向边界通过实际测量验证。

弹窗在同一逻辑画布内定位，后台确认弹窗使用当前滚动位置和可见高度。产品弹窗支持 Escape、Tab、Shift+Tab、焦点返回和遮罩关闭。文字正常换行，产品卡片不使用省略号裁切。超出表单允许长度时由输入限制和服务端校验提示。

## 浏览器验收

```powershell
npm --prefix backend run test:browser:prepare
npm --prefix frontend run test:e2e
npm --prefix backend run test:browser:cleanup
```

准备命令生成独立临时管理员，凭据仅写入后端受限目录。清理命令撤销该账户和会话，删除临时凭据，将中断验收留下的指定临时对象移入可恢复记录。正式管理员不受影响。

测试按公开网站、后台界面、命令行维护、逐字段覆盖的依赖顺序执行。互相独立的公开页面检查并发运行，涉及保存和恢复的操作顺序执行。全部写入测试在结束时恢复，字段覆盖使用隔离数据库、媒体和故障配置缓存。

| 证据 | 内容 |
| --- | --- |
| reports/browser-test-report.json | 浏览器完整运行结果 |
| reports/admin-browser-report.json | 真实后台发布、前台显示、图标、展示设置、上传 |
| reports/resource-dom-coverage.json | 全部可编辑字段的数据库重读、DOM 或元信息及恢复结果 |
| reports/browser-maintenance-report.json | 本机维护工具、图片像素、版本地址和恢复 |
| reports/visual-options-chromium.json、visual-options-firefox.json、visual-options-webkit.json | 视觉选项菜单、实际图片与九种尺寸的横向边界 |
| reports/global-settings-verification.json | 分组保存、草稿保护、署名清空、冲突与上传 |
| reports/admin-*-compatibility.json | 三种浏览器的全局表单、选择菜单和弹窗，Chromium 包含双指缩放 |
| reports/layout-chromium.json、layout-firefox.json、layout-webkit.json | 三页连续改变尺寸与独立像素密度检查 |
| reports/native-browser-zoom.json | 浏览器原生缩放下的三页与已登录全局表单 |
| reports/pinch-zoom.json | 移动设备仿真中的可见视口缩放与画布边界 |
| reports/layout-home.json | 首页八种尺寸测量 |
| reports/layout-products.json | 产品页八种尺寸、五列矩阵与边界 |
| reports/layout-about.json | 关于我们八种尺寸测量 |
| reports/autostart-verification.json | 设备启动任务实际运行证据 |
| screenshots/baseline | 修改前的三页首屏与整页基准截图 |
| screenshots | 正式页面、后台与八种尺寸真实截图 |

验收尺寸为 1920×1080、1600×900、1440×900、1280×800、1024×768、768×1024、390×844、320×700。最终数量与通过结果以交付报告和当前运行记录为准。

兼容性检查还覆盖 2560 宽度、低高度窗口及 50%、80%、100%、125%、150%、200% 原生浏览器缩放。窗口尺寸、像素密度与双指缩放分别记录。移动设备仿真不代表真实手机验收。独立启动多个测试运行器时应分别指定 `--output` 目录，避免清理彼此的运行文件。

后台登录、内容发布、图片替换、数据库迁移与整站备份恢复的操作说明见 backend/README.md。
