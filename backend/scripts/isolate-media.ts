import path from "node:path";
import { writeFile, mkdir } from "node:fs/promises";
import { backupSite } from "./backup-site";
import { readEnvironment } from "../src/config/env";
import { createDatabasePool, closeDatabasePool } from "../src/database/pool";
import { isolateAllMedia } from "../src/services/media-ownership";

async function main() {
  const backup = await backupSite();
  const pool = createDatabasePool(readEnvironment());
  try {
    const changes = await isolateAllMedia(pool, path.resolve("storage/media"));
    await mkdir("reports", { recursive: true });
    const report = JSON.stringify({ backup, changes }, null, 2);
    await writeFile(`reports/media-isolation-${Date.now()}.json`, report, "utf8");
    await writeFile("reports/media-isolation.json", report, "utf8");
    console.log(`媒体独立归属迁移完成，处理 ${changes.length} 个对象，备份 ${backup}`);
  } finally { await closeDatabasePool(); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
