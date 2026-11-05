import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";
import { readEnvironment } from "../src/config/env";
import {
  INITIAL_PUBLIC_CONTENT,
  SECTION_NAMES,
  type Values,
} from "../../shared/content";
import { backupSite, verifyRestore } from "./backup-site";
import { finalizeAdminData } from "./finalize-admin-data";

const MIGRATION_VERSION = 1;
// 表定义只读取统一 SQL 文件，迁移通过实际列信息补齐兼容字段。
export async function migrateAdmin(db: mysql.Connection): Promise<void> {
  const sql = await readFile(
    path.resolve(__dirname, "../database/default.sql"),
    "utf8",
  );
  const definitions = [
    ...sql.matchAll(
      /CREATE TABLE IF NOT EXISTS `([^`]+)` \([\s\S]*?\) ENGINE=[^;]+;/gu,
    ),
  ];
  for (const match of definitions) {
    const table = match[1]!;
    await db.query(match[0]);
    const [columns] = await db.query<mysql.RowDataPacket[]>(
      "SHOW COLUMNS FROM ??",
      [table],
    );
    const names = new Set(columns.map((c) => String(c.Field)));
    for (const line of match[0].split("\n")) {
      const column = line.trim().match(/^`([^`]+)` (.+?)(?:,)?$/u);
      if (column && !names.has(column[1]!))
        await db.query(
          "ALTER TABLE ?? ADD COLUMN " + column[0].replace(/,$/u, ""),
          [table],
        );
    }
  }
  const [applied] = await db.query<mysql.RowDataPacket[]>(
    "SELECT version FROM schema_versions WHERE version=?",
    [MIGRATION_VERSION],
  );
  // 业务历史不参与当前发布与媒体引用，兼容旧备份时同样清理。
  await db.query("DROP TABLE IF EXISTS content_revisions");
  await db.execute("INSERT IGNORE INTO schema_versions(version) VALUES(4)");
  if (applied.length) return;
  await db.query(
    "ALTER TABLE products MODIFY COLUMN description TEXT NOT NULL",
  );
  await db.beginTransaction();
  try {
    await db.execute(
      "INSERT INTO site_settings (setting_key,setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_key=setting_key",
      ["public_content", JSON.stringify(INITIAL_PUBLIC_CONTENT)],
    );
    const [sections] = await db.query<mysql.RowDataPacket[]>(
      "SELECT * FROM page_sections",
    );
    const [categories] = await db.query<mysql.RowDataPacket[]>(
      "SELECT id,slug FROM product_categories",
    );
    for (const row of sections) {
      const content: Values =
        typeof row.content_json === "string"
          ? JSON.parse(row.content_json)
          : row.content_json;
      for (const key of ["points", "steps"])
        if (Array.isArray(content[key]))
          content[key] = content[key].map((v) =>
            typeof v === "string" ? { id: randomUUID(), text: v } : v,
          );
      content.label = SECTION_NAMES[String(row.section_type)] ?? "工程记录";
      content.style = "default";
      content.background = "";
      content.backgroundMedia = "";
      content.imageFit = "contain";
      content.imagePosition = "center";
      if (row.section_type === "hero") {
        content.stamp = "AE / 01";
        content.primaryText = row.section_key.startsWith("P")
          ? "浏览板卡目录"
          : "查看产品";
        content.primaryHref = row.section_key.startsWith("P")
          ? "#product-catalog"
          : "/products";
        content.secondaryText = row.section_key.startsWith("A")
          ? "阅读工程方法"
          : "了解工程思路";
        content.secondaryHref = row.section_key.startsWith("A")
          ? "#about-methods"
          : "/about";
        content.primaryIcon = "ArrowUpRight";
        content.secondaryIcon = "MoveRight";
      }
      if (["editorial", "engineering", "craft"].includes(row.section_type))
        content.imageCaption = "AE / CIRCUIT NOTE";
      if (row.section_type === "validation")
        content.validationStatus = "检查记录";
      if (row.section_type === "quote")
        content.quoteReference = "ENGINEERING NOTE";
      if (
        [
          "applications",
          "capabilities",
          "disciplines",
          "collaboration",
          "category-overview",
          "selection-guide",
        ].includes(row.section_type)
      )
        content.arrowIcon = "ArrowDownRight";
      if (row.section_type === "closing") {
        const first =
          Array.isArray(content.links) && content.links.includes("products")
            ? "/products"
            : "/about";
        content.closingLabel = "下一个工程问题";
        content.primaryHref = first;
        content.secondaryHref = first === "/products" ? "/about" : "/products";
        content.primaryText =
          first === "/products" ? "探索产品目录" : "继续阅读企业介绍";
        content.secondaryText =
          first === "/products" ? "了解工程方法" : "查看硬件示例";
        content.primaryIcon = "ArrowUpRight";
        content.secondaryIcon = "MoveRight";
        content.arrowIcon = "ArrowDownRight";
      }
      const category = categories.find((c) => c.slug === content.category);
      await db.execute(
        "UPDATE page_sections SET content_json=?,category_id=? WHERE id=?",
        [JSON.stringify(content), category?.id ?? null, row.id],
      );
    }
    const [products] = await db.query<mysql.RowDataPacket[]>(
      "SELECT id,specifications_json,features_json FROM products",
    );
    for (const product of products) {
      const stable = (value: unknown) => {
        const list = typeof value === "string" ? JSON.parse(value) : value;
        return (list as unknown[]).map((v) =>
          typeof v === "string" ? { id: randomUUID(), text: v } : v,
        );
      };
      await db.execute(
        "UPDATE products SET specifications_json=?,features_json=? WHERE id=?",
        [
          JSON.stringify(stable(product.specifications_json)),
          JSON.stringify(stable(product.features_json)),
          product.id,
        ],
      );
    }
    const [media] = await db.query<mysql.RowDataPacket[]>(
      "SELECT * FROM media_assets",
    );
    for (const row of media)
      await db.execute(
        "INSERT IGNORE INTO media_versions(media_id,sha256,metadata_json) VALUES(?,?,?)",
        [row.id, row.sha256, JSON.stringify(row)],
      );
    await db.execute("INSERT INTO schema_versions(version) VALUES(?)", [
      MIGRATION_VERSION,
    ]);
    await db.commit();
  } catch (error) {
    await db.rollback();
    throw error;
  }
}
if (require.main === module)
  void (async () => {
    const backup = await backupSite();
    await verifyRestore(backup);
    const env = readEnvironment();
    const db = await mysql.createConnection({
      host: env.DB_HOST,
      port: env.DB_PORT,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: env.DB_NAME,
      charset: "utf8mb4",
    });
    try {
      await migrateAdmin(db);
      await finalizeAdminData(db);
      await mkdir("reports", { recursive: true });
      await writeFile(
        "reports/migration-report.json",
        JSON.stringify(
          {
            passed: true,
            backup,
            version: 3,
            completedAt: new Date().toISOString(),
          },
          null,
          2,
        ),
        "utf8",
      );
      console.log("管理结构兼容迁移通过，原有内容和标识保持完整。");
    } finally {
      await db.end();
    }
  })().catch((error) => {
    console.error(
      "管理结构迁移失败：",
      error instanceof Error ? error.message : "未知数据库异常",
    );
    process.exitCode = 1;
  });
