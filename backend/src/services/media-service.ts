import { initializeOwnership } from "./media-ownership";
import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { RowDataPacket } from "mysql2/promise";
import {
  ManagementError,
  ResourceService,
  type EditContext,
  type ResourceRecord,
} from "./resource-service";
import type { Values } from "../../../shared/content";

const MAX_PIXELS = 40_000_000;
const MAX_BYTES = 15_000_000;
const UPLOAD_GRACE_HOURS = 24;
const decode = (value: unknown): Values =>
  typeof value === "string" ? JSON.parse(value) : (value as Values);

// 不可变文件先完整落盘，数据库提交决定当前版本，失败操作保留原有引用。
export class MediaService {
  public constructor(
    private readonly resources: ResourceService,
    private readonly mediaRoot: string,
  ) {}

  public async upload(
    file: Express.Multer.File | undefined,
    context: EditContext,
    replacement?: { id: string; version: number },
  ): Promise<ResourceRecord> {
    await initializeOwnership(this.resources.database);
    return this.withFileLock(() =>
      this.uploadLocked(file, context, replacement),
    );
  }

  private async uploadLocked(
    file: Express.Multer.File | undefined,
    context: EditContext,
    replacement?: { id: string; version: number },
  ): Promise<ResourceRecord> {
    const [duplicates] = await this.resources.database.execute<RowDataPacket[]>(
      "SELECT resource_type,resource_id FROM audit_logs WHERE operation_id=?",
      [context.operationId],
    );
    if (duplicates[0]) {
      if (
        duplicates[0].resource_type !== "media" ||
        (replacement && duplicates[0].resource_id !== replacement.id)
      )
        throw new ManagementError(409, 3004, "操作标识已用于其他资源。");
      return this.resources.get("media", String(duplicates[0].resource_id));
    }
    if (!file || file.size === 0 || file.size > MAX_BYTES)
      throw new ManagementError(
        400,
        1001,
        "图片上传失败：请选择不超过 15 MB 的有效图片。",
      );
    let bytes: Buffer;
    let width: number;
    let height: number;
    try {
      const image = sharp(file.buffer, {
        limitInputPixels: MAX_PIXELS,
        failOn: "warning",
      });
      const meta = await image.metadata();
      if (
        !["png", "jpeg", "webp"].includes(meta.format ?? "") ||
        (meta.pages ?? 1) > 1 ||
        !meta.width ||
        !meta.height ||
        meta.width > 8192 ||
        meta.height > 8192
      )
        throw new Error("格式不支持");
      if (
        !/\.(?:png|jpe?g|webp)$/iu.test(file.originalname) ||
        !["image/png", "image/jpeg", "image/webp"].includes(file.mimetype)
      )
        throw new Error("声明格式无效");
      bytes = await image.rotate().png().toBuffer();
      const output = await sharp(bytes).metadata();
      width = output.width!;
      height = output.height!;
    } catch {
      throw new ManagementError(
        415,
        3006,
        "图片上传失败：文件实际内容、扩展名或尺寸不符合 PNG、JPEG、WebP 静态图片要求，原有资源未修改。",
      );
    }
    const digest = createHash("sha256").update(bytes).digest("hex");
    const id = replacement?.id ?? randomUUID();
    const safeId = createHash("sha256").update(id).digest("hex").slice(0, 16);
    const fileName = `${safeId}-${digest}.png`;
    const destination = path.join(this.mediaRoot, fileName);
    const staging = path.resolve(this.mediaRoot, "../uploads");
    const temporary = path.join(staging, `${randomUUID()}.tmp`);
    const metadata: Values = {
      file_name: fileName,
      relative_path: `media/${fileName}`,
      mime_type: "image/png",
      file_size: bytes.length,
      width,
      height,
      sha256: digest,
    };
    await mkdir(staging, { recursive: true });
    await mkdir(this.mediaRoot, { recursive: true });
    try {
      await writeFile(temporary, bytes, { flag: "wx" });
      await rename(temporary, destination);
      await sharp(bytes)
        .resize({
          width: 320,
          height: 240,
          fit: "inside",
          withoutEnlargement: true,
        })
        .png()
        .toFile(path.join(this.mediaRoot, `thumb-${fileName}`));
      if (replacement)
        return await this.resources.replaceMedia(
          id,
          metadata,
          replacement.version,
          context,
        );
      const db = await this.resources.database.getConnection();
      await db.beginTransaction();
      try {
        await db.query("SELECT id FROM pages ORDER BY id FOR UPDATE");
        const [old] = await db.execute<RowDataPacket[]>(
          "SELECT resource_type,resource_id FROM audit_logs WHERE operation_id=?",
          [context.operationId],
        );
        if (old[0]) {
          if (old[0].resource_type !== "media")
            throw new ManagementError(409, 3004, "操作标识已用于其他资源。");
          await db.commit();
          return await this.resources.get("media", String(old[0].resource_id));
        }
        const decodedName = Array.from(file.originalname).some(
          (character) => character.codePointAt(0)! > 255,
        )
          ? file.originalname
          : Buffer.from(file.originalname, "latin1").toString("utf8");
        const originalName = decodedName.includes("\uFFFD")
          ? file.originalname
          : decodedName;
        const name =
          path
            .basename(originalName)
            .replace(/[^\p{L}\p{N}_. -]/gu, "")
            .slice(0, 70) || "上传图片";
        await db.execute(
          "INSERT INTO media_assets(id,resource_key,file_name,relative_path,mime_type,file_size,width,height,sha256,alt_text) VALUES(?,?,?,?,?,?,?,?,?,?)",
          [
            id,
            `${name} / ${id.slice(0, 8)}`,
            fileName,
            metadata.relative_path!,
            "image/png",
            bytes.length,
            width,
            height,
            digest,
            name,
          ],
        );
        await db.execute(
          "INSERT INTO media_versions(media_id,sha256,metadata_json) VALUES(?,?,?)",
          [
            id,
            digest,
            JSON.stringify({ ...metadata, alt_text: name, caption: "" }),
          ],
        );
        await db.execute("INSERT INTO media_ownership(media_id,owner_type,owner_id,field_key,claimed) VALUES(?, 'upload', ?, '',0)", [id, context.actorId]);
        const record = await this.resources.get("media", id, db);
        await db.execute(
          "INSERT INTO content_revisions(resource_type,resource_id,version,snapshot_json,actor_id,operation_id) VALUES(?,?,?,?,?,?)",
          [
            "media",
            id,
            record.version,
            JSON.stringify(record),
            context.actorId,
            context.operationId,
          ],
        );
        await db.execute(
          "INSERT INTO audit_logs(actor_id,action,resource_type,resource_id,operation_id,request_id) VALUES(?,?,?,?,?,?)",
          [
            context.actorId,
            "upload",
            "media",
            id,
            context.operationId,
            context.requestId,
          ],
        );
        await db.commit();
        return record;
      } catch (error) {
        await db.rollback();
        throw error;
      } finally {
        db.release();
      }
    } finally {
      await rm(temporary, { force: true });
    }
  }

