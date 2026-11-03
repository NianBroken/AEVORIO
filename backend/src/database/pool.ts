import mysql from "mysql2/promise";
import type { Environment } from "../config/env";

// 整站只创建一个连接池，并通过 utf8mb4 保持数据库中文读写一致。
let activePool: mysql.Pool | undefined;

export function createDatabasePool(environment: Environment): mysql.Pool {
  if (activePool) {
    return activePool;
  }

  activePool = mysql.createPool({
    host: environment.DB_HOST,
    port: environment.DB_PORT,
    user: environment.DB_USER,
    password: environment.DB_PASSWORD,
    database: environment.DB_NAME,
    charset: "utf8mb4",
    connectionLimit: environment.DB_CONNECTION_LIMIT,
    waitForConnections: true,
    enableKeepAlive: true,
    connectTimeout: 8_000,
    timezone: "Z",
    decimalNumbers: true,
    namedPlaceholders: true,
    jsonStrings: true,
  });

  return activePool;
}

export async function closeDatabasePool(): Promise<void> {
  const pool = activePool;
  activePool = undefined;

  if (pool) {
    await pool.end();
  }
}
