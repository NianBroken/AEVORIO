import { randomBytes, randomUUID } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RowDataPacket } from "mysql2/promise";
import { readEnvironment } from "../src/config/env";
import { createDatabasePool, closeDatabasePool } from "../src/database/pool";
import { hashPassword } from "../src/services/password-service";
import { ResourceService } from "../src/services/resource-service";
import { secureDirectory } from "../src/utils/private-storage";

const USERNAME = "browser-verification";
const TEST_TITLES = new Set([
  "界面创建验证产品",
  "界面创建验证类别",
  "界面创建验证板块",
]);
const CREDENTIAL_FILE = path.resolve(
  "storage/private/browser-verification.json",
);

// 验收账户与正式管理员分开管理，临时业务内容通过正式服务执行可恢复删除。
void (async () => {
  const database = createDatabasePool(readEnvironment());
  try {
    const resources = new ResourceService(database);
    const context = () => ({
      actorId: "local-browser-verification",
      requestId: randomUUID(),
      operationId: randomUUID(),
    });
    const categories = (await resources.list("categories", "", true)).filter(
      (item) => TEST_TITLES.has(item.title),
    );
    const categoryIds = new Set(categories.map((item) => item.id));
    for (const type of ["products", "sections", "categories"] as const) {
      for (const item of await resources.list(type)) {
        if (
          !TEST_TITLES.has(item.title) &&
          !(
            type === "sections" &&
            categoryIds.has(String(item.values.category_id))
          )
        )
          continue;
        await resources.save(
          type,
          item.id,
          { version: item.version, changes: {} },
          context(),
          "delete",
          true,
        );
      }
    }
    const [users] = await database.execute<RowDataPacket[]>(
      "SELECT id FROM admin_users WHERE username=?",
      [USERNAME],
    );
    if (users[0]) {
      await database.execute(
        "DELETE FROM admin_sessions WHERE JSON_VALID(data) AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.admin.id'))=?",
        [users[0].id],
      );
      await database.execute("DELETE FROM admin_users WHERE id=?", [
        users[0].id,
      ]);
    }
    if (process.argv.includes("--cleanup")) {
      await rm(CREDENTIAL_FILE, { force: true });
      console.log("浏览器验收账户、会话和临时凭据已清理，验收历史保留。");
      return;
    }
    if (process.argv.includes("--cleanup-content")) {
      console.log("中断验收的临时内容已通过发布服务清理。");
      return;
    }
    const password = randomBytes(24).toString("base64url");
    await database.execute(
      "INSERT INTO admin_users(id,username,password_hash,must_change_password) VALUES(?,?,?,0)",
      [randomUUID(), USERNAME, await hashPassword(password)],
    );
    await secureDirectory(path.dirname(CREDENTIAL_FILE));
    await writeFile(
      CREDENTIAL_FILE,
      JSON.stringify(
        { username: USERNAME, password, createdAt: new Date().toISOString() },
        null,
        2,
      ),
      { encoding: "utf8", mode: 0o600 },
    );
    console.log("临时浏览器验收账户已创建，凭据只保存在本机受限文件。");
  } finally {
    await closeDatabasePool();
  }
})().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "浏览器验收账户操作未完成。",
  );
  process.exitCode = 1;
});