  public async recover(): Promise<void> {
    const staging = path.resolve(this.mediaRoot, "../uploads");
    await mkdir(staging, { recursive: true });
    for (const file of await readdir(staging))
      if (file.endsWith(".tmp"))
        await rm(path.join(staging, file), { force: true });
    await this.cleanup();
    await this.verifyHistoricalFiles();
  }

  // 当前媒体和全部可恢复历史共同保护文件，清理仅移除两者均不引用的文件。
  public async cleanup(): Promise<{ removed: string[]; retained: number }> {
    return this.withFileLock(() => this.cleanupLocked());
  }
  private async cleanupLocked(): Promise<{
    removed: string[];
    retained: number;
  }> {
    await initializeOwnership(this.resources.database);
    await this.removeAbandonedUploads();
    const [rows] = await this.resources.database.query<RowDataPacket[]>(
      "SELECT file_name FROM media_assets",
    );
    const [history] = await this.resources.database.query<RowDataPacket[]>(
      "SELECT metadata_json FROM media_versions",
    );
    const keep = new Set([
      ...rows.map((r) => String(r.file_name)),
      ...history.map((r) => String(decode(r.metadata_json).file_name)),
    ]);
    const [revisions] = await this.resources.database.query<RowDataPacket[]>(
      "SELECT snapshot_json FROM content_revisions",
    );
    const collect = (value: unknown): void => {
      if (!value || typeof value !== "object") return;
      for (const [key, entry] of Object.entries(value)) {
        if (key === "file_name" && typeof entry === "string") keep.add(entry);
        else if (entry && typeof entry === "object") collect(entry);
      }
    };
    for (const revision of revisions) collect(decode(revision.snapshot_json));
    const removed: string[] = [];
    for (const name of await readdir(this.mediaRoot)) {
      const original = name.startsWith("thumb-") ? name.slice(6) : name;
      if (!keep.has(original) && /^[a-z0-9-]+\.png$/u.test(name)) {
        await rm(path.join(this.mediaRoot, name));
        removed.push(name);
      }
    }
    return { removed, retained: keep.size };
  }

