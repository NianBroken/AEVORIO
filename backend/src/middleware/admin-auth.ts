import { readEnvironment } from "../config/env";
import { allowedFrontendOrigins } from "../config/network";
import session from "express-session";
import mysqlSession from "express-mysql-session";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { Request, RequestHandler } from "express";
import { ManagementError } from "../services/resource-service";

declare module "express-session" {
  interface SessionData {
    csrf?: string;
    admin?: {
      id: string;
      username: string;
      version: number;
      mustChange: boolean;
    };
  }
}
const SESSION_AGE = 8 * 60 * 60 * 1000;
export function adminOrigin(): string {
  return readEnvironment().FRONTEND_ORIGIN;
}
// 密钥仅存于后端私有目录，服务重启后继续验证原有会话。
export function sessionMiddleware(database: Pool): RequestHandler {
  const root = path.resolve("storage/private");
  mkdirSync(root, { recursive: true });
  const file = path.join(root, "session-secret");
  if (!existsSync(file))
    writeFileSync(file, randomBytes(48).toString("hex"), {
      flag: "wx",
      mode: 0o600,
    });
  const Store = mysqlSession(session);
  const store = new Store(
    {
      createDatabaseTable: false,
      clearExpired: false,
      endConnectionOnClose: false,
      schema: {
        tableName: "admin_sessions",
        columnNames: {
          session_id: "session_id",
          expires: "expires",
          data: "data",
        },
      },
    },
    database.pool,
  );
  return session({
    name: "aevorio.sid",
    secret: readFileSync(file, "utf8"),
    store,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "strict",
      secure: new URL(adminOrigin()).protocol === "https:",
      maxAge: SESSION_AGE,
      path: "/api/v1/admin",
    },
  });
}
export function csrfToken(request: Request): string {
  request.session.csrf ??= randomBytes(32).toString("hex");
  return request.session.csrf;
}
export const verifyCsrf: RequestHandler = (request, _response, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    next();
    return;
  }
  const token = request.get("X-CSRF-Token") ?? "";
  const expected = request.session.csrf ?? "";
  const actualBytes = Buffer.from(token);
  const expectedBytes = Buffer.from(expected);
  if (
    !allowedFrontendOrigins(adminOrigin()).has(request.get("Origin") ?? "") ||
    actualBytes.length !== expectedBytes.length ||
    !expected ||
    !timingSafeEqual(actualBytes, expectedBytes)
  ) {
    next(
      new ManagementError(
        403,
        3003,
        "管理请求校验失败：登录状态或请求来源不合法，请重新登录后提交。",
      ),
    );
    return;
  }
  next();
};
export function authorize(database: Pool): RequestHandler {
  return async (request, _response, next) => {
    const user = request.session.admin;
    if (!user)
      throw new ManagementError(
        401,
        3001,
        "请先登录后台管理系统，再访问管理数据。",
      );
    const [rows] = await database.execute<RowDataPacket[]>(
      "SELECT session_version,must_change_password FROM admin_users WHERE id=?",
      [user.id],
    );
    if (!rows[0] || Number(rows[0].session_version) !== user.version) {
      await new Promise<void>((resolve, reject) =>
        request.session.destroy((e) => (e ? reject(e) : resolve())),
      );
      throw new ManagementError(401, 3001, "当前登录状态已失效，请重新登录。");
    }
    user.mustChange = Boolean(rows[0].must_change_password);
    if (user.mustChange)
      throw new ManagementError(
        403,
        3007,
        "首次登录必须设置新的管理密码，设置后即可维护内容。",
      );
    next();
  };
}
