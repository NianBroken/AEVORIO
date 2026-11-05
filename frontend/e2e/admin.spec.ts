import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { getValue, type ResourceRecord } from "../../shared/content";

const ROOT = path.resolve("../backend");
const SIZES = [
  [1920, 1080],
  [1440, 900],
  [1280, 720],
  [1024, 768],
  [768, 1024],
  [390, 844],
  [360, 800],
];

// 代表资源通过真实界面修改和恢复，保存期间核对公开页面，不直接改写数据库。
test("后台实际管理、即时发布、独立上传与七种尺寸", async ({
  page,
  context,
}) => {
  const runtime = JSON.parse(
    (await readFile("reports/runtime-services.json", "utf8")).replace(
      /^\uFEFF/u,
      "",
    ),
  );
  const adminOrigin = runtime.frontend.url as string;
  test.setTimeout(240000);
  page.setDefaultTimeout(12000);
  const failures: string[] = [];
  page.on("pageerror", (e) => failures.push(e.message));
  page.on("response", (response) => {
    if (response.status() >= 400)
      failures.push(`${response.status()} ${response.url()}`);
  });
  page.on("console", (m) => {
    if (["error", "warning"].includes(m.type())) failures.push(m.text());
  });
  const credential = JSON.parse(
    await readFile(
      path.join(ROOT, "storage/private/browser-verification.json"),
      "utf8",
    ),
  );
  await page.goto(adminOrigin + "/admin/");
  await page.getByLabel("用户名", { exact: true }).fill(credential.username);
  await page
    .getByLabel("密码", { exact: true })
    .fill(credential.password ?? credential.temporaryPassword);
  await page.getByRole("button", { name: "登录后台", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "概览", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/overview$/u);
  await expect(page.locator(".sidebar nav button")).toHaveCount(6);
  await expect(
    page.locator(".sidebar").getByRole("button", { name: "媒体资源" }),
  ).toHaveCount(0);
  await expect(
    page.locator(".sidebar").getByRole("button", { name: "资源覆盖" }),
  ).toHaveCount(0);
  const publicPage = await context.newPage();
  const measurements = [];
  for (const [width, height] of SIZES) {
    await page.setViewportSize({ width: width!, height: height! });
    await expect
      .poll(() =>
        page
          .locator(".admin-stage")
          .evaluate((e) =>
            Math.abs(
              e.getBoundingClientRect().right -
                document.documentElement.clientWidth,
            ),
          ),
      )
      .toBeLessThan(2);
    const value = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
      documentHeight: document.documentElement.scrollHeight,
      zoom: Number(getComputedStyle(document.querySelector(".admin-stage")!).zoom),
      stageHeight: document
        .querySelector(".admin-stage")!
        .getBoundingClientRect().height,
    }));
    expect(value.scroll).toBeLessThanOrEqual(value.client);
    expect(value.zoom).toBeCloseTo(value.client / 1440, 5);
    measurements.push({ width, height, ...value });
    await page.screenshot({
      path: `screenshots/admin-overview-${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  const session = (
    await (
      await page.request.get(adminOrigin + "/api/v1/admin/auth/session")
    ).json()
  ).Data;
  const api = async (url: string, method = "GET", data?: unknown) => {
    const response = await page.request.fetch(adminOrigin + "/api/v1/admin" + url, { method, data, headers: { Origin: adminOrigin, "X-CSRF-Token": session.csrfToken } });
    expect(response.status()).toBe(200);
    return (await response.json()).Data;
  };
  const deleteFromEditor = async () => {
    const id = (await page.locator(".editor-toolbar p").innerText())
      .split("/")
      .at(-1)!
      .trim();
    await page.getByRole("button", { name: "返回列表", exact: true }).click();
    await page.getByLabel("搜索资源").fill(id);
    await page
      .locator(`tr[data-row-key="${id}"]`)
      .getByRole("button", { name: "删除", exact: true })
      .click();
    await page.getByRole("button", { name: "删除并发布", exact: true }).click();
    await expect(
      page.getByText("对象已移入可恢复记录。", { exact: true }).last(),
    ).toBeVisible();
  };
  const cases = [
    {
      type: "products",
      menu: "产品介绍设置",
      field: "详细说明",
      key: "description",
      value: "浏览器界面发布验证，原产品资料在验证后恢复。",
      publicPath: "/products",
      selector: ".dialog-description",
    },
    {
      type: "sections",
      menu: "公司首页设置",
      field: "标题",
      key: "title",
      value: "工程由板开始，界面发布验证",
      publicPath: "/",
      selector: "h1",
    },
    {
      type: "categories",
      menu: "产品介绍设置",
      field: "名称",
      key: "name",
      value: "计算类别界面验证",
      publicPath: "/products",
      selector: ".category-index-title",
    },
    {
      type: "pages",
      menu: "公司首页设置",
      field: "页面描述",
      key: "meta_description",
      value: "页面搜索说明界面验证",
      publicPath: "/",
      selector: 'meta[name="description"]',
    },
  ];
  const results = [];
  for (const item of cases) {
    const list = await api(`/resources/${item.type}?limit=500`);
    const baseline = (
      item.type === "settings"
        ? list.items.find((r: ResourceRecord) => r.id === "company_name")
        : item.type === "sections"
          ? list.items.find(
              (r: ResourceRecord) =>
                r.values.page_id === 1 && r.values.section_type === "hero",
            )
          : list.items[0]
    ) as ResourceRecord;
    await navigate(page, item.menu);
    if (item.type === "products")
      await page.getByRole("button", { name: "产品资料", exact: true }).click();
    if (item.type === "categories")
      await page.getByRole("button", { name: "产品类别", exact: true }).click();
    if (item.type === "pages")
      await page.getByRole("button", { name: "页面信息", exact: true }).click();
    await page.getByLabel("搜索资源").fill(baseline.id);
    await page
      .getByRole("button", { name: "编辑", exact: true })
      .first()
      .click();
    await expect(page).toHaveURL(new RegExp(`/admin/[^/]+/${item.type}/${encodeURIComponent(baseline.id)}`));
    await page.getByLabel(item.field, { exact: true }).fill(item.value);
    if (item.type === "products") {
      await page.getByRole("tab", { name: "图片与图标", exact: true }).click();
      await expect(page.locator(".icon-field .ant-select")).toHaveCount(0);
    }
    if (item.type === "sections") {
      await page.getByRole("tab", { name: "展示设置", exact: true }).click();
      await page.getByLabel("板块样式", { exact: true }).click();
      await page.locator(".ant-select-dropdown:visible").getByTitle("soft", { exact: true }).click();
      await page
        .getByRole("textbox", { name: "板块背景", exact: true })
        .fill("#edf2ea");
    }
    await page.getByRole("button", { name: "保存并发布", exact: true }).click();
    await expect
      .poll(
        async () =>
          (await api(`/resources/${item.type}/${baseline.id}`)).values[
            item.key
          ],
      )
      .toBe(item.value);
    await expect(
      page
        .getByText("内容已保存并发布，刷新公开页面即可查看。", {
          exact: true,
        })
        .last(),
    ).toBeVisible();
    try {
      await publicPage.goto(item.publicPath);
      if (item.type === "products")
        await publicPage
          .locator(`[data-product-slug="${baseline.values.slug}"]`)
          .click();
      if (item.type === "products")
        await expect(
          publicPage.locator(`.product-dialog [data-managed-icon="${baseline.values.icon}"]`),
        ).toBeVisible();
      if (item.type === "sections")
        await expect(
          publicPage.locator('.managed-section[data-style="soft"]').first(),
        ).toHaveCSS("background-color", "rgb(237, 242, 234)");
      if (item.type === "pages")
        await expect(publicPage.locator(item.selector)).toHaveAttribute(
          "content",
          item.value,
        );
      else
        await expect(
          publicPage
            .locator(item.selector)
            .filter({ hasText: item.value })
            .first(),
        ).toBeVisible();
      await page.screenshot({
        path: `screenshots/admin-edit-${item.type}.png`,
        fullPage: true,
      });
    } finally {
      const current = await api(`/resources/${item.type}/${baseline.id}`);
      await api(`/resources/${item.type}/${baseline.id}`, "PATCH", { version: current.version, operationId: randomUUID(), changes: Object.fromEntries(baseline.fields.filter((field: ResourceRecord["fields"][number]) => !field.readonly).map((field: ResourceRecord["fields"][number]) => [field.key, getValue(baseline.values, field.key) ?? null])) });
    }
    await expect
      .poll(
        async () =>
          (await api(`/resources/${item.type}/${baseline.id}`)).values[
            item.key
          ],
      )
      .toEqual(baseline.values[item.key]);
    results.push({
      type: item.type,
      id: baseline.id,
      uiSave: true,
      publicVerified: true,
      baselineRepublished: true,
    });
    await page.getByRole("button", { name: "返回列表", exact: true }).click();
  }
  await navigate(page, "公司首页设置");
  const hero = (await api("/resources/sections?limit=500")).items.find(
    (record: ResourceRecord) =>
      record.values.page_id === 1 && record.values.section_type === "hero",
  ) as ResourceRecord;
  const previousHero = await api(`/resources/sections/${hero.id}`);
  await page.getByLabel("搜索资源").fill(hero.id);
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await page.getByRole("tab", { name: "图片与图标", exact: true }).click();
  const uploadResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/media/uploads") &&
      response.request().method() === "POST",
  );
  const originalMedia = previousHero.relatedMedia.find((media: ResourceRecord) => media.id === String(previousHero.values.media_id));
  expect(originalMedia).toBeTruthy();
  const uploadFixture = path.join(ROOT, "storage/media", String(originalMedia.values.file_name));
  const imageField = page.locator(".editor-form .ant-form-item").filter({ has: page.locator("label", { hasText: /^图片$/u }) });
  await expect(imageField.locator(".ant-select")).toHaveCount(0);
  await imageField.locator("input[type=file]").setInputFiles(uploadFixture);
  const uploadedResponse = await uploadResponse;
  expect(uploadedResponse.ok()).toBe(true);
  const uploadedMedia = (await uploadedResponse.json()).Data;
  const selectedMedia = String(uploadedMedia.id);
  expect(selectedMedia).not.toBe(String(previousHero.values.media_id));
  expect(uploadedMedia.values.file_name).not.toBe(originalMedia.values.file_name);
  await page.getByRole("button", { name: "保存并发布", exact: true }).click();
  await expect
    .poll(async () => (await api(`/resources/sections/${hero.id}`)).values.media_id)
    .toBe(selectedMedia);
  await publicPage.goto("/");
  await expect(
    publicPage.locator(
      `[data-section-id="${hero.values.section_key}"] img[src*="${uploadedMedia.values.file_name}"]`,
    ),
  ).toBeVisible();
  const latestHero = await api(`/resources/sections/${hero.id}`);
  await api(`/resources/sections/${hero.id}`, "PATCH", { version: latestHero.version, operationId: randomUUID(), changes: { media_id: previousHero.values.media_id } });
  await page.reload();
  await expect(page.getByRole("button", { name: "返回列表", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "返回列表", exact: true }).click();
  await navigate(page, "产品介绍设置");
  await page.getByRole("button", { name: "产品类别", exact: true }).click();
  await page.getByRole("button", { name: "创建产品类别", exact: true }).click();
  await page.getByLabel("名称或标题", { exact: true }).fill("界面创建验证类别");
  await page
    .getByLabel("内容说明", { exact: true })
    .fill("验证新增类别与目录的真实联动。");
  await page.getByRole("button", { name: "创建并发布", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "界面创建验证类别",
      exact: true,
      level: 2,
    }),
  ).toBeVisible();
  const category = (await api("/resources/categories?limit=500")).items.find(
    (r: ResourceRecord) => r.values.name === "界面创建验证类别",
  ) as ResourceRecord;
  await page.getByRole("button", { name: "返回列表", exact: true }).click();
  await navigate(page, "产品介绍设置");
  await page.getByRole("button", { name: "产品资料", exact: true }).click();
  await page.getByRole("button", { name: "创建产品", exact: true }).click();
  await page.getByLabel("名称或标题", { exact: true }).fill("界面创建验证产品");
  await page
    .getByLabel("内容说明", { exact: true })
    .fill("验证真实表单创建产品，结束后可恢复删除。");
  await page
    .getByLabel("产品类别", { exact: true })
    .fill("界面创建验证类别");
  await page
    .locator(".ant-select-dropdown:visible .ant-select-item-option")
    .filter({ hasText: "界面创建验证类别" })
    .last()
    .click();
  await expect(page.locator(".ant-modal-body .ant-form-item").filter({ has: page.locator("label", { hasText: /^图片$/u }) }).locator(".ant-select")).toHaveCount(0);
  const productUpload = page.waitForResponse((response) => response.url().endsWith("/media/uploads") && response.request().method() === "POST");
  await page.locator(".ant-modal-body input[type=file]").setInputFiles(uploadFixture);
  const productMediaResponse = await productUpload;
  expect(productMediaResponse.ok()).toBe(true);
  const productMedia = (await productMediaResponse.json()).Data;
  expect(productMedia.id).not.toBe(selectedMedia);
  expect(productMedia.values.file_name).not.toBe(uploadedMedia.values.file_name);
  await page.getByRole("button", { name: "创建并发布", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "界面创建验证产品",
      exact: true,
      level: 2,
    }),
  ).toBeVisible();
  await publicPage.goto("/products");
  await expect(
    publicPage.getByText("界面创建验证产品", { exact: true }),
  ).toBeVisible();
  await deleteFromEditor();
  await navigate(page, "产品介绍设置");
  await page.getByRole("button", { name: "产品类别", exact: true }).click();
  await page.getByLabel("搜索资源").fill(category.id);
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await deleteFromEditor();
  await navigate(page, "产品介绍设置");
  await page.getByRole("button", { name: "页面模块", exact: true }).click();
  await page.getByLabel("搜索资源").clear();
  await page.getByRole("button", { name: /创建页面模块$/u }).click();
  await page.getByLabel("名称或标题", { exact: true }).fill("界面创建验证板块");
  await page
    .getByLabel("内容说明", { exact: true })
    .fill("验证页面板块的创建、隐藏、排序和删除。");
  await page.getByLabel("模块类型", { exact: true }).click();
  await page.keyboard.insertText("自定义类型");
  await page
    .locator(".ant-select-dropdown:visible .ant-select-item-option")
    .filter({ hasText: "自定义类型" })
    .click();
  await page.getByLabel("自定义类型名称", { exact: true }).fill("browser-custom-module");
  await page.getByRole("button", { name: "创建并发布", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "界面创建验证板块",
      exact: true,
      level: 2,
    }),
  ).toBeVisible();
  const section = (await api("/resources/sections?limit=500")).items.find(
    (r: ResourceRecord) => r.values.title === "界面创建验证板块",
  ) as ResourceRecord;
  expect(section.values.section_type).toBe("browser-custom-module");
  await page.getByLabel("显示顺序", { exact: true }).fill("2");
  await page.getByRole("switch", { name: "公开显示", exact: true }).click();
  await page.getByRole("button", { name: "保存并发布", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await api("/resources/sections/" + section.id)).values.is_visible,
    )
    .toBe(false);
  await publicPage.goto("/products");
  await expect(
    publicPage.getByText("界面创建验证板块", { exact: true }),
  ).toHaveCount(0);
  await deleteFromEditor();
  const company = await api("/resources/settings/company_name");
  const bad = await page.request.patch(
    adminOrigin + "/api/v1/admin/resources/settings/company_name",
    {
      headers: { Origin: adminOrigin, "X-CSRF-Token": session.csrfToken },
      data: {
        version: company.version + 1,
        operationId: crypto.randomUUID(),
        changes: { invalid: "bad" },
      },
    },
  );
  expect(bad.status()).toBe(409);
  const linked = await context.newPage();
  await linked.goto(adminOrigin + "/admin/#/settings/company_name");
  await expect(linked.getByRole("textbox", { name: "网站名称", exact: true })).toBeVisible();
  await expect(linked).toHaveURL(/\/admin\/global\/settings#global-name$/u);
  await linked.reload();
  await expect(linked.getByRole("textbox", { name: "网站名称", exact: true })).toBeVisible();
  await linked.close();
  await navigate(page, "个人设置");
  await expect(page.getByRole("heading", { name: "管理员账号", exact: true })).toBeVisible();
  expect(failures).toEqual([]);
  await mkdir("reports", { recursive: true });
  await writeFile(
    "reports/admin-browser-report.json",
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        results,
        measurements,
        upload: true,
        inlineImageUploadAndHistory: true,
        independentMediaPerUpload: true,
        realRoutesAndRefresh: true,
        recoverableDelete: true,
        createCategory: true,
        createProduct: true,
        createSection: true,
        hideAndSort: true,
        browserErrors: failures,
      },
      null,
      2,
    ),
    "utf8",
  );
  await publicPage.close();
});

async function navigate(page: Page, name: string): Promise<void> {
  await page
    .locator(".sidebar")
    .getByRole("button", { name, exact: true })
    .click();
  const leave = page.getByRole("button", { name: "离开编辑", exact: true });
  if (await leave.isVisible()) await leave.click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}