  // 上传宽限期内保留未发布文件，业务数据与业务历史共同阻止过期图片被清理。
  private async removeAbandonedUploads(): Promise<void> {
    const db = await this.resources.database.getConnection();
    try {
      await db.beginTransaction();
      await db.query("SELECT id FROM pages ORDER BY id FOR UPDATE");
      const [candidates] = await db.execute<RowDataPacket[]>("SELECT m.id,m.file_name FROM media_assets m JOIN media_ownership o ON o.media_id=m.id WHERE o.claimed=0 AND m.created_at < TIMESTAMPADD(HOUR,?,CURRENT_TIMESTAMP) FOR UPDATE", [-UPLOAD_GRACE_HOURS]);
      const protectedValues: string[] = [];
      for (const table of ["site_settings", "pages", "page_sections", "products", "product_categories"]) {
        const [records] = await db.query<RowDataPacket[]>("SELECT * FROM ??", [table]);
        protectedValues.push(...records.map(record => JSON.stringify(record)));
      }
      const [revisions] = await db.query<RowDataPacket[]>("SELECT snapshot_json FROM content_revisions WHERE resource_type<>'media'");
      protectedValues.push(...revisions.map(record => JSON.stringify(record.snapshot_json)));
      for (const candidate of candidates) {
        if (protectedValues.some(value => value.includes(String(candidate.id)) || value.includes(String(candidate.file_name)))) continue;
        await db.execute("DELETE FROM content_revisions WHERE resource_type='media' AND resource_id=?", [candidate.id]);
        await db.execute("DELETE FROM media_versions WHERE media_id=?", [candidate.id]);
        await db.execute("DELETE FROM media_ownership WHERE media_id=? AND claimed=0", [candidate.id]);
        await db.execute("DELETE FROM media_assets WHERE id=?", [candidate.id]);
      }
      await db.commit();
    } catch (error) { await db.rollback(); throw error; }
    finally { db.release(); }
  }

  private async withFileLock<T>(action: () => Promise<T>): Promise<T> {
    const db = await this.resources.database.getConnection();
    let lockName = "";
    let locked = false;
    try {
      const [names] = await db.query<RowDataPacket[]>(
        "SELECT DATABASE() AS name",
      );
      lockName = String(names[0]!.name) + ":media-files";
      const [result] = await db.execute<RowDataPacket[]>(
        "SELECT GET_LOCK(?,10) AS acquired",
        [lockName],
      );
      locked = Number(result[0]!.acquired) === 1;
      if (!locked)
        throw new ManagementError(
          409,
          3004,
          "媒体文件正在处理，请保留输入后重试。",
        );
      return await action();
    } finally {
      if (locked) await db.execute("SELECT RELEASE_LOCK(?)", [lockName]);
      db.release();
    }
  }

  public async verifyHistoricalFiles(): Promise<void> {
    const [rows] = await this.resources.database.query<RowDataPacket[]>(
      "SELECT metadata_json FROM media_versions",
    );
    for (const row of rows) {
      const data = decode(row.metadata_json);
      const full = path.join(
        this.mediaRoot,
        path.basename(String(data.file_name)),
      );
      const bytes = await readFile(full);
      if (createHash("sha256").update(bytes).digest("hex") !== data.sha256)
        throw new Error("媒体历史文件哈希校验失败。");
    }
  }
}
