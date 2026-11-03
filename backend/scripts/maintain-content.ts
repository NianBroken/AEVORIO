import { randomUUID, createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import type { Pool } from "mysql2/promise";
import { readEnvironment } from "../src/config/env";
import { createDatabasePool, closeDatabasePool } from "../src/database/pool";
import { ResourceService } from "../src/services/resource-service";
import { MediaService } from "../src/services/media-service";

const context = () => ({
  actorId: "local-cli",
  requestId: randomUUID(),
  operationId: randomUUID(),
});
const mediaDirectory = path.resolve(__dirname, "../storage/media");

// 本机维护与后台使用同一发布服务，统一执行版本、引用、历史和事务校验。
export async function updateCompanyName(
  database: Pool,
  name: string,
): Promise<void> {
  const service = new ResourceService(database);
  const current = await service.get("settings", "company_name");
  await service.save(
    "settings",
    current.id,
    { version: current.version, changes: { setting_value: name } },
    context(),
  );
}
export async function updateProductDescription(
  database: Pool,
  slug: string,
  description: string,
): Promise<void> {
  const service = new ResourceService(database);
  const current = (await service.list("products")).find(
    (p) => p.values.slug === slug,
  );
  if (!current) throw new Error("产品标识不存在，未保存任何内容。");
  await service.save(
    "products",
    current.id,
    { version: current.version, changes: { description } },
    context(),
  );
}
export async function replaceMediaImage(
  database: Pool,
  resourceKey: string,
  sourcePath: string,
): Promise<string> {
  const info = await lstat(sourcePath);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 15_000_000)
    throw new Error("请选择不超过 15 MB 的真实本地图片文件。");
  const resources = new ResourceService(database);
  const current = (await resources.list("media")).find(
    (m) => m.values.resource_key === resourceKey,
  );
  if (!current) throw new Error("媒体资源不存在，原有内容未改变。");
  const buffer = await readFile(sourcePath);
  const digest = createHash("sha256").update(buffer).digest("hex");
  const [known] = await database.execute<
    import("mysql2/promise").RowDataPacket[]
  >("SELECT metadata_json FROM media_versions WHERE media_id=? AND sha256=?", [
    current.id,
    digest,
  ]);
  if (known[0]) {
    const metadata =
      typeof known[0].metadata_json === "string"
        ? JSON.parse(known[0].metadata_json)
        : known[0].metadata_json;
    const restored = await resources.replaceMedia(
      current.id,
      metadata,
      current.version,
      context(),
      "restore",
    );
    return String(restored.values.file_name);
  }
  const extension = path.extname(sourcePath).toLowerCase();
  const mimetype =
    extension === ".png"
      ? "image/png"
      : extension === ".webp"
        ? "image/webp"
        : "image/jpeg";
  const file = {
    buffer,
    size: buffer.length,
    originalname: path.basename(sourcePath),
    mimetype,
  } as Express.Multer.File;
  const result = await new MediaService(resources, mediaDirectory).upload(
    file,
    context(),
    { id: current.id, version: current.version },
  );
  return String(result.values.file_name);
}
if (require.main === module)
  void (async () => {
    const database = createDatabasePool(readEnvironment());
    try {
      const [action, ...values] = process.argv.slice(2);
      if (action === "company" && values.length === 1)
        await updateCompanyName(database, values[0]!);
      else if (action === "product" && values.length === 2)
        await updateProductDescription(database, values[0]!, values[1]!);
      else if (action === "image" && values.length === 2)
        await replaceMediaImage(database, values[0]!, path.resolve(values[1]!));
      else
        throw new Error(
          "命令格式：company 企业名称、product 产品标识 产品说明、image 资源名称 本地图片路径。",
        );
      console.log("内容已通过统一服务保存并发布，历史记录可用于恢复。");
    } finally {
      await closeDatabasePool();
    }
  })().catch((error) => {
    console.error(error instanceof Error ? error.message : "维护操作未完成。");
    process.exitCode = 1;
  });
