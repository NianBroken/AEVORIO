import { createServer } from 'node:http';
import { readEnvironment } from './config/env';
import { createDatabasePool, closeDatabasePool } from './database/pool';
import { createApp } from './app';

export async function startServer(): Promise<void> {
  const environment = readEnvironment();
  const database = createDatabasePool(environment);
  const connection = await database.getConnection();
  connection.release();

  const server = createServer(createApp({ database }));

  server.listen(environment.BACKEND_PORT, environment.BACKEND_HOST, () => {
    console.log(`AEVORIO 后端已连接 MySQL，服务地址 http://${environment.BACKEND_HOST}:${environment.BACKEND_PORT}`);
  });

  const closeServer = (signal: NodeJS.Signals): void => {
    console.log(`收到 ${signal}，开始关闭后端服务。`);
    server.close((error) => {
      if (error) {
        console.error('关闭 HTTP 服务失败。');
        process.exitCode = 1;
      }
      void closeDatabasePool();
    });
  };

  process.once('SIGINT', closeServer);
  process.once('SIGTERM', closeServer);
}

if (require.main === module) {
  startServer().catch((error: unknown) => {
    const reason = error instanceof Error ? error.message : '未知启动错误';
    console.error(`AEVORIO 后端启动失败：${reason}`);
    void closeDatabasePool();
    process.exitCode = 1;
  });
}
