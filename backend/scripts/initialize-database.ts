import { createHash } from 'node:crypto';
import { lstat, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';
import sharp from 'sharp';
import { readEnvironment } from '../src/config/env';

// 只有数据库写入权限、产品规模和素材数量会随着项目需求调整。
const PROJECT_ID = 'AEVORIO_SAMPLE_SITE';
const EXPECTED_TABLES = ['media_assets', 'page_sections', 'pages', 'product_categories', 'products', 'site_settings'] as const;
const EXPECTED_PAGE_SECTIONS = { home: 12, products: 13, about: 12 } as const;
const EXPECTED_CATEGORY_COUNT = 9;
const EXPECTED_PRODUCT_COUNT = 45;
const EXPECTED_MEDIA_COUNT = 52;

interface MediaSeed {
  id: string;
  fileName: string;
}

interface CountRow extends mysql.RowDataPacket {
  count: number;
}

interface TableNameRow extends mysql.RowDataPacket {
  TABLE_NAME: string;
}

interface SettingRow extends mysql.RowDataPacket {
  setting_value: string;
}

const backendDirectory = path.resolve(__dirname, '..');
const schemaFile = path.join(backendDirectory, 'database/schema.sql');
const mediaDirectory = path.join(backendDirectory, 'storage/media');

async function main(): Promise<void> {
  const environment = readEnvironment();
  const database = await mysql.createConnection({
    host: environment.DB_HOST,
    port: environment.DB_PORT,
    user: environment.DB_USER,
    password: environment.DB_PASSWORD,
    charset: 'utf8mb4',
    connectTimeout: 8_000,
    multipleStatements: true,
    timezone: 'Z',
  });

  try {
    console.log(`正在只读检查 MySQL ${environment.DB_HOST}:${environment.DB_PORT} 与 ${environment.DB_NAME} 数据库。`);
    const databaseIsReady = await refuseExistingUnrelatedTables(database, environment.DB_NAME);
    await ensureMediaFiles();

    if (databaseIsReady) {
      await verifyDatabase(database);
      console.log('数据库、产品图和媒体校验通过。现有 AEVORIO 数据未被重新写入。');
      return;
    }

    const schema = await readFile(schemaFile, 'utf8');
    validateSeedCardinality(schema);
    await database.query(schema);
    await updateMediaMetadata(database, schema);
    await verifyDatabase(database);

    console.log('数据库和素材初始化通过。九个分类、四十五个产品、五十二项媒体元数据以及三页独立板块均已实测验证。');
  } finally {
    await database.end();
  }
}

async function refuseExistingUnrelatedTables(database: mysql.Connection, databaseName: string): Promise<boolean> {
  const [exists] = await database.execute<CountRow[]>(
    'SELECT COUNT(*) AS count FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?',
    [databaseName],
  );

  if (exists[0]?.count === 0) return false;

  const [tables] = await database.execute<TableNameRow[]>(
    `SELECT TABLE_NAME
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
     ORDER BY TABLE_NAME`,
    [databaseName],
  );

  if (tables.length === 0) return false;

  const tableNames = tables.map((table) => table.TABLE_NAME);
  const unexpected = tableNames.filter((table) => !EXPECTED_TABLES.includes(table as typeof EXPECTED_TABLES[number]));
  const allExpectedTables = EXPECTED_TABLES.every((table) => tableNames.includes(table));
  let isOwnedDatabase = false;

  if (allExpectedTables && tableNames.length === EXPECTED_TABLES.length) {
    const [rows] = await database.execute<SettingRow[]>(
      `SELECT setting_value
       FROM \`${databaseName.replaceAll('`', '')}\`.site_settings
       WHERE setting_key = ? LIMIT 1`,
      ['project_id'],
    );
    const value = decodeSetting(rows[0]?.setting_value);
    isOwnedDatabase = value === PROJECT_ID;
  }

  if (allExpectedTables && isOwnedDatabase) {
    const initialized = await isFullyInitialized(database, databaseName);
    if (initialized) {
      console.log('数据库已包含完整的 AEVORIO 示例数据，本次保持现有内容且不重复初始化。');
      return true;
    }

    throw new Error('目标数据库已标记为 AEVORIO 项目但内容不完整。初始化程序没有修改数据，请先检查已有项目记录。');
  }

  if (!unexpected.length && tableNames.every((table) => EXPECTED_TABLES.includes(table as typeof EXPECTED_TABLES[number]))) {
    let existingRows = 0;
    for (const table of tableNames) {
      const [rows] = await database.execute<CountRow[]>(
        `SELECT COUNT(*) AS count FROM \`${databaseName.replaceAll('`', '')}\`.\`${table}\``,
      );
      existingRows += Number(rows[0]?.count ?? 0);
    }

    if (existingRows === 0) {
      console.log('检测到目标数据库中仅有空的兼容表，将依据项目唯一 SQL 文件补齐初始内容。');
      return false;
    }
  }

  throw new Error(
    '目标数据库 aevorio 中已经存在非本项目的数据或结构。为避免覆盖现有内容，初始化程序停止且没有写入。',
  );
}

