import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createApp } from '../src/app';
import { readEnvironment } from '../src/config/env';
import { closeDatabasePool, createDatabasePool } from '../src/database/pool';
import type { ApiEnvelope, PageSlug, SitePayload } from '../src/types/site';
import { replaceMediaImage, updateCompanyName, updateProductDescription } from './maintain-content';

// 页面数量、类别数量与完整媒体覆盖范围必须与建库验收保持一致。
const EXPECTED_SECTION_COUNTS: Record<PageSlug, number> = { home: 12, products: 13, about: 12 };
const EXPECTED_PRODUCTS = 45;
const EXPECTED_CATEGORIES = 9;
const EXPECTED_MEDIA = 52;
const DATABASE_FAILURE_TOKEN = 'private database details must not appear in public responses';

interface CheckResult {
  name: string;
  passed: boolean;
  details?: string;
}

interface ParsedResponse<T = unknown> {
  response: Response;
  body: ApiEnvelope<T>;
}

const backendDirectory = path.resolve(__dirname, '..');
const reportsDirectory = path.join(backendDirectory, 'reports');
const checks: CheckResult[] = [];

async function main(): Promise<void> {
  const environment = readEnvironment();
  const database = createDatabasePool(environment);
  const healthConnection = await database.getConnection();
  healthConnection.release();

  const server = createServer(createApp({ database }));
  let reportWritten = false;

  try {
    const baseUrl = await listenOnEphemeralPort(server);
    await verifyPageData(baseUrl);
    await verifyQueryErrors(baseUrl);
    await verifyLocalImages(baseUrl);
    await verifyContentMaintenance(baseUrl, database);
    await verifyDatabaseFailurePrivacy();
    await saveReport({ generatedAt: new Date().toISOString(), checks });
    reportWritten = true;
    console.log(`真实 Express 与 MySQL 联合验收通过：${checks.length} 项核验，覆盖页面、52 张图片、统一错误格式和一百组输入。`);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'HTTP 集成测试遇到未知错误。';
    checks.push({ name: '整体运行', passed: false, details: reason });
    await saveReport({ generatedAt: new Date().toISOString(), checks });
    reportWritten = true;
    console.error(`真实后端集成测试失败：${reason}`);
    process.exitCode = 1;
  } finally {
    if (!reportWritten) {
      await saveReport({ generatedAt: new Date().toISOString(), checks });
    }
    if (server.listening) {
      await closeServer(server);
    }
    await closeDatabasePool();
  }
}

async function verifyPageData(baseUrl: string): Promise<void> {
  for (const slug of ['home', 'products', 'about'] as const) {
    const result = await readJson<SitePayload>(`${baseUrl}/api/v1/site?page=${slug}`);
    assert(result.response.status === 200, `${slug} 页面接口返回 HTTP 200。`);
    assertEnvelope(result.body, 0);
    assert(result.body.Data?.page.slug === slug, `${slug} 页面返回正确的正式路由标识。`);
    assert(result.body.Data?.page.sections.length === EXPECTED_SECTION_COUNTS[slug], `${slug} 页面包含规定的全部独立板块。`);
    assert(result.body.Messages.includes(result.body.Data?.page.title ?? ''), `${slug} 成功响应的 Messages 与实际返回内容一致。`);
  }

  const productPage = (await readJson<SitePayload>(`${baseUrl}/api/v1/site?page=products`)).body.Data;
  assert(Boolean(productPage), '产品页返回了有效的数据库内容。');
  assert(productPage?.categories.length === EXPECTED_CATEGORIES, '数据库读取到九个稳定排序的产品类别。');
  assert(productPage?.products.length === EXPECTED_PRODUCTS, '数据库读取到四十五个独立示例产品。');
  assert(productPage?.products.every((product) => product.isDemo), '四十五款产品都带有示例内容标记。');
  assert(new Set(productPage?.products.map((product) => product.slug)).size === EXPECTED_PRODUCTS, '全部产品 slug 唯一。');
  assert(new Set(productPage?.products.map((product) => product.media.sha256)).size === EXPECTED_PRODUCTS, '四十五张产品主图的真实文件哈希各不相同。');
  assert(new Set(productPage?.products.map((product) => product.categorySlug)).size === EXPECTED_CATEGORIES, '九类产品在数据库查询中均能读取。');
  assert(typeof productPage?.settings.companyName === 'string' && productPage.settings.companyName.length >= 2,
    '网站显示独立保存、可维护的公司名称。');

  const aboutPage = (await readJson<SitePayload>(`${baseUrl}/api/v1/site?page=about`)).body.Data;
  assert(aboutPage?.settings.projectName === 'AEVORIO', '项目名称保存在独立的后端配置中。');
  assert(aboutPage?.settings.author === 'NianBroken', '作者信息准确返回。');
  record('检查网站页面响应、数据边界和示例标记', true);
}

