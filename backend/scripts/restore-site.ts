import { cp, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";
import { readEnvironment } from "../src/config/env";
import { backupSite, verifyRestore } from "./backup-site";

// 整库恢复要求明确命令开关和停止运行状态，恢复前验证备份并保存当前完整快照。
void (async () => {
  const directory = path.resolve(process.argv[2] ?? "");
  if (!process.argv.includes("--restore"))
    throw new Error(
      "请提供备份目录和 --restore。此命令会恢复完整数据库，请先停止项目服务。",
    );
  const runtime = JSON.parse(
    (
      await readFile(
        path.resolve("../frontend/reports/runtime-services.json"),
        "utf8",
      )
    ).replace(/^\uFEFF/u, ""),
  );
  if (runtime.status !== "stopped")
    throw new Error("请先运行 stop-site.ps1，只有服务停止后才能整库恢复。");
  await verifyRestore(directory);
  const safety = await backupSite();
  await verifyRestore(safety);
  const backup = JSON.parse(
    await readFile(path.join(directory, "database.json"), "utf8"),
  ) as {
    tables: Array<{
      name: string;
      ddl: string;
      rows: Record<string, unknown>[];
    }>;
  };
  const env = readEnvironment();
  const db = await mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    charset: "utf8mb4",
    jsonStrings: true,
  });
  try {
    const [project] = await db.query<mysql.RowDataPacket[]>(
      "SELECT setting_value FROM site_settings WHERE setting_key=?",
      ["project_id"],
    );
    if (JSON.parse(String(project[0]?.setting_value)) !== "AEVORIO_SAMPLE_SITE")
      throw new Error("目标数据库项目身份不匹配，恢复未执行。");
    await db.query("SET FOREIGN_KEY_CHECKS=0");
    const [tables] = await db.query<mysql.RowDataPacket[]>(
      'SHOW FULL TABLES WHERE Table_type="BASE TABLE"',
    );
    for (const row of tables)
      await db.query("DROP TABLE ??", [String(Object.values(row)[0])]);
    for (const table of backup.tables) {
      await db.query(table.ddl);
      for (const row of table.rows) {
        const keys = Object.keys(row);
        await db.query(
          `INSERT INTO ?? (${keys.map(() => "??").join(",")}) VALUES(${keys.map(() => "?").join(",")})`,
          [
            table.name,
            ...keys,
            ...Object.values(row).map((v) =>
              v !== null && typeof v === "object" ? JSON.stringify(v) : v,
            ),
          ],
        );
      }
    }
    await db.query("SET FOREIGN_KEY_CHECKS=1");
    const root = path.resolve("storage/media");
    for (const name of await readdir(path.join(directory, "media")))
      await cp(path.join(directory, "media", name), path.join(root, name));
    // 当前环境配置保持实际设备配置，历史会话全部失效，管理员密码使用备份中的哈希。
    await db.execute("DELETE FROM admin_sessions");
    await db.execute(
      "UPDATE admin_users SET session_version=session_version+1",
    );
    console.log(
      `完整备份已恢复。恢复前快照保存在 ${safety}，请运行兼容迁移后启动服务。`,
    );
  } finally {
    await db.end();
  }
})().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "整库恢复未完成，请保留当前备份并检查数据库状态。",
  );
  process.exitCode = 1;
});
