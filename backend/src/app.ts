import express, { type Express } from "express";
import path from "node:path";
import type { Pool } from "mysql2/promise";
import type { SiteRepository } from "./types/site";
import { addRequestId } from "./middleware/request-id";
import { MysqlSiteRepository } from "./repositories/site-repository";
import { createApiNotFound, createSiteRouter } from "./routes/site-routes";
import { SiteService } from "./services/site-service";
import { sendFailure } from "./utils/response";
import helmet from "helmet";
import {
  createAdminRouter,
  managementErrorHandler,
} from "./routes/admin-routes";

export interface AppOptions {
  repository?: SiteRepository;
  database?: Pool;
  mediaDirectory?: string;
}

export function createApp(options: AppOptions = {}): Express {
  const app = express();
  const repository =
    options.repository ?? createRequiredRepository(options.database);
  const mediaRoot = path.resolve(
    options.mediaDirectory ?? path.join(process.cwd(), "storage/media"),
  );

  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "blob:"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: null,
        },
      },
      crossOriginResourcePolicy: { policy: "same-origin" },
    }),
  );
  app.use(addRequestId);
  app.use(express.json({ limit: "512kb" }));
  if (options.database) {
    app.use("/api/v1/admin", createAdminRouter(options.database, mediaRoot));
    const adminRoot = path.resolve(process.cwd(), "admin-ui/dist");
    app.use("/admin", express.static(adminRoot, { index: false }));
    app.get(["/admin", "/admin/", "/admin/{*path}"], (_request, response) => {
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("X-Robots-Tag", "noindex, nofollow");
      response.sendFile(path.join(adminRoot, "index.html"));
    });
  }
  app.use(
    "/media",
    express.static(mediaRoot, {
      dotfiles: "deny",
      fallthrough: false,
      index: false,
      immutable: false,
      maxAge: 0,
      redirect: false,
      setHeaders(response, filePath) {
        const extension = path.extname(filePath).toLowerCase();
        if (extension === ".png")
          response.setHeader("Content-Type", "image/png");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader(
          "Cache-Control",
          "public, max-age=0, must-revalidate",
        );
      },
    }),
  );
  app.use(createSiteRouter(new SiteService(repository)));
  app.use("/api", createApiNotFound());

  app.use(
    "/media",
    (
      error: unknown,
      request: express.Request,
      response: express.Response,
      next: express.NextFunction,
    ) => {
      if (!response.headersSent) {
        sendFailure(
          response,
          response.locals.requestId as string,
          404,
          1002,
          "媒体文件读取失败：未找到所请求的本地图片，请检查图片名称及后端媒体库中的文件。",
        );
        return;
      }
      next(error);
    },
  );

  app.use((request, response) => {
    if (request.path === "/health") {
      response.status(200).json({
        Code: 0,
        Messages:
          "后端进程正常运行，数据库实际连接情况请以页面数据接口的成功响应为准。",
        Data: { ready: true },
        RequestId: response.locals.requestId as string,
        Timestamp: new Date().toISOString(),
      });
      return;
    }

    sendFailure(
      response,
      response.locals.requestId as string,
      404,
      1002,
      `请求失败：资源 ${request.path} 不存在，请使用三个正式页面或有效的业务接口与媒体地址。`,
    );
  });

  app.use(managementErrorHandler);
  return app;
}

function createRequiredRepository(database: Pool | undefined): SiteRepository {
  if (!database) {
    throw new Error("创建后端应用时必须提供 MySQL 数据库连接池。");
  }
  return new MysqlSiteRepository(database);
}