async function verifyQueryErrors(baseUrl: string): Promise<void> {
  const fixedErrors = [
    { name: '缺少参数', url: `${baseUrl}/api/v1/site`, status: 400, code: 1001 },
    { name: '空页面参数', url: `${baseUrl}/api/v1/site?page=`, status: 400, code: 1001 },
    { name: '不支持的页面标识', url: `${baseUrl}/api/v1/site?page=home%20extra`, status: 400, code: 1001 },
    { name: '重复页面参数', url: `${baseUrl}/api/v1/site?page=home&page=about`, status: 400, code: 1001 },
    { name: '非白名单查询参数', url: `${baseUrl}/api/v1/site?page=home&limit=15`, status: 400, code: 1001 },
    { name: '未知接口路径', url: `${baseUrl}/api/v1/no-such-interface`, status: 404, code: 1002 },
    { name: '未支持的 POST 方法', url: `${baseUrl}/api/v1/site`, status: 405, code: 1003, method: 'POST' as const },
    { name: '媒体文件不存在', url: `${baseUrl}/media/absent-image.png`, status: 404, code: 1002 },
  ];

  for (const expected of fixedErrors) {
    const response = await fetch(expected.url, expected.method ? { method: expected.method } : {});
    const result = await parseJsonResponse(response);
    assert(response.status === expected.status, `${expected.name} 使用正确 HTTP 状态码。`);
    assertEnvelope(result.body, expected.code);
  }

  for (const method of ['PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']) {
    const response = await fetch(`${baseUrl}/api/v1/site?page=home`, { method });
    assert(response.status === 405 && response.headers.get('allow') === 'GET', '全部不支持的方法返回明确的 GET 方法限制。');
    if (method !== 'HEAD') assertEnvelope((await parseJsonResponse(response)).body, 1003);
    else assert((await response.text()) === '', 'HEAD 按 HTTP 规范只返回响应头。');
  }

  const traversalResponse = await fetch(`${baseUrl}/media/%2e%2e%2f..%2f.env`);
  assert(traversalResponse.status >= 400 && traversalResponse.status < 500, '图片路径穿越请求不会读取项目目录或环境文件。');

  let seed = 0x39a4d17b;
  const invalidRequests = Array.from({ length: 100 }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const size = 1 + seed % 46;
    const page = Array.from({ length: size }, () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return String.fromCharCode(33 + seed % 89);
    }).join('');
    const params = new URLSearchParams({ page });
    return fetch(`${baseUrl}/api/v1/site?${params.toString()}`);
  });

  const randomResponses = await Promise.all(invalidRequests);
  for (const response of randomResponses) {
    const result = await parseJsonResponse(response);
    assert(response.status === 400, '随机非法页面参数返回 HTTP 400。');
    assertEnvelope(result.body, 1001);
  }

  const requestIds = new Set(randomResponses.map((response) => response.headers.get('x-request-id')));
  assert(requestIds.size === 100 && !requestIds.has(null), '一百组并发请求全部有独立的服务端追踪标识。');
  record('检查八类线上错误和一百组随机非法参数', true);
}

async function verifyLocalImages(baseUrl: string): Promise<void> {
  const [home, products, about] = await Promise.all([
    readJson<SitePayload>(`${baseUrl}/api/v1/site?page=home`),
    readJson<SitePayload>(`${baseUrl}/api/v1/site?page=products`),
    readJson<SitePayload>(`${baseUrl}/api/v1/site?page=about`),
  ]);

  const media = new Map<string, { sha256: string; altText: string }>();
  for (const section of [home.body.Data, products.body.Data, about.body.Data]) {
    for (const entry of section?.page.sections ?? []) {
      if (entry.media) media.set(entry.media.url, { sha256: entry.media.sha256, altText: entry.media.altText });
    }
  }
  for (const product of products.body.Data?.products ?? []) {
    media.set(product.media.url, { sha256: product.media.sha256, altText: product.media.altText });
  }

  assert(media.size === EXPECTED_MEDIA, '三个页面与产品目录引用全部五十二张独立图片。');
  await Promise.all([...media.entries()].map(async ([url, metadata]) => {
    const response = await fetch(new URL(url, baseUrl));
    assert(response.status === 200, '所有实际引用的本地图像地址均可访问。');
    assert(response.headers.get('content-type')?.includes('image/png') === true, '图片服务返回 PNG 文件。');
    assert(response.headers.get('cache-control')?.includes('must-revalidate') === true, '替换后的图像使用可重新验证的缓存。');
    const contents = Buffer.from(await response.arrayBuffer());
    assert(contents.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), '浏览器读取到有效 PNG 文件头。');
    assert(createHash('sha256').update(contents).digest('hex') === metadata.sha256, '数据库哈希与 HTTP 返回的实际图片二进制完全一致。');
    assert(metadata.altText.length > 8, '图片的数据库替代文字可供辅助技术读取。');
  }));

  record('验证五十二张真实位图的 HTTP 响应、格式、尺寸与数据库 SHA-256', true);
}

