import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ResourceService } from "../src/services/resource-service";
import { createDatabasePool, closeDatabasePool } from "../src/database/pool";
import { readEnvironment } from "../src/config/env";

// 将实际浏览器逐字段结果映射到稳定资源条目，内容摘要用于识别验收后的改动。
void (async () => {
  const dom = JSON.parse(
    await readFile(
      path.resolve("../frontend/reports/resource-dom-coverage.json"),
      "utf8",
    ),
  ) as {
    generatedAt: string;
    total: number;
    verified: number;
    results: Array<{
      type: string;
      id: string;
      field: string;
      passed: boolean;
      method: string;
    }>;
  };
  const browser = JSON.parse(
    await readFile(
      path.resolve("../frontend/reports/admin-browser-report.json"),
      "utf8",
    ),
  );
  const backend = JSON.parse(
    await readFile("reports/backend-unit-test-report.json", "utf8"),
  );
  if (
    dom.total !== dom.verified ||
    !backend.success ||
    browser.browserErrors.length
  )
    throw new Error("存在未通过的实际测试，资源覆盖报告未生成。");
  const fields = new Map(
    dom.results.map((r) => [r.type + "." + r.id + "." + r.field, r]),
  );
  const service = new ResourceService(createDatabasePool(readEnvironment()));
  try {
    const coverage = await service.coverage();
    const resources = (
      coverage.resources as Array<{
        key: string;
        type: string;
        id: string;
        field: string;
        signature: string;
      }>
    ).map((item) => ({
      ...item,
      verified:
        fields.get(item.type + "." + item.id + "." + item.field)?.passed ===
        true,
      method:
        fields.get(item.type + "." + item.id + "." + item.field)?.method ??
        "缺少实际验证",
    }));
    const failures = resources.filter((r) => !r.verified);
    const report = {
      generatedAt: new Date().toISOString(),
      identified: resources.length,
      mapped: resources.length,
      verified: resources.length - failures.length,
      editableFields: dom.total,
      backendTests: backend.numPassedTests,
      exclusions: coverage.exclusions,
      resources,
      failures,
    };
    await writeFile(
      "reports/resource-coverage-report.json",
      JSON.stringify(report, null, 2),
      "utf8",
    );
    if (failures.length)
      throw new Error(`存在 ${failures.length} 项资源尚未验证。`);
    console.log(
      `资源覆盖核验通过：识别 ${report.identified} 项，映射 ${report.mapped} 项，验证 ${report.verified} 项。`,
    );
  } finally {
    await closeDatabasePool();
  }
})().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "资源覆盖报告未完成。",
  );
  process.exitCode = 1;
});
