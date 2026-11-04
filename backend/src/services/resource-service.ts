import { initializeOwnership, claimMedia, isolateRecordMedia, mediaFields } from "./media-ownership";
import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { ENTITIES, fieldsFor, sectionDefaults } from "./resource-definitions";
import {
  PROTECTED_SECTION_TYPES,
  REVISION_PAGE_SIZE,
} from "../../../shared/content";
import {
  getValue,
  setValue,
  ICON_NAMES,
  RESOURCE_NAMES,
  type JsonValue,
  type ResourceType,
  type Values,
  type ResourceRecord,
} from "../../../shared/content";
export type { ResourceRecord } from "../../../shared/content";

export class ManagementError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: number,
    message: string,
  ) {
    super(message);
  }
}
export interface EditContext {
  actorId: string;
  requestId: string;
  operationId: string;
}
export interface EditRequest {
  version: number;
  changes: Values;
}
type Connection = Pool | PoolConnection;
type RevisionSnapshot = ResourceRecord & {
  mediaSnapshots?: Record<string, Values>;
};
const jsonParse = (value: unknown): JsonValue =>
  typeof value === "string" ? JSON.parse(value) : (value as JsonValue);

// 统一资源服务协调权限之外的业务约束、事务、乐观并发、版本与引用关系。
export class ResourceService {
  public constructor(public readonly database: Pool, private readonly mediaRoot = path.resolve("storage/media")) {}
  public async list(
    type: ResourceType,
    query = "",
    includeDeleted = false,
  ): Promise<ResourceRecord[]> {
    const entity = ENTITIES[type];
    const [rows] =
      type === "sections"
        ? await this.database.execute<RowDataPacket[]>(
            "SELECT s.* FROM page_sections s WHERE (?=1 OR s.is_deleted=0) AND (s.section_type<>'product-matrix' OR EXISTS(SELECT 1 FROM product_categories c WHERE c.id=s.category_id AND c.is_deleted=0)) ORDER BY s.id",
            [includeDeleted ? 1 : 0],
          )
        : await this.database.query<RowDataPacket[]>(
            "SELECT * FROM ?? ORDER BY ??",
            [entity.table, entity.id],
          );
    const allowed = rows.filter(
      (r) =>
        (type !== "settings" ||
          ["company_name", "public_content"].includes(r.setting_key)) &&
        (includeDeleted || !r.is_deleted),
    );
    return allowed
      .map((row) => this.map(type, row))
      .filter(
        (r) =>
          !query ||
          JSON.stringify(r.values)
            .toLocaleLowerCase()
            .includes(query.toLocaleLowerCase()),
      );
  }
  public async get(
    type: ResourceType,
    id: string,
    db: Connection = this.database,
  ): Promise<ResourceRecord> {
    if (type === "settings" && !["company_name", "public_content"].includes(id))
      throw new ManagementError(
        403,
        3003,
        "当前配置属于固定项目身份，不允许通过内容管理修改。",
      );
    const entity = ENTITIES[type];
    const [rows] = await db.query<RowDataPacket[]>(
      "SELECT * FROM ?? WHERE ??=? LIMIT 1",
      [entity.table, entity.id, id],
    );
    if (!rows[0])
      throw new ManagementError(
        404,
        1002,
        "未找到指定管理对象，请重新读取列表。",
      );
    const record = this.map(type, rows[0]);
    if (type !== "media")
      record.relatedMedia = await Promise.all([...new Set(mediaFields(record, record.values).map(item => item.id))].map(id => this.get("media", id, db)));
    return record;
  }
  private map(type: ResourceType, row: RowDataPacket): ResourceRecord {
    const entity = ENTITIES[type];
    const values: Values = {};
    for (const column of entity.columns)
      values[column] = (entity.json as readonly string[]).includes(column)
        ? jsonParse(row[column])
        : (row[column] as JsonValue);
    for (const key of ["is_visible", "is_demo"])
      if (key in values) values[key] = Boolean(values[key]);
    return {
      id: String(row[entity.id]),
      type,
      title:
        type === "settings"
          ? row.setting_key === "company_name"
            ? "公司名称"
            : "全站展示内容"
          : String(row[entity.title]),
      version: Number(row.version),
      deleted: Boolean(row.is_deleted),
      values,
      fields: fieldsFor(type, values),
      references: [],
    };
  }
  public async references(
    id: string,
    db: Connection = this.database,
  ): Promise<ResourceRecord["references"]> {
    const result: ResourceRecord["references"] = [];
    for (const type of [
      "sections",
      "products",
      "categories",
      "pages",
      "settings",
    ] as const) {
      const entity = ENTITIES[type];
      const [rows] = await db.query<RowDataPacket[]>("SELECT * FROM ??", [
        entity.table,
      ]);
      for (const row of rows) {
        const record = this.map(type, row);
        if (
          (JSON.stringify(record.values).includes(`"${id}"`) ||
            JSON.stringify(record.values).includes(`"media:${id}"`)) &&
          !row.is_deleted
        )
          result.push({ type, id: record.id, title: record.title });
      }
    }
    return result;
  }
  public async revisions(
    type: ResourceType,
    id: string,
    page = 1,
  ): Promise<RowDataPacket[]> {
    const [rows] = await this.database.query<RowDataPacket[]>(
      "SELECT r.id,r.version,r.snapshot_json,r.created_at,u.username FROM content_revisions r LEFT JOIN admin_users u ON u.id=r.actor_id WHERE resource_type=? AND resource_id=? ORDER BY r.id DESC LIMIT ? OFFSET ?",
      [type, id, REVISION_PAGE_SIZE, (page - 1) * REVISION_PAGE_SIZE],
    );
    return rows.map((row) => ({
      ...row,
      snapshot_json: jsonParse(row.snapshot_json),
    })) as RowDataPacket[];
  }
  // 所有可改变页面有效性的操作先锁住页面行，避免跨对象并发绕过板块数量检查。
  public async save(
    type: ResourceType,
    id: string,
    request: EditRequest,
    context: EditContext,
    action = "publish",
    deleted?: boolean,
    pins?: Record<string, Values>,
  ): Promise<ResourceRecord> {
    await initializeOwnership(this.database);
    const db = await this.database.getConnection();
    await db.beginTransaction();
    try {
      await db.query("SELECT id FROM pages ORDER BY id FOR UPDATE");
      const [duplicates] = await db.execute<RowDataPacket[]>(
        "SELECT resource_type,resource_id FROM audit_logs WHERE operation_id=?",
        [context.operationId],
      );
      if (duplicates[0]) {
        if (
          duplicates[0].resource_type !== type ||
          duplicates[0].resource_id !== id
        )
          throw new ManagementError(
            409,
            3004,
            "操作标识已用于其他对象，请重新提交。",
          );
        await db.commit();
        return await this.get(type, id);
      }
      const old = await this.get(type, id, db);
      if (old.version !== request.version)
        throw new ManagementError(
          409,
          3004,
          "保存被拒绝：该对象已被其他操作修改，请重新读取最新版本后比较内容。",
        );
      if (
        type === "sections" &&
        Object.hasOwn(request.changes, "section_type") &&
        PROTECTED_SECTION_TYPES.has(
          String(request.changes.section_type ?? ""),
        )
      )
        throw new ManagementError(400, 1001, "系统模块类型不能用于自定义模块。");
      if (
        type === "sections" &&
        deleted &&
        PROTECTED_SECTION_TYPES.has(String(old.values.section_type))
      )
        throw new ManagementError(400, 1001, "系统模块不能单独删除。");
      let values = structuredClone(old.values);
      for (const key of Object.keys(request.changes))
        if (!old.fields.some((f) => f.key === key && !f.readonly))
          throw new ManagementError(
            400,
            1001,
            `字段 ${key} 不属于当前对象的可编辑范围。`,
          );
      for (const [key, value] of Object.entries(request.changes))
        setValue(values, key, value);
      if (pins) {
        await this.restoreReferences(db, values, pins);
        values = await isolateRecordMedia(db, { ...old, values }, this.mediaRoot);
      }
      const validated = pins
        ? Object.fromEntries(
            old.fields
              .filter((f) => !f.readonly)
              .map((f) => [f.key, getValue(values, f.key) ?? null]),
          )
        : request.changes;
      await this.validateChanges(type, old, validated, db);
      if (type !== "media") await claimMedia(db, old, values, context.actorId);
      for (const key of ["media_id", "og_media_id"])
        if (values[key] === "") values[key] = null;
      await this.record(db, old, context);
      const entity = ENTITIES[type];
      const columns = entity.columns as readonly string[];
      const assignments = columns.map(() => "??=?");
      const parameters: unknown[] = [];
      for (const column of columns)
        parameters.push(
          column,
          (entity.json as readonly string[]).includes(column)
            ? JSON.stringify(values[column])
            : values[column],
        );
      if (deleted !== undefined) {
        if (["settings", "pages"].includes(type))
          throw new ManagementError(
            400,
            1001,
            "固定页面和全站配置不支持删除。",
          );
        assignments.push("is_deleted=?");
        parameters.push(deleted);
      }
      await db.query(
        `UPDATE ?? SET ${assignments.join(",")},version=version+1 WHERE ??=? AND version=?`,
        [entity.table, ...parameters, entity.id, id, request.version],
      );
      if (type === "categories" && deleted) {
        const [products] = await db.execute<RowDataPacket[]>(
          "SELECT id FROM products WHERE category_id=? AND is_deleted=0 LIMIT 1",
          [id],
        );
        if (products.length)
          throw new ManagementError(
            409,
            3005,
            "类别仍有关联产品，请先将产品移动到其他类别。",
          );
      }
      if (type === "categories" && deleted !== undefined)
        await this.setCategorySectionsDeleted(db, id, deleted, context);
      if (type === "media" && deleted) {
        if ((await this.references(id, db)).length)
          throw new ManagementError(
            409,
            3005,
            "媒体仍被页面或产品引用，删除未执行，请先更换对应引用。",
          );
      }
      await this.assertSiteIntegrity(db);
      const current = await this.get(type, id, db);
      await this.record(db, current, context);
      await db.execute(
        "INSERT INTO audit_logs(actor_id,action,resource_type,resource_id,operation_id,request_id) VALUES(?,?,?,?,?,?)",
        [
          context.actorId,
          action,
          type,
          id,
          context.operationId,
          context.requestId,
        ],
      );
      await db.commit();
      return current;
    } catch (error) {
      await db.rollback();
      throw this.translate(error);
    } finally {
      db.release();
    }
  }
  public async restore(
    type: ResourceType,
    id: string,
    revisionId: number,
    version: number,
    context: EditContext,
  ): Promise<ResourceRecord> {
    const [rows] = await this.database.execute<RowDataPacket[]>(
      "SELECT snapshot_json FROM content_revisions WHERE id=? AND resource_type=? AND resource_id=?",
      [revisionId, type, id],
    );
    if (!rows[0])
      throw new ManagementError(404, 1002, "历史版本不存在或不属于当前对象。");
    const snapshot = jsonParse(
      rows[0].snapshot_json,
    ) as unknown as RevisionSnapshot;
    const current = await this.get(type, id);
    const changes: Values = {};
    for (const field of current.fields)
      if (!field.readonly) {
        const value = getValue(snapshot.values, field.key);
        if (value !== undefined) changes[field.key] = value;
      }
    // 媒体恢复只切换已校验并保留的文件版本，不接受外部路径。
    if (type === "media")
      return this.restoreMedia(id, snapshot, version, context);
    return this.save(
      type,
      id,
      { version, changes },
      context,
      "restore",
      ["settings", "pages"].includes(type) ? undefined : snapshot.deleted,
      snapshot.mediaSnapshots,
    );
  }
  private async restoreMedia(
    id: string,
    snapshot: ResourceRecord,
    version: number,
    context: EditContext,
  ): Promise<ResourceRecord> {
    const hash = String(snapshot.values.sha256);
    const [known] = await this.database.execute<RowDataPacket[]>(
      "SELECT id FROM media_versions WHERE media_id=? AND sha256=?",
      [id, hash],
    );
    if (!known.length)
      throw new ManagementError(
        409,
        3005,
        "历史媒体文件版本不存在，当前内容保持不变。",
      );
    return this.replaceMedia(id, snapshot.values, version, context, "restore");
  }
  public async replaceMedia(
    id: string,
    file: Values,
    version: number,
    context: EditContext,
    action = "replace",
  ): Promise<ResourceRecord> {
    await initializeOwnership(this.database);
    const db = await this.database.getConnection();
    await db.beginTransaction();
    try {
      await db.query("SELECT id FROM pages ORDER BY id FOR UPDATE");
      const [duplicate] = await db.execute<RowDataPacket[]>(
        "SELECT resource_type,resource_id FROM audit_logs WHERE operation_id=?",
        [context.operationId],
      );
      if (duplicate[0]) {
        if (
          duplicate[0].resource_type !== "media" ||
          duplicate[0].resource_id !== id
        )
          throw new ManagementError(409, 3004, "操作标识已用于其他资源。");
        await db.commit();
        return await this.get("media", id);
      }
      const old = await this.get("media", id, db);
      if (old.version !== version)
        throw new ManagementError(
          409,
          3004,
          "媒体版本已变化，请重新读取后替换。",
        );
      const [existingVersion] = await db.execute<RowDataPacket[]>(
        "SELECT metadata_json FROM media_versions WHERE media_id=? AND sha256=?",
        [id, file.sha256!],
      );
      if (existingVersion[0]) {
        const known = jsonParse(existingVersion[0].metadata_json) as Values;
        file = {
          ...file,
          file_name: known.file_name!,
          relative_path: known.relative_path!,
        };
      }
      await this.record(db, old, context);
      const keys = [
        "file_name",
        "relative_path",
        "mime_type",
        "file_size",
        "width",
        "height",
        "sha256",
        "alt_text",
        "caption",
      ];
      const values = {
        ...old.values,
        ...Object.fromEntries(
          keys.filter((k) => file[k] !== undefined).map((k) => [k, file[k]!]),
        ),
      };
      await db.query(
        `UPDATE media_assets SET ${keys.map(() => "??=?").join(",")},version=version+1,is_deleted=? WHERE id=?`,
        [
          ...keys.flatMap((k) => [k, values[k]]),
          action === "restore" ? false : old.deleted,
          id,
        ],
      );
      await db.execute(
        "INSERT IGNORE INTO media_versions(media_id,sha256,metadata_json) VALUES(?,?,?)",
        [id, values.sha256!, JSON.stringify(values)],
      );
      const current = await this.get("media", id, db);
      await this.record(db, current, context);
      await db.execute(
        "INSERT INTO audit_logs(actor_id,action,resource_type,resource_id,operation_id,request_id) VALUES(?,?,?,?,?,?)",
        [
          context.actorId,
          action,
          "media",
          id,
          context.operationId,
          context.requestId,
        ],
      );
      await db.commit();
      return current;
    } catch (error) {
      await db.rollback();
      throw this.translate(error);
    } finally {
      db.release();
    }
  }
  private async record(
    db: PoolConnection,
    resource: ResourceRecord,
    context: EditContext,
  ): Promise<void> {
    const snapshot: RevisionSnapshot = { ...resource, mediaSnapshots: {} };
    const [media] = await db.query<RowDataPacket[]>(
      "SELECT * FROM media_assets",
    );
    const serialized = JSON.stringify(resource.values);
    for (const row of media)
      if (
        serialized.includes(`"${row.id}"`) ||
        serialized.includes(`"media:${row.id}"`)
      )
        snapshot.mediaSnapshots![String(row.id)] = this.map(
          "media",
          row,
        ).values;
    await db.execute(
      "INSERT IGNORE INTO content_revisions(resource_type,resource_id,version,snapshot_json,actor_id,operation_id) VALUES(?,?,?,?,?,?)",
      [
        resource.type,
        resource.id,
        resource.version,
        JSON.stringify(snapshot),
        context.actorId,
        context.operationId,
      ],
    );
  }
  private async setCategorySectionsDeleted(
    db: PoolConnection,
    categoryId: string,
    deleted: boolean,
    context: EditContext,
  ): Promise<void> {
    const [rows] = await db.execute<RowDataPacket[]>(
      "SELECT * FROM page_sections WHERE section_type='product-matrix' AND category_id=? AND is_deleted<>?",
      [categoryId, deleted],
    );
    for (const row of rows) {
      const id = String(row.id);
      const current = this.map("sections", row);
      await this.record(db, current, context);
      await db.execute(
        "UPDATE page_sections SET is_deleted=?,version=version+1 WHERE id=? AND version=?",
        [deleted, id, current.version],
      );
      await this.record(db, await this.get("sections", id, db), context);
    }
  }
  // 历史图片按当前对象的字段归属恢复，其他对象的媒体保持不变。
  private async restoreReferences(
    db: PoolConnection,
    values: Values,
    pins: Record<string, Values>,
  ): Promise<void> {
    const replacements = new Map<string, string>();
    for (const [id, metadata] of Object.entries(pins)) {
      const current = await this.get("media", id, db);
      if (!current.deleted && current.values.sha256 === metadata.sha256)
        continue;
      const [known] = await db.execute<RowDataPacket[]>(
        "SELECT id FROM media_versions WHERE media_id=? AND sha256=?",
        [id, metadata.sha256!],
      );
      if (!known.length)
        throw new ManagementError(
          409,
          3005,
          "历史图片文件版本缺失，恢复未发布。",
        );
      const copyId = randomUUID();
      const columns = ENTITIES.media.columns;
      const copy: Values = {
        ...metadata,
        resource_key: "恢复图片 / " + copyId,
      };
      await db.query(
        `INSERT INTO media_assets(id,${columns.map(() => "??").join(",")}) VALUES(?,${columns.map(() => "?").join(",")})`,
        [...columns, copyId, ...columns.map((k) => copy[k] ?? "")],
      );
      await db.execute(
        "INSERT INTO media_versions(media_id,sha256,metadata_json) VALUES(?,?,?)",
        [copyId, metadata.sha256!, JSON.stringify(copy)],
      );
      replacements.set(id, copyId);
    }
    const replace = (value: JsonValue): JsonValue => {
      if (typeof value === "string")
        return (
          replacements.get(value) ??
          (value.startsWith("media:") && replacements.has(value.slice(6))
            ? "media:" + replacements.get(value.slice(6))
            : value)
        );
      if (Array.isArray(value)) return value.map(replace);
      if (value && typeof value === "object")
        return Object.fromEntries(
          Object.entries(value).map(([k, v]) => [k, replace(v)]),
        );
      return value;
    };
    for (const [key, value] of Object.entries(values))
      values[key] = replace(value);
  }
  public async assertSiteIntegrity(db: Connection): Promise<void> {
    const [pages] = await db.query<
      RowDataPacket[]
    >(`SELECT p.slug,COUNT(s.id) AS total FROM pages p LEFT JOIN page_sections s ON s.page_id=p.id AND s.is_visible=1 AND s.is_deleted=0
      AND (s.section_type<>'product-matrix' OR EXISTS(SELECT 1 FROM product_categories c WHERE c.id=s.category_id AND c.is_visible=1 AND c.is_deleted=0)) GROUP BY p.id,p.slug`);
    if (pages.length !== 3 || pages.some((p) => Number(p.total) < 10))
      throw new ManagementError(
        409,
        3005,
        "保存被拒绝：此次操作会使公开页面少于十个有效板块，原有内容未改变。",
      );
    const [invalid] = await db.query<
      RowDataPacket[]
    >(`SELECT p.id FROM products p LEFT JOIN product_categories c ON c.id=p.category_id LEFT JOIN media_assets m ON m.id=p.primary_media_id
      WHERE p.is_deleted=0 AND (c.id IS NULL OR c.is_deleted=1 OR m.id IS NULL OR m.is_deleted=1) LIMIT 1`);
    if (invalid.length)
      throw new ManagementError(
        409,
        3005,
        "产品必须关联有效类别和主图，本次保存未发布。",
      );
  }
  private async validateChanges(
    type: ResourceType,
    current: ResourceRecord,
    changes: Values,
    db: Connection,
  ): Promise<void> {
    for (const [key, value] of Object.entries(changes)) {
      const field = current.fields.find((f) => f.key === key);
      if (!field || field.readonly)
        throw new ManagementError(
          400,
          1001,
          `字段 ${key} 不属于当前对象的可编辑范围。`,
        );
      const fail = () => {
        throw new ManagementError(
          400,
          1001,
          `${field.label}的内容不符合要求，请检查类型、长度和可选范围。`,
        );
      };
      if (field.kind === "boolean") {
        if (typeof value !== "boolean") fail();
      } else if (field.kind === "number") {
        if (
          typeof value !== "number" ||
          !Number.isInteger(value) ||
          value < 0 ||
          value > 65535
        )
          fail();
      } else if (field.kind === "list") {
        if (!Array.isArray(value) || value.length > (field.max ?? 30)) fail();
        const list = value as JsonValue[];
        const ids = new Set<string>();
        for (const item of list) {
          if (typeof item === "string") {
            if (key !== "gallery_json" || item.length > 400) fail();
          } else if (
            item &&
            typeof item === "object" &&
            !Array.isArray(item) &&
            typeof item.id === "string" &&
            typeof item.text === "string"
          ) {
            if (
              item.id.length > 96 ||
              item.text.length > 400 ||
              ids.has(item.id)
            )
              fail();
            ids.add(item.id);
          } else fail();
        }
        if (key === "gallery_json")
          for (const mediaId of list) {
            const [rows] = await db.execute<RowDataPacket[]>(
              "SELECT id FROM media_assets WHERE id=? AND is_deleted=0",
              [mediaId],
            );
            if (typeof mediaId !== "string" || !rows.length) fail();
          }
      } else {
        if (value === null && !field.required) continue;
        if (
          typeof value !== "string" ||
          value.length > (field.max ?? 240) ||
          (field.required && !value.trim())
        )
          fail();
        const text = value as string;
        if (
          field.kind === "icon" &&
          !ICON_NAMES.includes(text) &&
          !text.startsWith("media:")
        )
          fail();
        if (
          field.kind === "color" &&
          text !== "" &&
          !/^#[0-9a-f]{6}$/iu.test(text)
        )
          fail();
        if (field.kind === "select" && !field.options?.includes(text)) fail();
        if (
          field.kind === "link" &&
          text !== "" &&
          !/^(?:\/(?:products|about)?(?:#[\w-]+)?|#[\w-]+|https:\/\/[^\s<>]+|mailto:[^\s<>]+|tel:[+\d -]+)$/u.test(
            text,
          )
        )
          fail();
        if (field.kind === "image" && text) {
          const [rows] = await db.execute<RowDataPacket[]>(
            "SELECT id FROM media_assets WHERE id=? AND is_deleted=0",
            [text],
          );
          if (!rows.length) fail();
        }
        if (field.kind === "icon" && text.startsWith("media:")) {
          const [rows] = await db.execute<RowDataPacket[]>(
            "SELECT id FROM media_assets WHERE id=? AND is_deleted=0",
            [text.slice(6)],
          );
          if (!rows.length) fail();
        }
        if (key === "category_id" && text) {
          const [rows] = await db.execute<RowDataPacket[]>(
            "SELECT id FROM product_categories WHERE id=? AND is_deleted=0",
            [text],
          );
          if (!rows.length) fail();
        }
      }
    }
    if (
      type === "settings" &&
      current.id === "company_name" &&
      Object.values(changes).some((v) => typeof v !== "string")
    )
      throw new ManagementError(400, 1001, "公司名称必须是文字。");
  }
  private translate(error: unknown): unknown {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      ["ER_DUP_ENTRY", "ER_NO_REFERENCED_ROW_2"].includes(String(error.code))
    )
      return new ManagementError(
        409,
        3005,
        "保存被拒绝：标识重复或关联对象不存在，请检查后重试。",
      );
    return error;
  }
  public async create(
    type: ResourceType,
    values: Values,
    context: EditContext,
  ): Promise<ResourceRecord> {
    if (!["products", "categories", "sections"].includes(type))
      throw new ManagementError(
        400,
        1001,
        "此类型不允许直接创建，请使用对应的上传或编辑入口。",
      );
    const entity = ENTITIES[type];
    const id = type === "sections" ? null : randomUUID();
    await initializeOwnership(this.database);
    const db = await this.database.getConnection();
    await db.beginTransaction();
    try {
      await db.query("SELECT id FROM pages ORDER BY id FOR UPDATE");
      const [previous] = await db.execute<RowDataPacket[]>(
        "SELECT resource_type,resource_id FROM audit_logs WHERE operation_id=?",
        [context.operationId],
      );
      if (previous[0]) {
        if (previous[0].resource_type !== type)
          throw new ManagementError(409, 3004, "操作标识已用于其他资源。");
        await db.commit();
        return await this.get(type, String(previous[0].resource_id));
      }
      const columns = entity.columns as readonly string[];
      for (const key of Object.keys(values))
        if (!columns.includes(key))
          throw new ManagementError(400, 1001, "创建内容包含不支持的字段。");
      const mandatory =
        type === "products"
          ? ["name", "category_id", "primary_media_id", "description"]
          : type === "categories"
            ? ["name", "description"]
            : ["title", "description", "page_id", "section_type"];
      for (const key of mandatory)
        if (
          values[key] === undefined ||
          values[key] === null ||
          String(values[key]).trim() === ""
        )
          throw new ManagementError(
            400,
            1001,
            `创建内容缺少必填字段：${key}。`,
          );
      if (type === "products")
        values = {
          slug: id!,
          model: "",
          subtitle: "",
          specifications_json: [],
          features_json: [],
          tags_json: [],
          gallery_json: [],
          icon: "CircuitBoard",
          is_demo: true,
          sort_order: 99,
          is_visible: true,
          ...values,
        };
      if (type === "categories")
        values = {
          slug: id!,
          icon: "CircuitBoard",
          media_id: null,
          sort_order: 99,
          is_visible: true,
          ...values,
        };
      if (type === "sections") {
        if (
          typeof values.section_type !== "string" ||
          !values.section_type.trim() ||
          values.section_type.length > 48
        )
          throw new ManagementError(400, 1001, "板块类型必须为 1 至 48 个字符。");
        if (PROTECTED_SECTION_TYPES.has(values.section_type))
          throw new ManagementError(400, 1001, "系统模块类型不能用于自定义模块。");
        const [page] = await db.execute<RowDataPacket[]>(
          "SELECT id FROM pages WHERE id=?",
          [values.page_id!],
        );
        if (!page.length)
          throw new ManagementError(400, 1001, "所属页面不存在。");
        values = {
          section_key: "S-" + randomUUID(),
          subtitle: "",
          media_id: null,
          category_id: null,
          sort_order: 99,
          is_visible: true,
          ...values,
          content_json: {
            ...sectionDefaults(String(values.section_type)),
            ...(values.content_json as Values),
          },
        };
      }
      const required = columns.filter((k) => values[k] !== undefined);
      const temporary = {
        id: id ?? "",
        type,
        title: "待创建对象",
        version: 1,
        deleted: false,
        values,
        fields: fieldsFor(type, values).map((f) => ({ ...f, readonly: false })),
        references: [],
      } as ResourceRecord;
      await this.validateChanges(
        type,
        temporary,
        Object.fromEntries(
          temporary.fields
            .filter((f) => getValue(values, f.key) !== undefined)
            .map((f) => [f.key, getValue(values, f.key)!]),
        ),
        db,
      );
      const insertColumns = id ? [entity.id, ...required] : required;
      const parameters = insertColumns.map((k) =>
        k === entity.id && id
          ? id
          : (entity.json as readonly string[]).includes(k)
            ? JSON.stringify(values[k])
            : values[k],
      );
      const [result] = await db.query<import("mysql2/promise").ResultSetHeader>(
        `INSERT INTO ?? (${insertColumns.map(() => "??").join(",")}) VALUES (${insertColumns.map(() => "?").join(",")})`,
        [entity.table, ...insertColumns, ...parameters],
      );
      if (type === "categories") {
        const [page] = await db.execute<RowDataPacket[]>(
          "SELECT id FROM pages WHERE slug=?",
          ["products"],
        );
        await db.execute(
          "INSERT INTO page_sections(page_id,section_key,section_type,title,subtitle,description,content_json,category_id,sort_order,is_visible) VALUES(?,?,?,?,?,?,?,?,?,?)",
          [
            page[0]!.id,
            "C-" + id,
            "product-matrix",
            values.name,
            "",
            values.description,
            JSON.stringify(sectionDefaults("product-matrix")),
            id,
            values.sort_order,
            values.is_visible,
          ],
        );
      }
      const record = await this.get(type, id ?? String(result.insertId), db);
      await claimMedia(db, record, record.values, context.actorId);
      await this.assertSiteIntegrity(db);
      await this.record(db, record, context);
      await db.execute(
        "INSERT INTO audit_logs(actor_id,action,resource_type,resource_id,operation_id,request_id) VALUES(?,?,?,?,?,?)",
        [
          context.actorId,
          "create",
          type,
          record.id,
          context.operationId,
          context.requestId,
        ],
      );
      await db.commit();
      return record;
    } catch (error) {
      await db.rollback();
      throw this.translate(error);
    } finally {
      db.release();
    }
  }
  public async coverage() {
    const resources = [];
    const [pageRows] = await this.database.query<RowDataPacket[]>(
      "SELECT id,slug FROM pages",
    );
    const pageRoutes = new Map(
      pageRows.map((p) => [
        String(p.id),
        p.slug === "home" ? "/" : "/" + p.slug,
      ]),
    );
    let verified = new Map<string, { signature: string; verified: boolean }>();
    try {
      const report = JSON.parse(
        await readFile(
          path.resolve("reports/resource-coverage-report.json"),
          "utf8",
        ),
      );
      verified = new Map(
        report.resources.map(
          (item: { key: string; signature: string; verified: boolean }) => [
            item.key,
            item,
          ],
        ),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    for (const type of Object.keys(ENTITIES) as ResourceType[])
      for (const item of await this.list(type)) {
        const affected = type === "media" ? await this.references(item.id) : [];
        const location =
          type === "settings"
            ? ["/", "/products", "/about"]
            : type === "pages"
              ? [pageRoutes.get(item.id) ?? "/"]
              : type === "sections"
                ? [
                    `${pageRoutes.get(String(item.values.page_id)) ?? "/"} [data-section-id="${item.values.section_key}"]`,
                  ]
                : type === "products"
                  ? [
                      `/products [data-product-slug="${item.values.slug}"]`,
                      `/products .product-dialog`,
                    ]
                  : type === "categories"
                    ? [
                        `/products #catalog-${item.values.slug}`,
                        `/products .category-index-row[href="#catalog-${item.values.slug}"]`,
                      ]
                    : affected.map((r) => `${r.type}/${r.id} ${r.title}`);
        for (const field of item.fields.filter((f) => !f.readonly)) {
          const value = getValue(item.values, field.key);
          const entries =
            Array.isArray(value) && value.length > 0
              ? value.map((entry) => ({
                  suffix:
                    typeof entry === "object" && entry && !Array.isArray(entry)
                      ? String(entry.id)
                      : String(entry),
                  value: entry,
                }))
              : [{ suffix: "", value }];
          for (const entry of entries) {
            const key = `${type}.${item.id}.${field.key}${entry.suffix ? "." + entry.suffix : ""}`;
            const signature = createHash("sha256")
              .update(JSON.stringify(entry.value ?? null))
              .digest("hex");
            resources.push({
              key,
              signature,
              type,
              id: item.id,
              field: field.key,
              label: field.label,
              rule: {
                kind: field.kind,
                max: field.max ?? null,
                required: field.required ?? false,
                options: field.options ?? [],
              },
              frontendLocations: location,
              sharedReferences: affected,
              value: entry.value,
              source: {
                table: ENTITIES[type].table,
                column: field.key.split(".")[0],
                path: field.key,
              },
              owner: {
                title: item.title,
                pageId: item.values.page_id ?? null,
                sectionKey: item.values.section_key ?? null,
                sectionType: item.values.section_type ?? null,
              },
              adminPath: `/admin/${type === "settings" ? "global" : type === "products" || type === "categories" ? "products" : String(type === "pages" ? item.values.slug : pageRows.find((page) => String(page.id) === String(item.values.page_id))?.slug || "home")}/${type}/${encodeURIComponent(item.id)}`,
              mapped: true,
              verified:
                verified.get(key)?.verified === true &&
                verified.get(key)?.signature === signature,
            });
          }
        }
      }
    return {
      resources,
      total: resources.length,
      exclusions: [
        "固定项目名称与作者身份",
        "权限和安全规则",
        "布局算法与程序接口",
        "数据库凭据",
        "内部技术诊断",
      ],
    };
  }
  public async overview(): Promise<unknown> {
    const counts: Record<string, number> = {};
    for (const type of Object.keys(ENTITIES) as ResourceType[])
      counts[type] = (await this.list(type)).length;
    const [recent] = await this.database.query<RowDataPacket[]>(
      "SELECT a.*,u.username FROM audit_logs a LEFT JOIN admin_users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 12",
    );
    return { counts, names: RESOURCE_NAMES, recent };
  }
}
