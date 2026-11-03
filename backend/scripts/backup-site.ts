import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";
import { readEnvironment } from "../src/config/env";
import { secureDirectory } from "../src/utils/private-storage";
import { createHash } from "node:crypto";

// 备份同时保存结构、行数据和媒体文件，恢复校验仅允许使用隔离测试库。
export async function backupSite(): Promise<string> {
  const env = readEnvironment();
  const root = path.resolve(__dirname, "..");
  const target = path.join(
    root,
    "storage/backups",
    new Date().toISOString().replaceAll(/[:.]/gu, "-"),
  );
  const db = await mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    charset: "utf8mb4",
    dateStrings: true,
    jsonStrings: true,
  });
  try {
    await secureDirectory(path.dirname(target));
    await mkdir(target, { recursive: true });
    await db.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await db.query("START TRANSACTION WITH CONSISTENT SNAPSHOT");
    const [names] = await db.query<mysql.RowDataPacket[]>(
      'SHOW FULL TABLES WHERE Table_type = "BASE TABLE"',
    );
    const tables = [];
    for (const entry of names) {
      const name = String(Object.values(entry)[0]);
      const [ddl] = await db.query<mysql.RowDataPacket[]>(
        "SHOW CREATE TABLE ??",
        [name],
      );
      const [rows] = await db.query<mysql.RowDataPacket[]>("SELECT * FROM ??", [
        name,
      ]);
      tables.push({ name, ddl: String(ddl[0]?.["Create Table"]), rows });
    }
    await db.commit();
    await writeFile(
      path.join(target, "database.json"),
      JSON.stringify(
        { generatedAt: new Date().toISOString(), tables },
        null,
        2,
      ),
      "utf8",
    );
    await cp(path.join(root, "storage/media"), path.join(target, "media"), {
      recursive: true,
    });
    await cp(path.join(root, ".env"), path.join(target, "environment.private"));
    await cp(path.join(root, "storage/private"), path.join(target, "private"), {
      recursive: true,
    });
    for (const [source, name] of [
      [
        path.join(root, "reports/resource-inventory.json"),
        "resource-mapping.json",
      ],
      [
        path.resolve(root, "../frontend/.env.local"),
        "frontend-environment.private",
      ],
    ]) {
      try {
        await cp(source!, path.join(target, name!));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    return target;
  } finally {
    await db.end();
  }
}

// 从完整备份创建隔离数据库，核对每张表的实际恢复行数。
export async function verifyRestore(directory: string): Promise<void> {
  const env = readEnvironment();
  const name = `aevorio_test_restore_${Date.now()}`;
  const backup = JSON.parse(
    await readFile(path.join(directory, "database.json"), "utf8"),
  ) as {
    tables: Array<{
      name: string;
      ddl: string;
      rows: Record<string, unknown>[];
    }>;
  };
  const db = await mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    charset: "utf8mb4",
    multipleStatements: false,
    dateStrings: true,
    jsonStrings: true,
  });
  try {
    await db.query("CREATE DATABASE ?? CHARACTER SET utf8mb4", [name]);
    await db.query("USE ??", [name]);
    await db.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const table of backup.tables) {
      await db.query(table.ddl);
      for (const row of table.rows) {
        const values = Object.values(row).map((value) =>
          value !== null && typeof value === "object"
            ? JSON.stringify(value)
            : value,
        );
        await db.query(
          `INSERT INTO ?? (${Object.keys(row)
            .map(() => "??")
            .join(",")}) VALUES (${values.map(() => "?").join(",")})`,
          [table.name, ...Object.keys(row), ...values],
        );
      }
      const [counts] = await db.query<mysql.RowDataPacket[]>(
        "SELECT COUNT(*) AS total FROM ??",
        [table.name],
      );
      if (Number(counts[0]?.total) !== table.rows.length)
        throw new Error("备份恢复行数校验失败。");
      const [restored] = await db.query<mysql.RowDataPacket[]>(
        "SELECT * FROM ??",
        [table.name],
      );
      const normalize = (rows: Record<string, unknown>[]) =>
        rows
          .map((row) =>
            JSON.stringify(
              Object.fromEntries(
                Object.entries(row).sort(([a], [b]) => a.localeCompare(b)),
              ),
            ),
          )
          .sort();
      if (
        JSON.stringify(normalize(restored)) !==
        JSON.stringify(normalize(table.rows))
      )
        throw new Error("备份恢复内容校验失败。");
    }
    for (const table of backup.tables.filter((t) =>
      ["media_assets", "media_versions"].includes(t.name),
    ))
      for (const row of table.rows) {
        const media =
          table.name === "media_versions"
            ? typeof row.metadata_json === "string"
              ? JSON.parse(row.metadata_json)
              : row.metadata_json
            : row;
        const bytes = await readFile(
          path.join(directory, "media", path.basename(String(media.file_name))),
        );
        if (createHash("sha256").update(bytes).digest("hex") !== media.sha256)
          throw new Error("备份媒体文件校验失败。");
      }
    await db.query("SET FOREIGN_KEY_CHECKS = 1");
    await writeFile(
      path.join(directory, "restore-verification.json"),
      JSON.stringify(
        {
          passed: true,
          tables: backup.tables.map((t) => ({
            name: t.name,
            rows: t.rows.length,
          })),
          verifiedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      "utf8",
    );
  } finally {
    await db.query("DROP DATABASE IF EXISTS ??", [name]);
    await db.end();
  }
}

if (require.main === module) {
  void backupSite()
    .then(async (directory) => {
      await verifyRestore(directory);
      console.log(`完整备份和隔离恢复校验通过：${directory}`);
    })
    .catch(() => {
      console.error("备份或隔离恢复校验未通过，请检查数据库权限和存储空间。");
      process.exitCode = 1;
    });
}
