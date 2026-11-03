import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { readEnvironment } from "../src/config/env";
import { createDatabasePool, closeDatabasePool } from "../src/database/pool";
import { MysqlSiteRepository } from "../src/repositories/site-repository";
import { ResourceService } from "../src/services/resource-service";
import { MediaService } from "../src/services/media-service";
import type { PageSlug } from "../src/types/site";

const root = path.resolve(__dirname, "../..");
async function files(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries
        .filter(
          (e) =>
            ![
              "node_modules",
              ".next",
              "dist",
              "storage",
              ".git",
              "test-results",
            ].includes(e.name),
        )
        .map((e) =>
          e.isDirectory()
            ? files(path.join(directory, e.name))
            : [path.join(directory, e.name)],
        ),
    )
  ).flat();
}
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

// 数量从实际业务记录统计，审计约束与内容规模分离。
export async function auditDelivery(): Promise<void> {
  const env = readEnvironment();
  const db = createDatabasePool(env);
  try {
    const roots = (await readdir(root, { withFileTypes: true })).filter(
      (e) => e.isDirectory() && e.name !== ".git",
    );
    assert(
      roots.length === 2 &&
        roots.every((e) => ["frontend", "backend"].includes(e.name)),
      "根目录业务文件夹不符合约定。",
    );
    const resources = new ResourceService(db);
    await resources.assertSiteIntegrity(db);
    const repository = new MysqlSiteRepository(db);
    const pages = [];
    for (const slug of ["home", "products", "about"] as PageSlug[]) {
      const payload = await repository.getSite(slug);
      assert(payload, "页面数据库内容不存在。");
      const route = slug === "home" ? "/" : "/" + slug;
      const response = await fetch(new URL(route, env.FRONTEND_ORIGIN));
      const html = await response.text();
      assert(
        response.status === 200 && html.includes(`data-page="${slug}"`),
        "公开页面实际访问未通过。",
      );
      pages.push({
        slug,
        sections: payload.page.sections.length,
        http: response.status,
      });
    }
    const backendOrigin =
      process.env.ADMIN_ORIGIN ??
      `http://${env.BACKEND_HOST}:${env.BACKEND_PORT}`;
    const admin = await fetch(new URL("/admin/", backendOrigin));
    assert(
      admin.ok && (await admin.text()).includes("/admin/assets/"),
      "后台正式构建未正常提供。",
    );
    let mediaVerified = 0;
    for (const media of await resources.list("media")) {
      const bytes = await readFile(
        path.join(
          root,
          "backend/storage/media",
          path.basename(String(media.values.file_name)),
        ),
      );
      assert(
        createHash("sha256").update(bytes).digest("hex") ===
          media.values.sha256,
        "媒体文件与数据库校验值不一致。",
      );
      mediaVerified++;
    }
    await new MediaService(
      resources,
      path.join(root, "backend/storage/media"),
    ).verifyHistoricalFiles();
    const coverage = await resources.coverage();
    assert(
      coverage.resources.every(
        (item) => item.mapped === true && item.verified === true,
      ),
      "存在未映射或内容摘要不匹配的资源，交付审计未通过。",
    );
    let scanned = 0;
    for (const file of await files(root))
      if (
        /\.(?:tsx?|m?js|json|md|map|example)$/u.test(file) &&
        !path.basename(file).startsWith(".env")
      ) {
        const content = await readFile(file, "utf8");
        if (env.DB_PASSWORD.length > 5)
          assert(
            !content.includes(env.DB_PASSWORD),
            `发现私有配置进入交付文件：${path.relative(root, file)}`,
          );
        scanned++;
      }
    for (const directory of ["frontend", "backend"])
      assert(
        (await stat(path.join(root, directory, "reports/runtime-error.log")))
          .size === 0,
        "当前正式服务存在错误输出。",
      );
    assert(
      (await stat(path.join(root, "backend/reports/supervisor-error.log")))
        .size === 0,
      "当前守护进程存在错误输出。",
    );
    const report = {
      generatedAt: new Date().toISOString(),
      passed: true,
      pages,
      counts: ((await resources.overview()) as { counts: unknown }).counts,
      coverage: {
        identified: coverage.total,
        mapped: coverage.total,
        verified: coverage.resources.filter((item) => item.verified === true)
          .length,
        exclusions: coverage.exclusions,
      },
      mediaVerified,
      adminHttp: admin.status,
      scannedFiles: scanned,
      runtime: JSON.parse(
        await readFile(
          path.join(root, "frontend/reports/runtime-services.json"),
          "utf8",
        ),
      ),
    };
    await writeFile(
      path.join(root, "backend/reports/final-delivery-audit.json"),
      JSON.stringify(report, null, 2),
      "utf8",
    );
    await writeFile(
      path.join(root, "frontend/reports/final-delivery-audit.json"),
      JSON.stringify(report, null, 2),
      "utf8",
    );
    await writeFile(
      path.join(root, "backend/reports/resource-inventory.json"),
      JSON.stringify({ generatedAt: report.generatedAt, ...coverage }, null, 2),
      "utf8",
    );
    console.log(
      `实际运行审计通过：三个公开页面、管理后台、${mediaVerified} 项媒体与 ${coverage.total} 项资源映射。`,
    );
  } finally {
    await closeDatabasePool();
  }
}
if (require.main === module)
  void auditDelivery().catch((error) => {
    console.error(error instanceof Error ? error.message : "交付审计未完成。");
    process.exitCode = 1;
  });
