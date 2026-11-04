# AEVORIO 后端与内容管理

项目作者 NianBroken。项目使用 TypeScript、Express、Node.js、MySQL，管理界面使用 React、Vite 与 Ant Design。公司、产品与工程图片保留原有示例资料。

## 运行与目录

正式环境为 Windows 11 x64。Node.js、MySQL 使用设备级安装。三个应用的业务依赖分别通过自己的 package.json 和 package-lock.json 管理。

| 位置 | 职责 |
| --- | --- |
| ../shared | 前后台共用的内容类型、图标允许名单、字段规则基础 |
| database/default.sql | 完整数据库结构与空库初始示例 |
| src/repositories | 公开内容的一致性读取与字段转换 |
| src/services/resource-service.ts | 发布事务、版本冲突、引用、历史、恢复与结构约束 |
| src/services/resource-definitions.ts | 可编辑实体、列与表单规则的唯一允许名单 |
| src/services/media-service.ts | 位图校验、不可变文件、上传锁与安全清理 |
| src/middleware/admin-auth.ts | MySQL 会话、CSRF 与管理员检查 |
| src/routes/admin-routes.ts | 管理请求解析与统一响应 |
| src/runtime/supervisor.ts | 两个正式服务的无窗口守护与健康恢复 |
| 前端后台应用 | 后台界面已统一迁入 frontend/components/admin |
| storage/media | 当前与历史媒体文件 |
| storage/private | 会话密钥与管理员本机凭据，禁止提交 |
| storage/backups | 数据、结构、媒体与配置备份，禁止提交 |
| reports | 实际测试、资源清单、覆盖结果和运行记录 |

## 安装、迁移与构建

在项目根目录执行以下命令。已有依赖时直接执行检查和构建。

```powershell
npm --prefix backend ci
npm --prefix frontend ci
npm --prefix backend run db:init
npm --prefix backend run check
npm --prefix backend run lint
npm --prefix backend run build
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
```

backend/.env 保存实际连接配置。只填写 DB_HOST、DB_PORT、DB_USER、DB_PASSWORD、DB_NAME、BACKEND_HOST、BACKEND_PORT、FRONTEND_ORIGIN。内容管理员无法读取或修改数据库凭据。需要 HTTPS 时明确设置 FRONTEND_ORIGIN 为对应 HTTPS 地址，Cookie 的 Secure 随该协议启用。本机 HTTP 正式构建使用当前 HTTP 地址。

db:init 仅在空库导入 default.sql 中的示例数据。已有项目库只做检查，不备份、不重置账号或业务内容。db:migrate 单独执行相同兼容迁移，不重新导入示例。迁移记录保存在 schema_versions，重复执行保留现有 ID、内容、图片关系和历史。

首次空库初始化要求 storage/media 中已有随项目交付的原始媒体。media:generate 是示例素材生成工具，正式内容维护不执行该命令。

## 管理员创建与登录

```powershell
npm --prefix backend run admin:account -- administrator
npm --prefix backend run admin:account -- administrator --reset
```

首条命令创建管理员。第二条命令重置已存在管理员，并使其旧会话失效。工具生成随机临时密码，仅写入 storage/private/administrator-credentials.json，不在终端打印密码。该目录在 Windows 中只授权当前运行账户与 SYSTEM，子文件继承权限。首次登录必须设置 8 至 32 个 ASCII 可见字符的新密码，不允许空格。默认空库账号为 Nian，密码为 Nian123456，已有库初始化不会重置密码。

正式后台由 Express 提供 /admin/。单一管理员角色拥有内容维护、立即发布和历史恢复权限。用户名菜单可修改管理密码，退出会删除当前会话。会话保存在 MySQL，不使用生产内存会话。

## 内容维护

1. 在页面内容中按所属页面筛选板块，分别编辑标题、正文、要点、步骤、按钮、图片、图标和展示设置。
2. 在产品管理中维护类别、型号、短说明、详细说明、规格、特点、标签、主图和辅助图片。列表可搜索，规格与特点使用独立条目编辑与排序。
3. 在产品类别中修改名称、说明、图标和图片。类别名称会同时更新目录标题、索引与产品详情。创建类别会在产品页建立对应目录板块。
4. 在公共内容中维护公司名称、导航、页脚、Logo、公共图标、业务提示和主题颜色。项目名称 AEVORIO 与作者 NianBroken 属于固定项目身份。
5. 在页面与分享中维护三个页面的标题、搜索描述、分享标题、分享描述和分享图片。站点图标使用公共内容中的媒体引用。
6. 查看修改预览，点击保存并发布。保存成功后刷新真实前台即可读取新内容。离开未保存表单会出现确认，保存失败保留输入。

隐藏、删除和排序均立即影响公开网站。产品与板块使用可恢复删除。仍有关联产品的类别不能删除，每个公开页面必须保留至少十个有效板块。创建目录、移动类别和发布会在同一事务中检查引用。并发隐藏不同板块也不能突破数量约束。

## 图片与历史

普通图片接受 PNG、JPEG、WebP 静态位图，最大十五 MB，宽高各不超过 8192 像素，解码像素数不超过四千万。Sharp 校验真实内容并输出安全 PNG 与预览。禁止上传 SVG、HTML 和脚本。图标从 Lucide 允许名单或已校验位图选择。

