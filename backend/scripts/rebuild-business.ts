import { readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";
import dotenv from "dotenv";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { readEnvironment } from "../src/config/env";

// 仅重建经过项目标识核验的业务库，管理员账户始终保留在原表。
async function main() {
  process.chdir(path.resolve(__dirname, ".."));
  dotenv.config({ path: path.resolve(".env"), quiet: true });
  const env = readEnvironment();
  const db = await mysql.createConnection({ host: env.DB_HOST, port: env.DB_PORT, user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME, charset: "utf8mb4", jsonStrings: true, multipleStatements: true });
  try {
    const [marker] = await db.query<RowDataPacket[]>("SELECT setting_value FROM site_settings WHERE setting_key='project_id'");
    if (JSON.parse(String(marker[0]?.setting_value)) !== "AEVORIO_SAMPLE_SITE") throw new Error("项目标识不匹配");
    const schema = (await readFile(path.resolve("database/default.sql"), "utf8")).replaceAll("`aevorio`", mysql.escapeId(env.DB_NAME)).replace(/^INSERT INTO `admin_users`[^\r\n]*;\r?$/gm, "");
    const [tables] = await db.query<RowDataPacket[]>("SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=?", [env.DB_NAME]);
    await db.query("SET FOREIGN_KEY_CHECKS=0");
    for (const table of tables) if (table.name !== "admin_users") await db.query("DROP TABLE ??", [table.name]);
    await db.query(schema);
    await db.query("UPDATE admin_users SET session_version=session_version+1");
    for (const name of ["media", "uploads"]) {
      const storage = path.resolve("storage");
      const directory = path.resolve(storage, name);
      if (path.dirname(directory) !== storage) throw new Error("媒体目录不属于项目");
      for (const entry of await readdir(directory)) await rm(path.join(directory, entry), { recursive: true, force: true });
    }
    await promisify(execFile)(process.execPath, [require.resolve("tsx/cli"), "scripts/generate-media.ts"]);
    await db.query("DELETE FROM media_versions");
    const [assets] = await db.query<RowDataPacket[]>("SELECT id,file_name FROM media_assets");
    for (const asset of assets) {
      const bytes = await readFile(path.resolve("storage/media", String(asset.file_name)));
      const metadata = await sharp(bytes).metadata();
      await db.execute("UPDATE media_assets SET sha256=?,file_size=?,width=?,height=? WHERE id=?", [createHash("sha256").update(bytes).digest("hex"), bytes.length, metadata.width, metadata.height, asset.id]);
    }
    const [versions] = await db.query<RowDataPacket[]>("SELECT * FROM media_assets");
    for (const version of versions) await db.execute("INSERT INTO media_versions(media_id,sha256,metadata_json) VALUES(?,?,?)", [version.id, version.sha256, JSON.stringify(version)]);
    console.log("业务数据已重建，管理员账户与密码保留，旧会话已撤销。");
  } finally { await db.end(); }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