async function ensureMediaFiles(): Promise<void> {
  const names = await readMediaSeeds();
  const digests = new Set<string>();

  for (const { fileName } of names) {
    const safeName = path.basename(fileName);
    if (safeName !== fileName || !/^[a-z0-9-]+\.png$/u.test(safeName)) {
      throw new Error('数据库中的图片文件名不符合项目媒体命名规则。');
    }

    const absolutePath = path.resolve(mediaDirectory, safeName);
    if (!absolutePath.startsWith(`${mediaDirectory}${path.sep}`)) {
      throw new Error('图片路径校验失败，访问被禁止。');
    }

    const [file, fileStat] = await Promise.all([readFile(absolutePath), lstat(absolutePath)]);
    if (!fileStat.isFile() || fileStat.isSymbolicLink() || fileStat.size === 0 || fileStat.size > 15_000_000) {
      throw new Error(`媒体文件 ${safeName} 的实际类型或文件大小不符合要求。`);
    }

    const metadata = await sharp(file).metadata();
    const expectedSize = EDITORIAL_FILE_NAMES.has(fileName)
      ? fileName === 'home-hero.png' ? [1920, 1100] : [1500, 920]
      : [920, 680];
    if (metadata.format !== 'png' || metadata.width !== expectedSize[0] || metadata.height !== expectedSize[1]) {
      throw new Error(`媒体文件 ${safeName} 不能通过图像格式和像素尺寸验证。`);
    }

    const digest = createHash('sha256').update(file).digest('hex');
    if (digests.has(digest)) {
      throw new Error(`媒体文件 ${safeName} 与其他图片内容重复。`);
    }
    digests.add(digest);
  }
}

const EDITORIAL_FILE_NAMES = new Set([
  'home-hero.png', 'home-engineering.png', 'home-workbench.png',
  'home-testbench.png', 'about-research.png', 'about-assembly.png', 'about-precision.png',
]);

async function readMediaSeeds(): Promise<MediaSeed[]> {
  const schema = await readFile(schemaFile, 'utf8');
  const seeds = [...schema.matchAll(/\('([^']+)',\s*'[^']+',\s*'([^']+\.png)'/gu)]
    .map((match) => readMediaEntry(match[1], match[2]));

  if (seeds.length !== EXPECTED_MEDIA_COUNT || new Set(seeds.map(({ fileName }) => fileName)).size !== EXPECTED_MEDIA_COUNT) {
    throw new Error('媒体清单数量不正确或图片文件名重复。');
  }

  return seeds;
}

async function updateMediaMetadata(database: mysql.Connection, schema: string): Promise<void> {
  const seeds = extractMediaSeeds(schema);
  const updatedFiles = new Set<string>();
  await database.beginTransaction();

  try {
    for (const { id, fileName } of seeds) {
      const absolutePath = path.resolve(mediaDirectory, fileName);
      const [contents, metadata, fileInfo] = await Promise.all([
        readFile(absolutePath), sharp(absolutePath).metadata(), stat(absolutePath),
      ]);
      const [result] = await database.execute<mysql.ResultSetHeader>(
        `UPDATE \`aevorio\`.media_assets
         SET file_size = ?, width = ?, height = ?, sha256 = ?
         WHERE id = ? AND file_name = ? AND relative_path = ?`,
        [
          fileInfo.size, metadata.width ?? 0, metadata.height ?? 0,
          createHash('sha256').update(contents).digest('hex'), id, fileName,
          `media/${fileName}`,
        ],
      );

      if (result.affectedRows !== 1) {
        throw new Error(`媒体文件 ${fileName} 没有对应数据库记录。`);
      }
      updatedFiles.add(fileName);
    }

    await database.commit();
  } catch (error) {
    await database.rollback();
    throw error;
  }

  if (updatedFiles.size !== EXPECTED_MEDIA_COUNT) {
    throw new Error('媒体文件的数据库元数据没有全部完成更新。');
  }
}

