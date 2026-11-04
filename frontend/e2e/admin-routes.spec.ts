import { expect, test } from "@playwright/test";

const pageRecord = { id: "1", type: "pages", title: "首页", version: 1, values: { slug: "home" }, fields: [], references: [] };
const section = { id: "section-a", type: "sections", title: "路由测试模块", version: 1, values: { page_id: 1, title: "路由测试模块" }, fields: [], references: [] };

// 路由测试通过受控管理接口读取固定数据，不修改正式内容或管理员账户。
test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/admin/**", async (route) => {
    const url = new URL(route.request().url());
    const endpoint = url.pathname.replace("/api/v1/admin", "");
    let data: unknown;
    if (endpoint === "/auth/session") data = { user: { id: "route-test", username: "路由验收", mustChange: false }, frontendOrigin: url.origin, csrfToken: "test" };
    else if (endpoint === "/overview") data = { counts: {}, recent: [] };
    else if (endpoint === "/resources/pages") data = { items: [pageRecord], total: 1 };
    else if (endpoint === "/resources/sections") data = { items: [section], total: 1 };
    else if (endpoint === "/resources/sections/section-a") {
      await new Promise((resolve) => setTimeout(resolve, 200));
      data = section;
    } else data = { items: [], total: 0 };
    await route.fulfill({ json: { Code: 0, Messages: "成功", Data: data } });
  });
});

test("独立路径、刷新和查询状态", async ({ page }) => {
  await page.goto("/admin/home/sections?q=路由&page=1&size=20");
  await expect(page.locator(".sidebar nav button.active")).toContainText("公司首页设置");
  await expect(page.locator(".resource-name")).toContainText("路由测试模块");
  await expect(page.getByPlaceholder(/搜索/u)).toHaveValue("路由");
  await page.reload();
  await expect(page.getByPlaceholder(/搜索/u)).toHaveValue("路由");
  await expect(page).toHaveURL(/size=20/u);
});

test("菜单导航与浏览器历史恢复", async ({ page }) => {
  await page.goto("/admin/overview");
  await page.locator(".sidebar nav").getByRole("button", { name: "关于我们设置" }).click();
  await expect(page).toHaveURL(/\/admin\/about\/sections$/u);
  await page.locator(".sidebar nav").getByRole("button", { name: "个人设置" }).click();
  await expect(page).toHaveURL(/\/admin\/personal$/u);
  await page.goBack();
  await expect(page.locator(".sidebar nav button.active")).toContainText("关于我们设置");
  await page.goForward();
  await expect(page.locator(".sidebar nav button.active")).toContainText("个人设置");
});

test("对象直达、旧地址转换与异步导航隔离", async ({ page }) => {
  await page.goto("/admin/#/sections/section-a");
  await expect(page.locator(".editor h2")).toHaveText("路由测试模块");
  await expect(page).toHaveURL(/\/admin\/home\/sections\/section-a$/u);
  await page.reload();
  await expect(page.locator(".editor h2")).toHaveText("路由测试模块");
  await page.goto("/admin/home/sections/section-a");
  await page.locator(".sidebar nav").getByRole("button", { name: "个人设置" }).click();
  const confirm = page.getByRole("button", { name: "离开编辑", exact: true });
  if (await confirm.isVisible()) await confirm.click();
  await expect(page).toHaveURL(/\/admin\/personal$/u);
  await expect(page.locator(".editor")).toHaveCount(0);
});

test("新建深层路径与未知路径提示", async ({ page }) => {
  await page.goto("/admin/home/sections/new");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("创建页面模块");
  await page.goto("/admin/unknown");
  await expect(page.getByText("后台页面不存在，请从左侧菜单选择页面。")).toBeVisible();
  await page.reload();
  await expect(page.getByText("后台页面不存在，请从左侧菜单选择页面。")).toBeVisible();
  await page.locator(".sidebar nav").getByRole("button", { name: "概览", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/overview$/u);
  await expect(page.getByText("后台页面不存在，请从左侧菜单选择页面。")).toHaveCount(0);
});
