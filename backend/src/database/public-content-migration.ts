import type { Pool, RowDataPacket } from "mysql2/promise";

// 缺失的公开署名继承现有项目署名，已保存的文字和空值均保持不变。
export async function migratePublicContent(database: Pool): Promise<void> {
  const [rows] = await database.query<RowDataPacket[]>("SELECT setting_key,setting_value FROM site_settings WHERE setting_key IN ('project_name','author')");
  const values = Object.fromEntries(rows.map((row) => [row.setting_key, typeof row.setting_value === "string" ? JSON.parse(row.setting_value) : row.setting_value]));
  const attribution = [values.project_name, values.author].filter((value) => typeof value === "string" && value.length).join(" / ");
  await database.execute("UPDATE site_settings SET setting_value=JSON_SET(setting_value,'$.footerAttribution',?),version=version+1 WHERE setting_key='public_content' AND JSON_CONTAINS_PATH(setting_value,'one','$.footerAttribution')=0", [attribution]);
}
