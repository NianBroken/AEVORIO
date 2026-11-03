import { randomBytes, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { readEnvironment } from "../src/config/env";
import { createDatabasePool, closeDatabasePool } from "../src/database/pool";
import { hashPassword } from "../src/routes/admin-routes";
import { secureDirectory } from "../src/utils/private-storage";

// 本地账户工具只输出凭据文件位置，不在终端、源码或普通日志中记录密码。
void (async () => {
  const username = process.argv[2] ?? "administrator";
  if (!/^[a-zA-Z0-9_.-]{3,80}$/u.test(username))
    throw new Error("用户名格式不合法。");
  const db = createDatabasePool(readEnvironment());
  const password = randomBytes(24).toString("base64url");
  try {
    const reset = process.argv.includes("--reset");
    const [rows] = await db.query<import("mysql2/promise").RowDataPacket[]>(
      "SELECT id FROM admin_users WHERE username=?",
      [username],
    );
    if (rows.length && !reset)
      throw new Error("账户已存在。重置时需要显式提供 --reset。");
    if (rows[0])
      await db.execute(
        "UPDATE admin_users SET password_hash=?,must_change_password=1,session_version=session_version+1 WHERE id=?",
        [await hashPassword(password), rows[0].id],
      );
    else
      await db.execute(
        "INSERT INTO admin_users(id,username,password_hash) VALUES(?,?,?)",
        [randomUUID(), username, await hashPassword(password)],
      );
    const root = path.resolve("storage/private");
    await secureDirectory(root);
    const target = path.join(root, "administrator-credentials.json");
    await writeFile(
      target,
      JSON.stringify(
        {
          username,
          temporaryPassword: password,
          mustChangePassword: true,
          createdAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      { encoding: "utf8", mode: 0o600 },
    );
    console.log(`管理员已就绪，首次登录凭据保存在本机受限文件：${target}`);
  } finally {
    await closeDatabasePool();
  }
})().catch((error) => {
  console.error(error instanceof Error ? error.message : "账户操作未完成。");
  process.exitCode = 1;
});
