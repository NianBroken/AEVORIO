import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";
import sharp from "sharp";
import { readEnvironment } from "../src/config/env";
import { migrateAdmin } from "./migrate-admin";
import { finalizeAdminData } from "./finalize-admin-data";
import { backupSite, verifyRestore } from "./backup-site";

// 空库才导入示例。已有项目库只执行兼容迁移，不重置任何内容和稳定标识。
void (async () => {
  const env = readEnvironment();
  const db = await mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    charset: "utf8mb4",
    jsonStrings: true,
    multipleStatements: true,
  });
  try {
    const [tables] = await db.query<mysql.RowDataPacket[]>(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=?",
      [env.DB_NAME],
    );
    if (tables.length) {
      if (!tables.some((t) => t.TABLE_NAME === "site_settings"))
        throw new Error("目标数据库包含其他项目的数据，初始化未执行。");
      const [marker] = await db.query<mysql.RowDataPacket[]>(
        "SELECT setting_value FROM ??.site_settings WHERE setting_key=?",
        [env.DB_NAME, "project_id"],
      );
      if (
        JSON.parse(String(marker[0]?.setting_value)) !== "AEVORIO_SAMPLE_SITE"
      )
        throw new Error("数据库项目标识不匹配，初始化未执行。");
      const backup = await backupSite();
      await verifyRestore(backup);
      await db.query("USE ??", [env.DB_NAME]);
    } else {
      const schema = await readFile(
        path.resolve(__dirname, "../database/schema.sql"),
        "utf8",
      );
      await db.query(
        schema.replaceAll("`aevorio`", mysql.escapeId(env.DB_NAME)),
      );
      const [media] = await db.query<mysql.RowDataPacket[]>(
        "SELECT id,file_name FROM media_assets",
      );
      for (const item of media) {
        const bytes = await readFile(
          path.resolve(
            __dirname,
            "../storage/media",
            path.basename(String(item.file_name)),
          ),
        );
        const metadata = await sharp(bytes).metadata();
        await db.execute(
          "UPDATE media_assets SET file_size=?,width=?,height=?,sha256=? WHERE id=?",
          [
            bytes.length,
            metadata.width!,
            metadata.height!,
            createHash("sha256").update(bytes).digest("hex"),
            item.id,
          ],
        );
      }
    }
    await migrateAdmin(db);
    await finalizeAdminData(db);
    const [pages] = await db.query<mysql.RowDataPacket[]>(
      "SELECT p.slug,COUNT(s.id) AS count FROM pages p JOIN page_sections s ON s.page_id=p.id AND s.is_visible=1 AND s.is_deleted=0 GROUP BY p.id",
    );
    if (pages.length !== 3 || pages.some((p) => Number(p.count) < 10))
      throw new Error("页面有效板块数量不满足发布要求。");
    console.log("数据库结构、兼容迁移与页面约束核验通过，现有内容未被重置。");
  } finally {
    await db.end();
  }
})().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "数据库初始化未完成。",
  );
  process.exitCode = 1;
});