function extractMediaSeeds(schema: string): MediaSeed[] {
  return [...schema.matchAll(/\('([^']+)',\s*'[^']+',\s*'([^']+\.png)'/gu)]
    .map((match) => readMediaEntry(match[1], match[2]));
}

function readMediaEntry(id: string | undefined, fileName: string | undefined): MediaSeed {
  if (!id || !fileName) throw new Error('数据库媒体资源记录中缺少稳定 ID 或文件名。');
  return { id, fileName };
}

async function verifyDatabase(database: mysql.Connection): Promise<void> {
  const [pageRows] = await database.query<mysql.RowDataPacket[]>(
    `SELECT pages.slug, COUNT(page_sections.id) AS count
     FROM aevorio.pages AS pages
     LEFT JOIN aevorio.page_sections AS page_sections ON page_sections.page_id = pages.id
     GROUP BY pages.id, pages.slug
     ORDER BY pages.id`,
  );

  if (pageRows.length !== 3) {
    throw new Error('数据库初始化验证失败：正式页面数量必须正好为三页。');
  }

  for (const expectedSlug of ['home', 'products', 'about'] as const) {
    const page = pageRows.find((row) => row.slug === expectedSlug);
    if (Number(page?.count) !== EXPECTED_PAGE_SECTIONS[expectedSlug]) {
      throw new Error(`数据库初始化验证失败：${expectedSlug} 页面板块数量错误。`);
    }
  }

  const [products] = await database.query<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS product_count,
       COUNT(DISTINCT slug) AS unique_slugs,
       COUNT(DISTINCT primary_media_id) AS unique_images,
       COUNT(*) - SUM(is_demo = 1) AS unmarked_examples
     FROM aevorio.products WHERE is_visible = 1`,
  );
  const productCount = products[0];
  if (Number(productCount?.product_count) !== EXPECTED_PRODUCT_COUNT
    || Number(productCount?.unique_slugs) !== EXPECTED_PRODUCT_COUNT
    || Number(productCount?.unique_images) !== EXPECTED_PRODUCT_COUNT
    || Number(productCount?.unmarked_examples) !== 0) {
    throw new Error('数据库初始化验证失败：产品数量、示例标记、产品唯一键或主图关联不正确。');
  }

  const [categories] = await database.query<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS category_count, SUM(product_count = 5) AS completed_categories
     FROM (
       SELECT category.id, COUNT(product.id) AS product_count
       FROM aevorio.product_categories AS category
       LEFT JOIN aevorio.products AS product ON product.category_id = category.id
       GROUP BY category.id
     ) AS counts`,
  );
  if (Number(categories[0]?.category_count) !== EXPECTED_CATEGORY_COUNT
    || Number(categories[0]?.completed_categories) !== EXPECTED_CATEGORY_COUNT) {
    throw new Error('数据库初始化验证失败：九个类别必须各有五款产品。');
  }

  const [media] = await database.query<mysql.RowDataPacket[]>(
    'SELECT COUNT(*) AS total, COUNT(DISTINCT sha256) AS unique_hashes, SUM(file_size = 0) AS empty_files FROM aevorio.media_assets',
  );
  if (Number(media[0]?.total) !== EXPECTED_MEDIA_COUNT
    || Number(media[0]?.unique_hashes) !== EXPECTED_MEDIA_COUNT
    || Number(media[0]?.empty_files) !== 0) {
    throw new Error('数据库初始化验证失败：图片路径、文件哈希或图片大小记录缺失。');
  }

  await verifyFileReferences(database, mediaDirectory);
}

