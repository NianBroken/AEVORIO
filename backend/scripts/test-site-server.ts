import ports from "../../shared/ports.json";
import { createServer } from "node:http";
import express from "express";
import path from "node:path";
import { createDatabasePool, closeDatabasePool } from "../src/database/pool";
import { readEnvironment } from "../src/config/env";
import { createApp } from "../src/app";

// 隔离覆盖测试的进程入口只接受测试库，故障开关通过父进程通信传递。
void (async () => {
  const env = readEnvironment();
  if (!env.DB_NAME.startsWith("aevorio_test_"))
    throw new Error("测试服务禁止连接正式数据库。");
  const db = createDatabasePool(env);
  const app = express();
  let failed = false;
  app.use((req, res, next) => {
    if (failed && req.path === "/api/v1/site") {
      res
        .status(503)
        .json({ Code: 2001, Messages: "隔离内容服务故障验证", Data: null });
      return;
    }
    next();
  });
  app.use(
    createApp({
      database: db,
      mediaDirectory: path.resolve(process.env.TEST_MEDIA_ROOT!),
    }),
  );
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(ports.testServer, "127.0.0.1", resolve));
  process.on("message", (message) => {
    if (message === "fail") failed = true;
    if (message === "recover") failed = false;
  });
  process.send?.({ port: (server.address() as { port: number }).port });
  const close = () => {
    server.close(() => {
      void closeDatabasePool().then(() => process.exit(0));
    });
  };
  process.on("SIGTERM", close);
  process.on("SIGINT", close);
})().catch((error) => {
  console.error(error instanceof Error ? error.message : "隔离服务启动失败。");
  process.exitCode = 1;
});
