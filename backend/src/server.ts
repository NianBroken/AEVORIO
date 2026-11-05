import { createServer } from "node:http";
import { readEnvironment } from "./config/env";
import { createDatabasePool, closeDatabasePool } from "./database/pool";
import { createApp } from "./app";
import { MediaService } from "./services/media-service";
import { ResourceService } from "./services/resource-service";
import path from "node:path";
import { secureDirectory } from "./utils/private-storage";
import { migratePublicContent } from "./database/public-content-migration";
import { refreshLanAddresses } from "./config/network";

export async function startServer(): Promise<void> {
  const environment = readEnvironment();
  await refreshLanAddresses();
  await secureDirectory(path.resolve("storage/private"));
  const database = createDatabasePool(environment);
  const connection = await database.getConnection();
  connection.release();
  await migratePublicContent(database);
  await new MediaService(
    new ResourceService(database),
    path.resolve("storage/media"),
  ).recover();

  const server = createServer(createApp({ database }));

  await database.execute("DELETE FROM admin_sessions WHERE expires<?", [
    Math.floor(Date.now() / 1000),
  ]);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(environment.BACKEND_PORT, environment.BACKEND_HOST, resolve);
  });
  console.log(
    `AEVORIO 后端已连接 MySQL，服务地址 http://${environment.BACKEND_HOST}:${environment.BACKEND_PORT}`,
  );
  const expiryTimer = setInterval(
    () => {
      void database
        .execute("DELETE FROM admin_sessions WHERE expires<?", [
          Math.floor(Date.now() / 1000),
        ])
        .catch(() => console.error("过期会话清理未完成，请检查数据库连接。"));
    },
    15 * 60 * 1000,
  );
  expiryTimer.unref();

  const closeServer = (signal: NodeJS.Signals): void => {
    console.log(`收到 ${signal}，开始关闭后端服务。`);
    clearInterval(expiryTimer);
    server.close((error) => {
      if (error) {
        console.error("关闭 HTTP 服务失败。");
        process.exitCode = 1;
      }
      void closeDatabasePool();
    });
  };

  process.once("SIGINT", closeServer);
  process.once("SIGTERM", closeServer);
}

if (require.main === module) {
  startServer().catch((error: unknown) => {
    const reason = error instanceof Error ? error.message : "未知启动错误";
    console.error(`AEVORIO 后端启动失败：${reason}`);
    void closeDatabasePool();
    process.exitCode = 1;
  });
}
