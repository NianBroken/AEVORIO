# AEVORIO 后端

项目作者为 NianBroken。TypeScript 与 Express 服务独立负责真实 MySQL 页面内容、产品和本地 PNG 媒体。前端无需数据库驱动或数据库配置。当前企业与硬件均为可维护示例，不代表已核实的公司、商业产品或认证。

## 环境与结构

本项目在 Windows 11 x64、Node.js 26 和 MySQL 8 完成实际验证。Node.js 最低要求为 22.13。数据库使用 `utf8mb4` 与 `utf8mb4_0900_ai_ci`，需要 MySQL 8。

| 目录 | 职责 |
| --- | --- |
| `src/config/` | 环境配置校验 |
| `src/database/` | 唯一 MySQL 连接池及关闭 |
| `src/repositories/` | 数据查询与字段转换 |
| `src/services/` | 业务完整性检查与安全错误说明 |
| `src/routes/` | 唯一页面接口和请求参数校验 |
| `src/utils/` | 统一业务响应 |
| `database/schema.sql` | 唯一结构和初始化示例数据 |
| `storage/media/` | 45 张产品 PNG 和 7 张工程 PNG |
| `scripts/` | 数据库预检初始化、位图生成、内容维护、真实接口验收、交付审计 |
| `tests/` | 接口单元测试 |
| `reports/` | 单元测试、实际接口验收、依赖审计与运行日志 |

## 安装和初始化

在后端目录执行：

```powershell
npm ci
```

将 `.env.example` 复制为 `.env`，填写实际数据库连接。真实密码只保存在本机 `backend/.env`，该文件已在 `.gitignore` 中排除。样例配置不包含实际数据库地址或实际密码。服务从启动工作目录读取自己的 `.env`，正常命令均须在后端目录执行。

交付中已包含完整媒体，不需要再次生成。仅在首次制作空白环境的原始示例素材时运行 `npm run media:generate`。此命令按当前生成器重写原始示例 PNG，不应用来覆盖已经维护过的生产图片。

实际初始化和校验：

```powershell
npm run db:init
```

初始化会先检查目标数据库。发现无关表、已有非本项目内容或结构不一致时拒绝继续，不执行删除或覆盖。空库导入 `database/schema.sql`，再根据真实本地 PNG 写入尺寸、字节数和 SHA-256。已初始化的本项目数据库只做完整性校验，不重置维护过的文字与图片。

## 构建与运行

```powershell
npm run lint
npm run check
npm test
npm run build
npm start
```

正式入口为 `dist/src/server.js`。发布构建只输出 `src` 服务代码，维护和测试脚本通过项目内 TypeScript 运行组件执行。开发模式使用 `npm run dev`。

后端默认监听 `127.0.0.1:3101`，启动前会真实获取数据库连接。网站后台启动和停止脚本位于 `../frontend/scripts/`，详见前端 README。修改 `BACKEND_PORT` 后也要更新前端 `BACKEND_ORIGIN` 并重新构建前端。

## 业务接口

唯一页面业务接口：

```text
GET /api/v1/site?page=home
GET /api/v1/site?page=products
GET /api/v1/site?page=about
```

三个请求使用同一个接口，仅允许一个有效的 `page` 参数。重复、缺失、数组、嵌套和无关参数均返回 400。其他 HTTP 方法返回 405，未知接口返回 404。`/health` 是独立的进程探测地址，不表示数据库业务数据读取成功。

所有 JSON 业务响应包含完全相同的字段：

```json
{
  "Code": 0,
  "Messages": "已成功读取当前页面的数据库内容及本地媒体引用。",
  "Data": {},
  "RequestId": "请求唯一标识",
  "Timestamp": "ISO 8601 时间"
}
```

| 业务码 | 含义 |
| --- | --- |
| `0` | 成功 |
| `1001` | 参数不合法 |
| `1002` | 资源不存在 |
| `1003` | 请求方法不支持 |
| `2001` | 数据库读取失败 |
| `2002` | 初始化内容不完整 |
| `9000` | 未预期的业务处理失败 |

失败响应中 `Data` 为 `null`，`Messages` 为具体的简体中文说明。内部数据库错误及连接凭据不返回前端。

## 本地媒体

媒体通过 `/media/文件名.png` 输出，不使用外部 OSS。路径穿越、点文件、目录索引和无效图片路径不可读取。数据库记录稳定资源键、中文说明、尺寸、路径与 SHA-256。

图片使用 `max-age=0, must-revalidate` 和 ETag。替换后同一 URL 在浏览器重新请求时会校验新内容，不继续显示一小时旧缓存。

## 修改公司名称

```powershell
npm run content:manage -- company '企业名称示例'
```

名称由 `site_settings` 中的 `company_name` 单独维护。项目名称 AEVORIO 和作者 NianBroken 分别保存在独立配置中，不能把项目名称直接当成真实企业名称。页面正文中的示例文字可单独修改为经确认的公司资料。

## 修改产品说明

```powershell
npm run content:manage -- product origin-compute '填写不少于八个字符的独立产品说明。'
```

脚本使用稳定的产品 slug 和参数化 SQL，只更新目标示例产品说明，其他产品不受影响。名称、短句、特性、接口信息分别保存在 `products` 表对应字段中，后端接口与同页弹窗直接读取。

## 替换图片

```powershell
npm run content:manage -- image product-origin-compute 'D:\素材\新产品图.png'
```

工程图片也使用同一命令，例如资源键 `home-hero`。脚本接受 PNG、JPEG、WebP 静态图，文件不超过 15 MB，宽高分别在 200 至 5120 像素。图片按原资源尺寸等比容纳，规范为 PNG，维持文件地址，更新数据库大小和 SHA-256。

替换前检查旧文件与数据库哈希一致；检查新图片不与其他资源完全重复；用数据库事务和本地副本协调替换。发生数据库失败会恢复原图。临时副本位于不可公开访问的 `storage/.staging/`，完成后清理。

## 修改公司介绍和页面内容

使用已有 MySQL 管理工具编辑 `page_sections`。通过 `section_key` 查找目标板块，例如 `A02-intro`；标题、短句、正文、列表分别位于 `title`、`subtitle`、`description`、`content_json`。修改前备份目标行，在事务中提交，只更改需要维护的字段。

`content_json` 的 `points`、`steps` 等列表结构保持为字符串数组。`pages` 保存独立 SEO 标题和描述，`product_categories` 保存分类文字，`media_assets.alt_text` 保存图片中文说明。保存后刷新网页即可读取新内容，无需增加管理网页或第四个内容页。

SQL 文件是新环境的初始化来源。需要让后续新安装也使用更新内容时，同步修改 `database/schema.sql` 的对应示例数据；不要对已投入使用的数据库重新手动导入整个种子文件。

## 验收命令与报告

```powershell
npm run lint
npm run check
npm test
npm run verify:live
npm run build
npm run audit:delivery
npm audit
```

`verify:live` 使用真实 MySQL 和临时 HTTP 服务验证三页、统一响应、非法参数、随机组合、52 张位图、文字与图片维护及故障隐私。测试会还原临时改动，执行期间不要并发维护相同产品。

`audit:delivery` 要求正式前后端均已运行，会验证根目录、数据库数量、产品唯一性、52 张媒体哈希、三页 HTTP、前端资源和报告中的真实配置隔离，以及空错误日志。报告位于 `../frontend/reports/final-delivery-audit.json`。

单元测试报告为 `reports/backend-unit-test-report.json`，真实接口报告为 `reports/backend-integration-report.json`，依赖审计结果为 `reports/dependency-audit.json`。浏览器测试及截图由前端独立保存。
