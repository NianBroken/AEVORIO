import { readEnvironment } from "../src/config/env";
import { writeFile } from "node:fs/promises";

// 实际监听地址来自环境配置，公开接口不返回任何管理记录和私有配置。
void (async () => {
  const env = readEnvironment();
  const origin =
    env.FRONTEND_ORIGIN;
  const results = [];
  for (const page of ["home", "products", "about"]) {
    const response = await fetch(new URL("/api/v1/site?page=" + page, origin));
    const body = await response.json();
    if (!response.ok || body.Code !== 0 || body.Data.page.sections.length < 10)
      throw new Error("页面接口验证未通过。");
    if (
      /password_hash|session_secret|DB_PASSWORD|admin_users/u.test(
        JSON.stringify(body),
      )
    )
      throw new Error("公开内容含有管理内部字段。");
    results.push({
      page,
      http: response.status,
      sections: body.Data.page.sections.length,
      products: body.Data.products.length,
      categories: body.Data.categories.length,
    });
  }
  const unauthorized = await fetch(new URL("/api/v1/admin/overview", origin));
  if (unauthorized.status !== 401)
    throw new Error("管理接口未拒绝未登录请求。");
  await writeFile(
    "reports/live-api-report.json",
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        passed: true,
        results,
        unauthorizedStatus: unauthorized.status,
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log("实际监听服务与公开数据读取核验通过。");
})().catch((error) => {
  console.error(error instanceof Error ? error.message : "运行接口检查失败。");
  process.exitCode = 1;
});