async function verifyContentMaintenance(baseUrl: string, database: ReturnType<typeof createDatabasePool>): Promise<void> {
  const original = (await readJson<SitePayload>(`${baseUrl}/api/v1/site?page=products`)).body.Data;
  const firstProduct = original?.products[0];
  const secondProduct = original?.products[1];
  assert(Boolean(firstProduct), '维护验收使用真实的第一个数据库产品。');
  assert(Boolean(secondProduct), '维护验收能够比较其他独立产品的数据。');
  const originalCompany = original?.settings.companyName ?? '企业名称（示例）';
  const originalDescription = firstProduct?.description ?? '';
  const verificationCompany = '企业名称（临时验证）';
  const verificationDescription = '临时维护测试仅用于验证单个产品更新并能完整恢复。';

  try {
    await updateCompanyName(database, verificationCompany);
    const companyAfter = (await readJson<SitePayload>(`${baseUrl}/api/v1/site?page=home`)).body.Data;
    assert(companyAfter?.settings.companyName === verificationCompany, '更新公司名称后实时 HTTP 页面读取到新值。');
  } finally {
    await updateCompanyName(database, originalCompany);
  }

  try {
    await updateProductDescription(database, firstProduct?.slug ?? '', verificationDescription);
    const updatedProducts = (await readJson<SitePayload>(`${baseUrl}/api/v1/site?page=products`)).body.Data;
    assert(updatedProducts?.products[0]?.description === verificationDescription, '更新产品说明后立即可从真实接口读取新文字。');
    assert(updatedProducts?.products[1]?.description === secondProduct?.description, '只改动目标产品文字，邻近产品保持原样。');
  } finally {
    await updateProductDescription(database, firstProduct?.slug ?? '', originalDescription);
  }

  const safeName = firstProduct?.media.fileName;
  assert(typeof safeName === 'string' && path.basename(safeName) === safeName, '实际替换前验证资源文件名只指向后端本地媒体文件。');
  const productMediaPath = path.resolve(backendDirectory, 'storage/media', safeName);
  const originalBytes = await readFile(productMediaPath);
  const originalImagePath = path.join(await mkdtemp(path.join(os.tmpdir(), 'aevorio-image-restore-')), 'original.png');
  const testImagePath = path.join(path.dirname(originalImagePath), 'replacement.png');
  const resourceKey = firstProduct?.media.id.replace(/^media-/u, 'product-') ?? '';
  let changedImage = false;

  try {
    await writeFile(originalImagePath, originalBytes, { flag: 'wx' });
    const replacement = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="920" height="680" viewBox="0 0 920 680"><rect width="920" height="680" fill="#edf1ed"/><rect x="160" y="142" width="600" height="395" rx="28" fill="#315c48" stroke="#c8aa7e" stroke-width="10"/><rect x="355" y="245" width="210" height="160" rx="14" fill="#3c4641" stroke="#bca87d" stroke-width="8"/><path d="M200 215h130v60m410 30h-120v70M235 467h105v-48h55M688 445H580v-30" fill="none" stroke="#d9aa76" stroke-width="8"/></svg>`);
    await sharp(replacement).png().toFile(testImagePath);

    const beforeMediaResponse = await fetch(new URL(firstProduct?.media.url ?? '', baseUrl));
    const beforeEntityTag = beforeMediaResponse.headers.get('etag');
    assert(beforeMediaResponse.status === 200 && beforeEntityTag !== null, '替换测试读取原图并取得可重新验证的 HTTP 实体标签。');
    await beforeMediaResponse.body?.cancel();

    await replaceMediaImage(database, resourceKey, testImagePath);
    changedImage = true;
    const updatedPage = (await readJson<SitePayload>(`${baseUrl}/api/v1/site?page=products`)).body.Data;
    const replacedProduct = updatedPage?.products.find((product) => product.slug === firstProduct?.slug);
    assert(replacedProduct?.media.sha256 !== firstProduct?.media.sha256, '图片替换后数据库 SHA-256 更新。');
    assert(replacedProduct?.media.fileName === firstProduct?.media.fileName, '图片路径稳定，原来的页面资源地址依然有效。');

    const refreshedImageResponse = await fetch(new URL(replacedProduct?.media.url ?? '', baseUrl));
    const refreshedBytes = Buffer.from(await refreshedImageResponse.arrayBuffer());
    assert(refreshedImageResponse.status === 200, '替换后的原资源 URL 立即返回新的有效图像。');
    assert(refreshedImageResponse.headers.get('etag') !== beforeEntityTag, '浏览器能够识别替换图片的实际内容变化。');
    assert(createHash('sha256').update(refreshedBytes).digest('hex') === replacedProduct?.media.sha256, 'HTTP 新图片内容与数据库更新哈希一致。');
  } finally {
    if (changedImage) await replaceMediaImage(database, resourceKey, originalImagePath);
    await rm(path.dirname(originalImagePath), { force: true, recursive: true });
  }

  const restored = (await readJson<SitePayload>(`${baseUrl}/api/v1/site?page=products`)).body.Data;
  assert(restored?.products[0]?.description === originalDescription, '还原测试文字后初始产品说明保持原样。');
  assert(restored?.settings.companyName === originalCompany, '还原测试企业名称后初始公司配置保持原样。');
  assert(Boolean(restored?.products[0]?.media.sha256), '还原产品原图后恢复实际图片数据与数据库对应关系。');
  record('验证公司名称编辑、单产品编辑、图片换入及原内容恢复', true);
}

async function verifyDatabaseFailurePrivacy(): Promise<void> {
  const server = createServer(createApp({
    repository: {
      async getSite(): Promise<never> {
        throw new Error(DATABASE_FAILURE_TOKEN);
      },
    },
  }));
  const baseUrl = await listenOnEphemeralPort(server);

  try {
    const result = await readJson(`${baseUrl}/api/v1/site?page=home`);
    assert(result.response.status === 500, '数据库故障通过 HTTP 500 显示实际失败状态。');
    assertEnvelope(result.body, 2001);
    assert(!result.body.Messages.includes(DATABASE_FAILURE_TOKEN), '真实内部故障信息未出现在外部页面响应。');
    record('验证 MySQL 故障分支和敏感信息隔离', true);
  } finally {
    await closeServer(server);
  }
}

async function readJson<T = unknown>(url: string): Promise<ParsedResponse<T>> {
  const response = await fetch(url);
  return parseJsonResponse<T>(response);
}

async function parseJsonResponse<T = unknown>(response: Response): Promise<ParsedResponse<T>> {
  const body: unknown = await response.json();
  assert(body !== null && typeof body === 'object', 'HTTP 业务响应返回了 JSON 对象。');
  return { response, body: body as ApiEnvelope<T> };
}

function assertEnvelope<T>(envelope: ApiEnvelope<T>, expectedCode: number): void {
  assert(envelope.Code === expectedCode, '统一 JSON 业务码与请求结果一致。');
  assert(typeof envelope.Messages === 'string' && envelope.Messages.length >= 15, '统一 Messages 内容具有实际简体中文说明。');
  assert(/[\u4e00-\u9fff]/u.test(envelope.Messages), '统一 Messages 字段中的服务说明为简体中文。');
  if (expectedCode !== 0) assert(envelope.Data === null, '失败响应中的 Data 使用一致的空值结构。');
  assert(typeof envelope.RequestId === 'string' && /^[0-9a-f-]{36}$/iu.test(envelope.RequestId), '响应包含有效的请求标识。');
  assert(typeof envelope.Timestamp === 'string' && !Number.isNaN(Date.parse(envelope.Timestamp)), '响应包含有效的 ISO 8601 时间戳。');
}

function assert(condition: boolean, description: string): asserts condition {
  if (!condition) throw new Error(`验收失败：${description}`);
}

function record(name: string, passed: boolean, details?: string): void {
  checks.push({ name, passed, ...(details ? { details } : {}) });
}

function listenOnEphemeralPort(server: Server): Promise<string> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      const address = server.address() as AddressInfo;
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function saveReport(report: { generatedAt: string; checks: CheckResult[] }): Promise<void> {
  await mkdir(reportsDirectory, { recursive: true });
  await writeFile(
    path.join(reportsDirectory, 'backend-integration-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );
}

main().catch((error: unknown) => {
  const reason = error instanceof Error ? error.message : '集成测试遇到未知错误。';
  console.error(`AEVORIO HTTP 接口验证未完成：${reason}`);
  void closeDatabasePool();
  process.exitCode = 1;
});
