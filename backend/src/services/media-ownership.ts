import { ENTITIES } from "./resource-definitions";
import { ManagementError, ResourceService } from "./resource-service";
import { randomUUID, createHash } from "node:crypto";
import { copyFile, readFile } from "node:fs/promises";
import path from "node:path";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { getValue, setValue, type ResourceRecord, type Values } from "../../../shared/content";

const initialized = new WeakMap<Pool, Promise<void>>();
export function initializeOwnership(database: Pool): Promise<void> {
  let pending = initialized.get(database);
  if (!pending) {
    pending = database.query(`CREATE TABLE IF NOT EXISTS media_ownership (
      media_id VARCHAR(96) PRIMARY KEY, owner_type VARCHAR(24) NOT NULL,
      owner_id VARCHAR(96) NOT NULL, field_key VARCHAR(240) NOT NULL, claimed TINYINT(1) NOT NULL DEFAULT 1
    ) CHARACTER SET utf8mb4`).then(async () => {
      const [columns] = await database.query<RowDataPacket[]>("SHOW COLUMNS FROM media_ownership LIKE 'claimed'");
      if (!columns.length) await database.query("ALTER TABLE media_ownership ADD COLUMN claimed TINYINT(1) NOT NULL DEFAULT 1");
    });
    initialized.set(database, pending);
  }
  return pending;
}
// 每张上传图片只属于一个对象的一个字段，相册项目共享字段归属并允许排序。
export function mediaFields(record: ResourceRecord, values: Values) {
  return record.fields.flatMap(field => {
    const value = getValue(values, field.key);
    if (field.kind === "image" && typeof value === "string" && value)
      return [{ field: field.key, id: value, icon: false }];
    if (field.kind === "icon" && typeof value === "string" && value.startsWith("media:"))
      return [{ field: field.key, id: value.slice(6), icon: true }];
    if (field.key === "gallery_json" && Array.isArray(value))
      return value.filter((id): id is string => typeof id === "string" && !!id).map(id => ({ field: field.key, id, icon: false }));
    return [];
  });
}
export async function claimMedia(db: PoolConnection, record: ResourceRecord, values: Values, actorId?: string): Promise<void> {
  const entries = mediaFields(record, values);
  const seen = new Set<string>();
  for (const item of entries) {
    if (seen.has(item.id)) throw new ManagementError(400, 1001, "同一媒体不能用于多个位置，请分别上传。");
    seen.add(item.id);
    const [rows] = await db.execute<RowDataPacket[]>("SELECT * FROM media_ownership WHERE media_id=? FOR UPDATE", [item.id]);
    let owner = rows[0];
    if (owner?.owner_type === "upload" && owner.owner_id === actorId && (!owner.field_key || owner.field_key === `${record.type}:${item.field}`)) {
      await db.execute("UPDATE media_ownership SET owner_type=?,owner_id=?,field_key=? WHERE media_id=?", [record.type, record.id, item.field, item.id]);
      owner = { owner_type: record.type, owner_id: record.id, field_key: item.field } as RowDataPacket;
    }
    if (!owner) throw new ManagementError(400, 1001, "媒体没有当前上传归属，请重新上传。");
    if (owner.owner_type !== record.type || owner.owner_id !== record.id || owner.field_key !== item.field)
      throw new ManagementError(400, 1001, "该媒体属于其他使用位置，请在当前字段重新上传。");
    await db.execute("UPDATE media_ownership SET claimed=1 WHERE media_id=? AND claimed=0", [item.id]);
  }
}
export async function cloneMedia(db: PoolConnection, id: string, root: string): Promise<string> {
  const [rows] = await db.query<RowDataPacket[]>("SELECT * FROM media_assets WHERE id=?", [id]);
  if (!rows[0]) throw new Error("媒体文件记录不存在。");
  const row = { ...rows[0] };
  const bytes = await readFile(path.join(root, String(row.file_name)));
  if (createHash("sha256").update(bytes).digest("hex") !== row.sha256) throw new Error("媒体文件校验失败。");
  const newId = randomUUID();
  const name = `${newId}-${row.sha256}.png`;
  await copyFile(path.join(root, String(row.file_name)), path.join(root, name));
  row.id = newId; row.resource_key = `${String(row.resource_key).slice(0, 50)} / ${newId}`;
  row.file_name = name; row.relative_path = `media/${name}`;
  const columns = Object.keys(row);
  await db.query(`INSERT INTO media_assets (${columns.map(() => "??").join(",")}) VALUES (${columns.map(() => "?").join(",")})`, [...columns, ...columns.map(key => row[key])]);
  await db.execute("INSERT INTO media_versions(media_id,sha256,metadata_json) VALUES(?,?,?)", [newId, row.sha256, JSON.stringify(row)]);
  return newId;
}
export async function isolateRecordMedia(db: PoolConnection, record: ResourceRecord, root: string): Promise<Values> {
  const values = structuredClone(record.values);
  const seen = new Set<string>();
  for (const item of mediaFields(record, record.values)) {
    const [owners] = await db.execute<RowDataPacket[]>("SELECT * FROM media_ownership WHERE media_id=?", [item.id]);
    const owner = owners[0];
    if (seen.has(item.id) || !owner || owner.owner_type !== record.type || owner.owner_id !== record.id || owner.field_key !== item.field) {
      const replacement = await cloneMedia(db, item.id, root);
      if (item.field === "gallery_json") {
        const gallery = values.gallery_json as string[];
        gallery[gallery.indexOf(item.id)] = replacement;
      }
      else setValue(values, item.field, item.icon ? "media:" + replacement : replacement);
    }
    seen.add(item.id);
  }
  for (const item of mediaFields(record, values))
    await db.execute("INSERT IGNORE INTO media_ownership(media_id,owner_type,owner_id,field_key) VALUES(?,?,?,?)", [item.id, record.type, record.id, item.field]);
  await claimMedia(db, record, values);
  return values;
}

// 默认初始化与既有数据迁移使用相同事务和媒体拆分规则。
export async function isolateAllMedia(pool: Pool, root: string): Promise<string[]> {
  await initializeOwnership(pool);
  const service = new ResourceService(pool);
  const db = await pool.getConnection();
  const changes: string[] = [];
  try {
    await db.beginTransaction();
    await db.query("SELECT id FROM pages ORDER BY id FOR UPDATE");
    for (const type of ["settings", "pages", "sections", "products", "categories"] as const)
      for (const record of await service.list(type, "", true)) {
        const values = await isolateRecordMedia(db, record, root);
        if (JSON.stringify(values) === JSON.stringify(record.values)) continue;
        const entity = ENTITIES[type];
        const columns = entity.columns as readonly string[];
        const args = columns.flatMap(key => [key, (entity.json as readonly string[]).includes(key) ? JSON.stringify(values[key]) : values[key]]);
        await db.query(`UPDATE ?? SET ${columns.map(() => "??=?").join(",")} WHERE ??=?`, [entity.table, ...args, entity.id, record.id]);
        changes.push(`${type}/${record.id}`);
      }
    await db.commit();
    return changes;
  } catch (error) { await db.rollback(); throw error; }
  finally { db.release(); }
}
