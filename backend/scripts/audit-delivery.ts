import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readEnvironment } from '../src/config/env';
import { closeDatabasePool, createDatabasePool } from '../src/database/pool';
import { MysqlSiteRepository } from '../src/repositories/site-repository';
import type { PageSlug } from '../src/types/site';

const backendDirectory = path.resolve(__dirname, '..');
const projectDirectory = path.resolve(backendDirectory, '..');
const frontendDirectory = path.join(projectDirectory, 'frontend');
const expectedSections: Record<PageSlug, number> = { home: 12, products: 13, about: 12 };

// 交付审计读取真实运行内容和文件，报告只保留结果，不输出配置值或密码。
async function main(): Promise<void> {
  const environment = readEnvironment();
  const database = createDatabasePool(environment);
  const repository = new MysqlSiteRepository(database);
  const roots = await readdir(projectDirectory, { withFileTypes: true });
  assert(roots.length === 2 && roots.every((entry) => entry.isDirectory() && ['frontend', 'backend'].includes(entry.name)),
    '项目根目录只能包含 frontend 和 backend 两个文件夹。');

  try {
    const media = new Map<string, { fileName: string; sha256: string }>();
    const sectionTitles = new Set<string>();
    const pageResults = [];
    let catalog = null;

    for (const [slug, count] of Object.entries(expectedSections)) {
      const payload = await repository.getSite(slug as PageSlug);
      assert(payload !== null && payload.page.sections.length === count, '数据库板块数量没有达到正式需求。');
      for (const section of payload.page.sections) {
        assert(!sectionTitles.has(section.title), '数据库存在重复的板块标题。');
        sectionTitles.add(section.title);
        if (section.media) media.set(section.media.id, section.media);
      }
      if (slug === 'products') catalog = payload;
      const route = slug === 'home' ? '/' : `/${slug}`;
      const frontendOrigin = process.env.AEVORIO_FRONTEND_ORIGIN ?? environment.FRONTEND_ORIGIN;
      const response = await fetch(new URL(route, frontendOrigin));
      assert(response.status === 200, '正式网站没有正常返回对应页面。');
      const document = await response.text();
      assert(document.includes(`data-page="${slug}"`) && document.includes(payload.page.sections[0]?.title ?? ''),
        '正式网站没有显示真实数据库页面内容。');
      pageResults.push({ slug, sections: count, httpStatus: response.status });
    }

    assert(catalog !== null && catalog.products.length === 45 && catalog.categories.length === 9, '产品规模不符合要求。');
    assert(new Set(catalog.products.map((product) => product.name)).size === 45, '存在重复产品名称。');
    assert(new Set(catalog.products.map((product) => product.description)).size === 45, '存在重复产品说明。');
    assert(new Set(catalog.products.map((product) => product.media.sha256)).size === 45, '存在重复产品图片。');
    const categoryResults = catalog.categories.map((category) => ({
      name: category.name,
      slug: category.slug,
      products: catalog.products.filter((product) => product.categorySlug === category.slug).length,
    }));
    assert(categoryResults.every((category) => category.products === 5), '每个分类必须有五个产品。');
    for (const product of catalog.products) media.set(product.media.id, product.media);
    assert(media.size === 52, '数据库媒体资源总数须为五十二。');
    for (const asset of media.values()) {
      const bytes = await readFile(path.join(backendDirectory, 'storage/media', path.basename(asset.fileName)));
      assert(createHash('sha256').update(bytes).digest('hex') === asset.sha256, '本地图片与数据库哈希不符。');
    }

    const publicFiles = await collectFiles(path.join(frontendDirectory, '.next/static'));
    const sourceFiles = (await Promise.all(['app', 'components', 'lib', 'reports'].map((directory) =>
      collectFiles(path.join(frontendDirectory, directory))))).flat();
    const backendReports = await collectFiles(path.join(backendDirectory, 'reports'));
    const sampleFiles = [path.join(backendDirectory, '.env.example'), path.join(frontendDirectory, '.env.local.example')];
    let scannedFiles = 0;
    for (const file of [...publicFiles, ...sourceFiles, ...backendReports, ...sampleFiles]) {
      if (!/\.(?:js|mjs|ts|tsx|json|md|log|map|example)$/u.test(file)) continue;
      const text = await readFile(file, 'utf8');
      assert(!containsCredential(text, environment.DB_PASSWORD), `交付配置隔离核验未通过：${path.relative(projectDirectory, file)}`);
      assert(!text.includes(environment.DB_HOST), `数据库地址隔离核验未通过：${path.relative(projectDirectory, file)}`);
      if (publicFiles.includes(file)) {
        assert(!text.includes('DB_PASSWORD') && !text.includes('DB_HOST'), '前端公开资源不得引用后端数据库配置字段。');
      }
      scannedFiles++;
    }
    for (const directory of [frontendDirectory, backendDirectory]) {
      const errors = await stat(path.join(directory, 'reports/runtime-error.log'));
      assert(errors.size === 0, '正式服务的错误输出必须为空。');
    }

    const report = {
      generatedAt: new Date().toISOString(),
      projectName: catalog.settings.projectName,
      author: catalog.settings.author,
      rootDirectories: roots.map((entry) => entry.name).sort(),
      pages: pageResults,
      uniqueSectionTitles: sectionTitles.size,
      products: { categories: categoryResults, total: 45, uniqueNames: 45, uniqueDescriptions: 45, uniqueImages: 45 },
      media: { total: media.size, localFilesMatchDatabase: true },
      privacy: { scannedFiles, frontendAndReportsContainNoRealDatabaseConfiguration: true },
      runtime: { frontendResponds: true, backendDatabaseConnected: true, standardErrorFilesEmpty: true },
    };
    await writeFile(path.join(frontendDirectory, 'reports/final-delivery-audit.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log('交付审计通过：两个根目录、三页三十七板块、九类四十五款、五十二张位图、配置隔离与运行状态均已核验。');
  } finally {
    await closeDatabasePool();
  }
}

async function collectFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const filePath = path.join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(filePath) : [filePath];
  }))).flat();
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// 凭据以完整值或连接字段出现才构成配置暴露，更长常量内的普通字符片段不作为凭据。
function containsCredential(text: string, credential: string): boolean {
  const escaped = credential.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return new RegExp(`(?<![a-zA-Z0-9_])${escaped}(?![a-zA-Z0-9_])`, 'u').test(text);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : '交付核验未完成。');
  void closeDatabasePool();
  process.exitCode = 1;
});
