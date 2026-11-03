import { Router, type ErrorRequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import multer from "multer";
import { hash, verify, Algorithm } from "@node-rs/argon2";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import { ENTITIES } from "../services/resource-definitions";
import {
  ManagementError,
  ResourceService,
  type EditContext,
} from "../services/resource-service";
import { MediaService } from "../services/media-service";
import {
  authorize,
  csrfToken,
  sessionMiddleware,
  verifyCsrf,
} from "../middleware/admin-auth";
import { sendFailure, sendSuccess } from "../utils/response";
import type { ResourceType, Values } from "../../contracts/content";
import { readEnvironment } from "../config/env";

const passwordOptions = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};
export const hashPassword = (password: string) =>
  hash(password, passwordOptions);
const editSchema = z
  .object({
    version: z.number().int().positive(),
    operationId: z.string().uuid(),
    changes: z.record(z.string().min(1).max(200), z.json()),
  })
  .strict();
const loginSchema = z
  .object({
    username: z.string().min(1).max(80),
    password: z.string().min(1).max(128),
  })
  .strict();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15_000_000, files: 1, fields: 4, parts: 5 },
});

// 管理路由按资源类型复用业务服务，任何管理数据均在服务器端验证登录状态。
export function createAdminRouter(database: Pool, mediaRoot: string): Router {
  const router = Router();
  const resources = new ResourceService(database);
  const media = new MediaService(resources, mediaRoot);
  router.use(sessionMiddleware(database));
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  router.use(verifyCsrf);
  router.get("/auth/session", (req, res) =>
    sendSuccess(res, res.locals.requestId, "已读取当前会话状态。", {
      user: req.session.admin ?? null,
      csrfToken: csrfToken(req),
      frontendOrigin: readEnvironment().FRONTEND_ORIGIN,
    }),
  );
  router.post(
    "/auth/login",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 10,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      handler: (_req, res) =>
        sendFailure(
          res,
          res.locals.requestId,
          429,
          3002,
          "登录尝试过于频繁，请在十五分钟后重试。",
        ),
    }),
    async (req, res) => {
      const body = loginSchema.parse(req.body);
      const [rows] = await database.execute<RowDataPacket[]>(
        "SELECT * FROM admin_users WHERE username=?",
        [body.username],
      );
      const user = rows[0];
      if (!user || !(await verify(String(user.password_hash), body.password)))
        throw new ManagementError(401, 3001, "登录失败：用户名或密码不正确。");
      await new Promise<void>((resolve, reject) =>
        req.session.regenerate((e) => (e ? reject(e) : resolve())),
      );
      req.session.admin = {
        id: String(user.id),
        username: String(user.username),
        version: Number(user.session_version),
        mustChange: Boolean(user.must_change_password),
      };
      sendSuccess(
        res,
        res.locals.requestId,
        "登录成功，已建立受保护的管理会话。",
        { user: req.session.admin, csrfToken: csrfToken(req) },
      );
    },
  );
  router.post("/auth/logout", async (req, res) => {
    await new Promise<void>((resolve, reject) =>
      req.session.destroy((e) => (e ? reject(e) : resolve())),
    );
    res.clearCookie("aevorio.sid", { path: "/api/v1/admin" });
    sendSuccess(
      res,
      res.locals.requestId,
      "已安全退出，当前会话不再有效。",
      null,
    );
  });
  router.patch("/auth/password", async (req, res) => {
    const user = req.session.admin;
    if (!user) throw new ManagementError(401, 3001, "请先登录后修改密码。");
    const body = z
      .object({
        currentPassword: z.string().min(1).max(128),
        newPassword: z.string().min(12).max(128),
      })
      .strict()
      .parse(req.body);
    const [rows] = await database.execute<RowDataPacket[]>(
      "SELECT password_hash,session_version FROM admin_users WHERE id=?",
      [user.id],
    );
    if (
      !rows[0] ||
      Number(rows[0].session_version) !== user.version ||
      !(await verify(String(rows[0].password_hash), body.currentPassword))
    )
      throw new ManagementError(401, 3001, "当前密码验证失败，密码未修改。");
    if (body.newPassword === body.currentPassword)
      throw new ManagementError(400, 1001, "新密码不能与当前临时密码相同。");
    await database.execute(
      "UPDATE admin_users SET password_hash=?,must_change_password=0,session_version=session_version+1 WHERE id=?",
      [await hashPassword(body.newPassword), user.id],
    );
    req.session.admin = {
      ...user,
      mustChange: false,
      version: user.version + 1,
    };
    sendSuccess(
      res,
      res.locals.requestId,
      "管理密码已更新，其他旧会话已失效。",
      { user: req.session.admin },
    );
  });
  router.use(authorize(database));
  const resourceType = (value: unknown): ResourceType => {
    if (typeof value !== "string" || !Object.hasOwn(ENTITIES, value))
      throw new ManagementError(400, 1001, "不支持指定资源类型。");
    return value as ResourceType;
  };
  const context = (
    req: import("express").Request,
    res: import("express").Response,
    operationId: unknown,
  ): EditContext => ({
    actorId: req.session.admin!.id,
    requestId: res.locals.requestId,
    operationId: z.string().uuid().parse(operationId),
  });
  router.get("/overview", async (_req, res) =>
    sendSuccess(
      res,
      res.locals.requestId,
      "已读取数据库中的真实管理统计。",
      await resources.overview(),
    ),
  );
  router.get("/coverage", async (_req, res) =>
    sendSuccess(
      res,
      res.locals.requestId,
      "已根据可编辑字段建立资源映射，验证状态以实际测试报告为准。",
      await resources.coverage(),
    ),
  );
  router.post("/media/cleanup", async (_req, res) =>
    sendSuccess(
      res,
      res.locals.requestId,
      "未引用文件清理完成，当前媒体和全部可恢复历史文件均已保留。",
      await media.cleanup(),
    ),
  );
  router.get("/resources/:type", async (req, res) => {
    const query = z
      .object({
        q: z.string().max(120).optional(),
        deleted: z.enum(["0", "1"]).optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(500).default(100),
      })
      .strict()
      .parse(req.query);
    const items = await resources.list(
      resourceType(req.params.type),
      query.q,
      query.deleted === "1",
    );
    sendSuccess(res, res.locals.requestId, "已读取当前管理资源列表。", {
      items: items.slice(
        (query.page - 1) * query.limit,
        query.page * query.limit,
      ),
      total: items.length,
      page: query.page,
    });
  });
  router.get("/resources/:type/:id", async (req, res) => {
    const type = resourceType(req.params.type);
    const item = await resources.get(type, String(req.params.id));
    if (type === "media" || type === "categories")
      item.references = await resources.references(item.id);
    sendSuccess(
      res,
      res.locals.requestId,
      "已读取当前对象和可编辑字段。",
      item,
    );
  });
  router.patch("/resources/:type/:id", async (req, res) => {
    const body = editSchema.parse(req.body);
    const item = await resources.save(
      resourceType(req.params.type),
      String(req.params.id),
      { version: body.version, changes: body.changes as Values },
      context(req, res, body.operationId),
    );
    sendSuccess(
      res,
      res.locals.requestId,
      "修改已保存并立即发布，刷新公开页面即可查看当前版本。",
      item,
    );
  });
  router.post("/resources/:type", async (req, res) => {
    const body = z
      .object({
        operationId: z.string().uuid(),
        values: z.record(z.string(), z.json()),
      })
      .strict()
      .parse(req.body);
    sendSuccess(
      res,
      res.locals.requestId,
      "对象已创建并发布。",
      await resources.create(
        resourceType(req.params.type),
        body.values as Values,
        context(req, res, body.operationId),
      ),
    );
  });
  router.delete("/resources/:type/:id", async (req, res) => {
    const body = z
      .object({
        version: z.number().int().positive(),
        operationId: z.string().uuid(),
      })
      .strict()
      .parse(req.body);
    sendSuccess(
      res,
      res.locals.requestId,
      "对象已移入可恢复记录，公开内容已更新。",
      await resources.save(
        resourceType(req.params.type),
        String(req.params.id),
        { version: body.version, changes: {} },
        context(req, res, body.operationId),
        "delete",
        true,
      ),
    );
  });
  router.get("/revisions/:type/:id", async (req, res) =>
    sendSuccess(
      res,
      res.locals.requestId,
      "已读取当前对象的历史版本。",
      await resources.revisions(
        resourceType(req.params.type),
        String(req.params.id),
        z.coerce
          .number()
          .int()
          .min(1)
          .max(100000)
          .default(1)
          .parse(req.query.page),
      ),
    ),
  );
  router.post("/revisions/:type/:id/restore", async (req, res) => {
    const body = z
      .object({
        revisionId: z.number().int().positive(),
        version: z.number().int().positive(),
        operationId: z.string().uuid(),
      })
      .strict()
      .parse(req.body);
    sendSuccess(
      res,
      res.locals.requestId,
      "历史内容已恢复为新的发布版本，其他独立资源未修改。",
      await resources.restore(
        resourceType(req.params.type),
        String(req.params.id),
        body.revisionId,
        body.version,
        context(req, res, body.operationId),
      ),
    );
  });
  router.post("/media/uploads", upload.single("file"), async (req, res) => {
    const body = z
      .object({
        operationId: z.string().uuid(),
        replaceId: z.string().max(96).optional(),
        version: z.coerce.number().int().positive().optional(),
      })
      .strict()
      .parse(req.body);
    if (body.replaceId && !body.version)
      throw new ManagementError(400, 1001, "替换图片必须提供当前资源版本。");
    sendSuccess(
      res,
      res.locals.requestId,
      body.replaceId
        ? "图片已替换并立即发布，全部已声明引用将在刷新后读取新版本。"
        : "图片文件已保存，可以选择该图片关联到页面或产品。",
      await media.upload(
        req.file,
        context(req, res, body.operationId),
        body.replaceId
          ? { id: body.replaceId, version: body.version! }
          : undefined,
      ),
    );
  });
  router.use((_req, _res, next) =>
    next(new ManagementError(404, 1002, "未找到指定管理接口。")),
  );
  return router;
}
export const managementErrorHandler: ErrorRequestHandler = (
  error,
  request,
  response,
  next,
) => {
  if (response.headersSent) {
    next(error);
    return;
  }
  if (error instanceof ManagementError) {
    sendFailure(
      response,
      response.locals.requestId,
      error.status,
      error.code,
      error.message,
    );
    return;
  }
  if (error instanceof z.ZodError) {
    sendFailure(
      response,
      response.locals.requestId,
      400,
      1001,
      "请求参数不合法：" +
        error.issues
          .map((i) => `${i.path.join(".")} 的类型、长度或格式不符合要求`)
          .join("；"),
    );
    return;
  }
  if (error instanceof multer.MulterError) {
    sendFailure(
      response,
      response.locals.requestId,
      error.code === "LIMIT_FILE_SIZE" ? 413 : 400,
      3006,
      "上传未执行：文件超过 15 MB、数量超限或表单字段不符合要求。",
    );
    return;
  }
  if (error?.type === "entity.too.large") {
    sendFailure(
      response,
      response.locals.requestId,
      413,
      1001,
      "请求内容超过允许大小，本次修改未保存。",
    );
    return;
  }
  if (error instanceof SyntaxError && "body" in error) {
    sendFailure(
      response,
      response.locals.requestId,
      400,
      1001,
      "请求正文不是合法 JSON，修改未执行。",
    );
    return;
  }
  console.error(
    JSON.stringify({
      event: "management_failure",
      requestId: response.locals.requestId,
      path: request.path,
      code: typeof error?.code === "string" ? error.code : "UNEXPECTED",
    }),
  );
  sendFailure(
    response,
    response.locals.requestId,
    500,
    9000,
    "管理操作未能完成，请保留当前输入并检查服务状态后重试。",
  );
};