在产品或板块表单中选择另一张图片，只改变当前引用。进入媒体资源后执行替换，会影响该媒体的全部当前引用，编辑区域会列出位置。替换前应核对这些位置。

文件名由系统生成，图片地址包含内容版本。旧图片保留，失败操作不改变当前引用。历史与恢复会显示字段差异，确认后生成新的当前版本。恢复某个产品的旧图片时，若共享图片已经改变，会建立独立历史引用，保留其他对象当前使用的图片。

安全清理只移除当前媒体、媒体版本和内容历史均不引用的文件。可恢复删除的图片文件仍受保护，不会被清理。启动时会回收上传暂存文件并核验历史媒体文件。

## 备份与整库恢复

```powershell
npm --prefix backend run site:backup
npm --prefix backend run db:migrate
```

备份保存实际表结构、所有行数据、媒体、后端私有配置、会话密钥和资源映射报告。工具会在隔离 MySQL 库逐表恢复，比较实际行内容并检查图片校验值，完成后删除测试库。报告保存在对应备份目录的 restore-verification.json。

整库恢复会替换当前数据库内容，应使用明确的备份目录和命令开关。

```powershell
& ./frontend/scripts/stop-site.ps1
npm --prefix backend run site:restore -- "完整备份目录" --restore
npm --prefix backend run db:migrate
& ./frontend/scripts/start-site.ps1
```

恢复工具要求项目服务已停止，先验证目标备份，再备份恢复前的当前状态。连接地址和数据库密码保留本机实际配置，历史会话全部失效。管理员密码恢复为备份中的哈希，无法登录时使用管理员重置命令。

## 接口与安全

公开接口为 GET /api/v1/site?page=home、products 或 about。所有业务 JSON 包含 Code、Messages、Data、RequestId、Timestamp，Messages 使用简体中文。

管理接口统一使用 /api/v1/admin/，分为 auth、overview、resources、media、revisions、coverage。资源类型与可编辑字段均由服务端允许名单决定。请求不能指定任意表名、SQL、路径或脚本。数据更新、历史与操作记录在同一事务提交。保存提交当前版本，不一致时返回 409，原内容不被覆盖。

所有管理数据执行服务端身份检查。写入验证会话、CSRF 和来源。登录限速，密码采用 Argon2id，Cookie 设置 HttpOnly、SameSite，登录更换会话标识。请求体、上传大小、图片解码和文件路径均有明确约束。公开响应包含发布业务内容，不包含管理员、密码、会话或操作记录。

布局算法、数据库凭据、认证与权限、程序接口、内部诊断和固定项目身份不开放编辑。资源清单说明字段所属表、列、页面、板块、管理入口和最近验收结果。

## 验证与报告

```powershell
npm --prefix backend test
npm --prefix backend run test:browser:prepare
npm --prefix frontend run test:e2e
npm --prefix backend run test:browser:cleanup
npm --prefix backend run verify:live
npm --prefix backend run coverage:report
npm --prefix backend run audit:delivery
```

后端集成测试复制真实数据到独立测试库和媒体目录。浏览器覆盖测试也使用隔离库、独立媒体与故障缓存，逐对象修改、数据库重读、检查真实 DOM、检查元信息、恢复历史并核对无关对象。正式界面联动测试执行可恢复的代表性修改，结束后恢复正式文字和展示设置。

资源报告分别统计可编辑字段与列表资源条目。最近验收结果绑定内容摘要，验收后改变的内容不会继续显示为同一份已验证快照。测试账户仅供本机验收，交付后移除，不向普通管理员提供固定测试密码。

## 运行故障定位

先运行 verify:live。数据库不可用时检查 MySQL 服务和 backend/.env；端口被占用时核对 runtime-services.json，使用停止脚本回收本项目进程。保存返回版本冲突时重新打开对象，比较新版本再保存。图片失败时查看媒体引用与文件校验，不手工覆盖历史文件。

每次正式启动会将上次日志保留到 reports/runtime-history，再建立当前运行日志。历史问题保留可追溯记录，当前 runtime-error.log 和 supervisor-error.log 用于判断本次运行状态。

实现参考使用英文官方资料：[Express Session](https://github.com/expressjs/session)、[Vite 正式构建](https://vite.dev/guide/build)、[Ant Design](https://ant.design/components/overview)、[Sharp](https://sharp.pixelplumbing.com/)。

## 固定端口与默认账号

端口统一定义在 ../shared/ports.json。正式前台使用 24681，后端接口使用 24682，后台页面使用前端端口 24681，隔离验证服务从 24683 开始分配。远程 MySQL 保留 192.168.168.31:3306。

从 frontend 目录执行 PowerShell 命令 ./scripts/start-site.ps1，启动脚本自动停止本项目旧守护进程，识别并终止目标端口占用进程，再启动两个正式服务。服务在隐藏守护进程中持续运行。执行 ./scripts/stop-site.ps1 才会主动停止。

唯一默认数据库文件为 database/default.sql。从 backend 目录执行 npm run db:init，仅在空库时导入，已有项目库只检查，不重置密码。默认账号 Nian，默认密码 Nian123456，首次登录必须设置 8 至 32 个 ASCII 可见字符的新密码。空格、控制字符和非 ASCII 字符不接受。

首次登录浏览器验收脚本为 frontend/scripts/verify-first-login.mjs，应从 frontend 目录执行。该脚本仅适用于首次初始化的验收环境，会实际修改管理员密码，不属于常规启动步骤。
