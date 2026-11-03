import { createHash, randomUUID } from 'node:crypto';
import { copyFile, lstat, mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';
import sharp from 'sharp';
import { readEnvironment } from '../src/config/env';
import { closeDatabasePool, createDatabasePool } from '../src/database/pool';

// 管理操作只变更现有公司文案、产品说明或指定图片，不创建额外页面。
const IMAGE_SIZE_LIMIT = 15_000_000;
const MAX_DESCRIPTION_LENGTH = 255;
const MAX_COMPANY_NAME_LENGTH = 80;
const backendDirectory = path.resolve(__dirname, '..');
const storageDirectory = path.join(backendDirectory, 'storage');
const mediaDirectory = path.join(storageDirectory, 'media');
const stagingDirectory = path.join(storageDirectory, '.staging');

interface MediaRow extends mysql.RowDataPacket {
  id: string;
  file_name: string;
  relative_path: string;
  width: number;
  height: number;
  sha256: string;
}

async function main(): Promise<void> {
  const [operation, ...values] = process.argv.slice(2);
  const database = createDatabasePool(readEnvironment());

  try {
    if (operation === 'company' && values.length === 1) {
      await updateCompanyName(database, values[0] ?? '');
      console.log('已更新独立保存的企业名称，并保留其示例状态说明。');
    } else if (operation === 'product' && values.length === 2) {
      await updateProductDescription(database, values[0] ?? '', values[1] ?? '');
      console.log('已按产品唯一标识更新对应说明，其他产品记录没有改动。');
    } else if (operation === 'image' && values.length === 2) {
      const fileName = await replaceMediaImage(database, values[0] ?? '', values[1] ?? '');
      console.log(`已更新后端本地媒体图片，数据库元数据与校验值均已同步：${fileName}`);
    } else {
      throw new Error(
        '维护命令格式不正确。使用 company 企业名称、product 产品slug 产品说明，或 image 资源键 本地图片路径。',
      );
    }
  } finally {
    await closeDatabasePool();
  }
}

export async function updateCompanyName(database: mysql.Pool, value: string): Promise<void> {
  const name = value.trim();
  if (name.length < 2 || name.length > MAX_COMPANY_NAME_LENGTH) {
    throw new Error(`公司名称须为 2 至 ${MAX_COMPANY_NAME_LENGTH} 个字符。`);
  }

  const [result] = await database.execute<mysql.ResultSetHeader>(
    'UPDATE site_settings SET setting_value = JSON_QUOTE(?) WHERE setting_key = ?',
    [name, 'company_name'],
  );
  if (result.affectedRows === 0) {
    throw new Error('没有找到公司名称配置，请运行数据库初始化命令后重新尝试。');
  }
}

export async function updateProductDescription(database: mysql.Pool, slug: string, value: string): Promise<void> {
  const productSlug = slug.trim();
  const description = value.trim();
  if (!/^[a-z0-9-]{3,96}$/u.test(productSlug)) {
    throw new Error('产品 slug 只能包含英文小写字母、数字和短横线。');
  }
  if (description.length < 8 || description.length > MAX_DESCRIPTION_LENGTH) {
    throw new Error(`产品说明须为 8 至 ${MAX_DESCRIPTION_LENGTH} 个字符。`);
  }

  const [result] = await database.execute<mysql.ResultSetHeader>(
    'UPDATE products SET description = ? WHERE slug = ? AND is_demo = 1',
    [description, productSlug],
  );
  if (result.affectedRows === 0) {
    const [rows] = await database.execute<mysql.RowDataPacket[]>(
      'SELECT id FROM products WHERE slug = ? AND is_demo = 1 LIMIT 1',
      [productSlug],
    );
    if (!rows[0]) {
      throw new Error('没有找到该示例产品，其他产品均未变更。');
    }
  }
}

export async function replaceMediaImage(
  database: mysql.Pool,
  resourceKey: string,
  sourcePath: string,
): Promise<string> {
  if (!/^[a-z0-9-]{3,96}$/u.test(resourceKey)) {
    throw new Error('图片资源键只能包含英文小写字母、数字和短横线。');
  }

  const originalPath = path.resolve(sourcePath);
  const originalStat = await lstat(originalPath);
  if (!originalStat.isFile() || originalStat.isSymbolicLink() || originalStat.size === 0 || originalStat.size > IMAGE_SIZE_LIMIT) {
    throw new Error('图片必须是 15 MB 以内的真实本地图片文件。');
  }

  const sourceImage = await readFile(originalPath);
  const sourceMetadata = await sharp(sourceImage).metadata();
  if (!['jpeg', 'png', 'webp'].includes(sourceMetadata.format ?? '')
    || (sourceMetadata.pages ?? 1) !== 1
    || (sourceMetadata.width ?? 0) < 200
    || (sourceMetadata.height ?? 0) < 200
    || (sourceMetadata.width ?? 0) > 5_120
    || (sourceMetadata.height ?? 0) > 5_120) {
    throw new Error('图片必须为完整的 PNG、JPEG 或 WebP 静态图，并且宽高各在 200 至 5120 像素之间。');
  }

  const [assets] = await database.execute<MediaRow[]>(
    `SELECT id, file_name, relative_path, width, height, sha256
     FROM media_assets WHERE resource_key = ? LIMIT 1`,
    [resourceKey],
  );
  const asset = assets[0];
  if (!asset) throw new Error('没有找到该媒体资源键，数据库内容没有改动。');

  const fileName = path.basename(asset.file_name);
  const targetPath = path.resolve(mediaDirectory, fileName);
  if (fileName !== asset.file_name || !/^[a-z0-9-]+\.png$/u.test(fileName)
    || asset.relative_path !== `media/${fileName}`
    || !targetPath.startsWith(`${mediaDirectory}${path.sep}`)) {
    throw new Error('数据库图片路径没有通过后端媒体目录的安全验证。');
  }

  const previousBytes = await readFile(targetPath);
  const previousHash = createHash('sha256').update(previousBytes).digest('hex');
  if (previousHash !== asset.sha256) {
    throw new Error('替换前的本地图片已与数据库 SHA-256 不一致，未修改任何文件或数据库记录。');
  }

  const convertedImage = await sharp(sourceImage)
    .rotate()
    .resize({ width: asset.width, height: asset.height, fit: 'contain', background: '#e8eeea' })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  const metadata = await sharp(convertedImage).metadata();
  if (metadata.width !== asset.width || metadata.height !== asset.height) {
    throw new Error('生成的替换图片没有达到原资源记录中的像素尺寸。');
  }

  const nextHash = createHash('sha256').update(convertedImage).digest('hex');
  if (nextHash === previousHash) throw new Error('新图片与当前资源完全相同，无需更新。');

  const [duplicates] = await database.execute<mysql.RowDataPacket[]>(
    'SELECT id FROM media_assets WHERE sha256 = ? AND id <> ? LIMIT 1',
    [nextHash, asset.id],
  );
  if (duplicates[0]) throw new Error('新图片与其他资源重复，未更新图片或数据库。');

  await mkdir(stagingDirectory, { recursive: true });
  const temporaryPath = path.join(stagingDirectory, `${randomUUID()}.png`);
  const backupPath = path.join(stagingDirectory, `${randomUUID()}.png`);
  const connection = await database.getConnection();
  let fileReplaced = false;
  let transactionOpen = false;
  let databaseCommitted = false;

  try {
    await writeFile(temporaryPath, convertedImage, { flag: 'wx' });
    await copyFile(targetPath, backupPath);
    await connection.beginTransaction();
    transactionOpen = true;
    await rename(temporaryPath, targetPath);
    fileReplaced = true;

    const [update] = await connection.execute<mysql.ResultSetHeader>(
      `UPDATE media_assets
       SET file_size = ?, width = ?, height = ?, sha256 = ?
       WHERE id = ? AND sha256 = ?`,
      [convertedImage.length, asset.width, asset.height, nextHash, asset.id, previousHash],
    );
    if (update.affectedRows !== 1) throw new Error('图片数据库记录已改变，旧图片与数据库记录均已恢复。');

    await connection.commit();
    transactionOpen = false;
    databaseCommitted = true;
  } catch (error) {
    if (transactionOpen) {
      await connection.rollback();
    }

    if (fileReplaced) {
      const [currentRows] = await database.execute<mysql.RowDataPacket[]>(
        'SELECT sha256 FROM media_assets WHERE id = ? LIMIT 1',
        [asset.id],
      );
      const currentHash = String(currentRows[0]?.sha256 ?? '');

      if (currentHash === nextHash) {
        databaseCommitted = true;
      } else if (currentHash === previousHash) {
        await rename(backupPath, targetPath);
        fileReplaced = false;
      } else {
        throw new Error('图片替换状态无法确认，原图副本保存在后端 storage/.staging，请先检查 MySQL 状态。', { cause: error });
      }
    }

    if (!databaseCommitted) throw error;
  } finally {
    connection.release();
    await removeTemporaryFile(temporaryPath);
    if (databaseCommitted || !fileReplaced) {
      await removeTemporaryFile(backupPath);
    }
  }

  const fileInfo = await stat(targetPath);
  if (fileInfo.size !== convertedImage.length || fileInfo.size === 0) {
    throw new Error('图片替换完成后未能通过本地文件大小复核。');
  }

  return fileName;
}

// 文件在成功重命名后已经不存在，只忽略此确定状态，其他文件系统故障正常上报。
async function removeTemporaryFile(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const reason = error instanceof Error ? error.message : '后端内容维护失败。';
    console.error(`AEVORIO 内容维护失败：${reason}`);
    void closeDatabasePool();
    process.exitCode = 1;
  });
}