async function verifyFileReferences(database: mysql.Connection, storageDirectory: string): Promise<void> {
  const [rows] = await database.query<mysql.RowDataPacket[]>(
    'SELECT file_name, relative_path, mime_type, sha256 FROM aevorio.media_assets ORDER BY resource_key',
  );

  for (const row of rows) {
    const safeName = String(row.file_name);
    if (!/^([a-z0-9-]+)\.png$/u.test(safeName)
      || String(row.relative_path) !== `media/${safeName}`
      || String(row.mime_type) !== 'image/png') {
      throw new Error('媒体文件数据库引用未通过安全路径或内容类型检查。');
    }

    const fullPath = path.resolve(storageDirectory, safeName);
    if (!fullPath.startsWith(`${storageDirectory}${path.sep}`)) {
      throw new Error('数据库中存在越界图片路径，图片访问被拒绝。');
    }

    const contents = await readFile(fullPath);
    if (createHash('sha256').update(contents).digest('hex') !== String(row.sha256)) {
      throw new Error(`媒体文件 ${safeName} 的 SHA-256 实际校验值与数据库记录不一致。`);
    }
  }
}

async function isFullyInitialized(database: mysql.Connection, databaseName: string): Promise<boolean> {
  const schemaIdentifier = databaseName.replaceAll('`', '');
  const tableSizes = await Promise.all(EXPECTED_TABLES.map(async (table) => {
    const [rows] = await database.execute<CountRow[]>(
      `SELECT COUNT(*) AS count FROM \`${schemaIdentifier}\`.\`${table}\``,
    );
    return Number(rows[0]?.count ?? 0);
  }));

  const [pages] = await database.execute<CountRow[]>(`SELECT COUNT(*) AS count FROM \`${schemaIdentifier}\`.pages`);
  const [sections] = await database.execute<CountRow[]>(`SELECT COUNT(*) AS count FROM \`${schemaIdentifier}\`.page_sections`);
  const [categories] = await database.execute<CountRow[]>(`SELECT COUNT(*) AS count FROM \`${schemaIdentifier}\`.product_categories`);
  const [products] = await database.execute<CountRow[]>(`SELECT COUNT(*) AS count FROM \`${schemaIdentifier}\`.products`);
  const [media] = await database.execute<CountRow[]>(`SELECT COUNT(*) AS count FROM \`${schemaIdentifier}\`.media_assets`);

  const expectedRows = [EXPECTED_MEDIA_COUNT, 37, 3, EXPECTED_CATEGORY_COUNT, EXPECTED_PRODUCT_COUNT, 5];
  return tableSizes.every((count, index) => count === expectedRows[index])
    && Number(pages[0]?.count) === 3
    && Number(sections[0]?.count) === 37
    && Number(categories[0]?.count) === EXPECTED_CATEGORY_COUNT
    && Number(products[0]?.count) === EXPECTED_PRODUCT_COUNT
    && Number(media[0]?.count) === EXPECTED_MEDIA_COUNT;
}

function validateSeedCardinality(schema: string): void {
  const sectionCount = [...schema.matchAll(/\(\(SELECT id FROM pages WHERE slug = '/gu)].length;
  const productCount = [...schema.matchAll(/\('product-[^']+',\s*'[^']+',\s*'category-/gu)].length;
  const categoryCount = [...schema.matchAll(/\('category-[^']+',\s*'[^']+',\s*'[^']+',\s*'[^']+',\s*\d+\)/gu)].length;

  if (sectionCount !== 37 || productCount !== EXPECTED_PRODUCT_COUNT || categoryCount !== EXPECTED_CATEGORY_COUNT) {
    throw new Error('数据库唯一 SQL 文件的板块、产品类别或示例产品数据未达到项目验收数量。');
  }
  if (/^\s*DROP\s+(DATABASE|TABLE)/imu.test(schema)) {
    throw new Error('数据库初始化文件不能删除现有数据库或数据表。');
  }
}

function decodeSetting(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const decoded: unknown = JSON.parse(value);
    return typeof decoded === 'string' ? decoded : null;
  } catch {
    return value.replaceAll('"', '');
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : '数据库初始化遇到未知问题。';
  console.error(`AEVORIO 数据库初始化失败：${message}`);
  process.exitCode = 1;
});
