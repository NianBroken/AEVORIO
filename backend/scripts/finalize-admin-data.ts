import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { readEnvironment } from "../src/config/env";
import { createDatabasePool, closeDatabasePool } from "../src/database/pool";

// 浏览器图标保存为经过 Sharp 解码的本地位图，配置引用与其他媒体一致。
export async function finalizeAdminData(
  db: import("mysql2/promise").Pool | import("mysql2/promise").Connection,
): Promise<void> {
  const [mediaIndexes] = await db.query<
    import("mysql2/promise").RowDataPacket[]
  >("SHOW INDEX FROM media_assets");
  for (const [oldName, newName, column] of [
    ["uq_media_filename", "idx_media_filename", "file_name"],
    ["uq_media_relative_path", "idx_media_relative_path", "relative_path"],
  ])
    if (mediaIndexes.some((i) => i.Key_name === oldName)) {
      await db.query(
        "ALTER TABLE media_assets DROP INDEX ??, ADD INDEX ??(??)",
        [oldName, newName, column],
      );
    }
  const [indexes] = await db.query<import("mysql2/promise").RowDataPacket[]>(
    "SHOW INDEX FROM products",
  );
  if (indexes.some((i) => i.Key_name === "uq_products_media")) {
    if (!indexes.some((i) => i.Key_name === "idx_products_media"))
      await db.query(
        "ALTER TABLE products ADD KEY idx_products_media(primary_media_id)",
      );
    await db.query("ALTER TABLE products DROP INDEX uq_products_media");
  }
  const [configured] = await db.query<import("mysql2/promise").RowDataPacket[]>(
    "SELECT id FROM media_assets WHERE id=?",
    ["site-favicon"],
  );
  if (!configured.length) {
    const source = await readFile(
      path.resolve("storage/source-icons/site-icon.svg"),
    );
    const png = await sharp(source).resize(128, 128).png().toBuffer();
    const file = "site-favicon.png";
    await writeFile(path.resolve("storage/media", file), png, { flag: "wx" });
    const hash = createHash("sha256").update(png).digest("hex");
    await db.execute(
      "INSERT INTO media_assets(id,resource_key,file_name,relative_path,mime_type,file_size,width,height,sha256,alt_text) VALUES(?,?,?,?,?,?,?,?,?,?)",
      [
        "site-favicon",
        "浏览器站点图标",
        file,
        "media/" + file,
        "image/png",
        png.length,
        128,
        128,
        hash,
        "网站电路板图标",
      ],
    );
    const [rows] = await db.query<import("mysql2/promise").RowDataPacket[]>(
      "SELECT * FROM media_assets WHERE id=?",
      ["site-favicon"],
    );
    await db.execute(
      "INSERT INTO media_versions(media_id,sha256,metadata_json) VALUES(?,?,?)",
      ["site-favicon", hash, JSON.stringify(rows[0])],
    );
    await db.execute(
      "UPDATE site_settings SET setting_value=JSON_SET(setting_value,'$.favicon',?) WHERE setting_key='public_content'",
      ["site-favicon"],
    );
  }
  await db.execute(
    "UPDATE page_sections SET content_json=JSON_SET(content_json,'$.note',?) WHERE section_type='hero' AND JSON_EXTRACT(content_json,'$.note') IS NULL",
    ["DESIGN / CIRCUIT / PRACTICE"],
  );
  await db.execute("INSERT IGNORE INTO schema_versions(version) VALUES(2),(3)");
  console.log("媒体复用索引与可编辑站点图标已就绪。");
}
if (require.main === module)
  void (async () => {
    const db = createDatabasePool(readEnvironment());
    try {
      await finalizeAdminData(db);
    } finally {
      await closeDatabasePool();
    }
  })().catch((error) => {
    console.error(error instanceof Error ? error.message : "数据检查未完成。");
    process.exitCode = 1;
  });
