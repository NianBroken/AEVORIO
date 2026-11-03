import { expect, test, type Page } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { ResourceRecord } from "../../backend/contracts/content";

const ROOT = path.resolve("../backend");
const SIZES = [
  [1920, 1080],
  [1600, 900],
  [1440, 900],
  [1280, 800],
  [1024, 768],
  [768, 1024],
  [390, 844],
  [320, 700],
];

// 代表资源通过真实界面修改和恢复，保存期间核对公开页面，不直接改写数据库。
test("后台实际管理、即时发布、历史恢复、上传与八种尺寸", async ({
  page,
  context,
}) => {
  const runtime = JSON.parse(
    (await readFile("reports/runtime-services.json", "utf8")).replace(
      /^\uFEFF/u,
      "",
    ),
  );
  const adminOrigin = runtime.backend.url as string;
  test.setTimeout(240000);
  page.setDefaultTimeout(12000);
  const failures: string[] = [];
  page.on("pageerror", (e) => failures.push(e.message));
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
    page.getByRole("heading", { name: "工作概览", exact: true }),
  ).toBeVisible();
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
      stageHeight: document
        .querySelector(".admin-stage")!
        .getBoundingClientRect().height,
    }));
    expect(value.scroll).toBeLessThanOrEqual(value.client + 1);
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
  const api = async (url: string) => {
    const response = await page.request.get(
      adminOrigin + "/api/v1/admin" + url,
    );
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
      menu: "产品管理",
      field: "详细说明",
      key: "description",
      value: "浏览器界面发布验证，原产品资料在验证后恢复。",
      publicPath: "/products",
      selector: ".dialog-description",
    },
    {
      type: "sections",
      menu: "页面内容",
      field: "标题",
      key: "title",
      value: "工程由板开始，界面发布验证",
      publicPath: "/",
      selector: "h1",
    },
    {
      type: "categories",
      menu: "产品类别",
      field: "名称",
      key: "name",
      value: "计算类别界面验证",
      publicPath: "/products",
      selector: ".category-index-title",
    },
    {
      type: "settings",
      menu: "公共内容",
      field: "公司名称",
      key: "setting_value",
      value: "企业名称示例界面验证",
      publicPath: "/",
      selector: ".wordmark-name",
    },
    {
      type: "pages",
      menu: "页面与分享",
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
    await page.getByLabel("搜索资源").fill(baseline.id);
    await page
      .getByRole("button", { name: "编辑", exact: true })
      .first()
      .click();
    await page.getByLabel(item.field, { exact: true }).fill(item.value);
    if (item.type === "products") {
      await page.getByRole("tab", { name: "图片与图标", exact: true }).click();
      await page.getByLabel("图标", { exact: true }).click();
      await page.getByTitle("Radio", { exact: true }).click();
    }
    if (item.type === "sections") {
      await page.getByRole("tab", { name: "展示设置", exact: true }).click();
      await page.getByLabel("板块样式", { exact: true }).click();
      await page.getByTitle("soft", { exact: true }).click();
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
          publicPage.locator('.product-dialog [data-managed-icon="Radio"]'),
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
      await page.getByRole("tab", { name: "历史与恢复" }).click();
      const row = page.locator(".revision-row").filter({
        has: page.getByText(`版本 ${baseline.version}`, { exact: true }),
      });
      await row.getByRole("button", { name: "比较并恢复" }).click();
      const restoredResponse = page.waitForResponse(
        (response) =>
          response
            .url()
            .endsWith(`/revisions/${item.type}/${baseline.id}/restore`) &&
          response.request().method() === "POST",
      );
      await page
        .getByRole("button", { name: "恢复并发布", exact: true })
        .click();
      expect((await restoredResponse).ok()).toBe(true);
      await expect(page.locator(".ant-modal-wrap")).toHaveCount(0);
      await expect(
        page.getByText("历史版本已恢复并发布。", { exact: true }).last(),
      ).toBeVisible();
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
      uiRestore: true,
    });
    await page.getByRole("button", { name: "返回列表", exact: true }).click();
  }
  await navigate(page, "媒体资源");
  const mediaBefore = await api("/resources/media?limit=500");
  await page
    .locator("input[type=file]")
    .setInputFiles(path.join(ROOT, "storage/media/home-engineering.png"));
  await expect(
    page.getByText("图片已保存到媒体库。", { exact: true }),
  ).toBeVisible();
  const mediaAfter = await api("/resources/media?limit=500");
  const uploaded = mediaAfter.items.find(
    (r: ResourceRecord) =>
      !mediaBefore.items.some((b: ResourceRecord) => b.id === r.id),
  ) as ResourceRecord;
  expect(uploaded).toBeTruthy();
  await page.getByLabel("搜索资源").fill(uploaded.id);
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await page.getByRole("tab", { name: "文字与内容" }).click();
  await page
    .getByLabel("图片替代文字", { exact: true })
    .fill("浏览器上传图片说明");
  await page.getByRole("button", { name: "保存并发布", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await api("/resources/media/" + uploaded.id)).values.alt_text,
    )
    .toBe("浏览器上传图片说明");
  const beforeReplacement = await api("/resources/media/" + uploaded.id);
  const replacementResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/media/uploads") &&
      response.request().method() === "POST",
  );
  await page
    .locator(".editor input[type=file]")
    .setInputFiles(path.join(ROOT, "storage/media/about-assembly.png"));
  expect((await replacementResponse).ok()).toBe(true);
  await expect
    .poll(
      async () => (await api("/resources/media/" + uploaded.id)).values.sha256,
    )
    .not.toBe(beforeReplacement.values.sha256);
  await page.getByRole("tab", { name: "历史与恢复" }).click();
  const mediaRevision = page
    .locator(".revision-row")
    .filter({
      has: page.getByText(`版本 ${beforeReplacement.version}`, { exact: true }),
    });
  await mediaRevision.getByRole("button", { name: "比较并恢复" }).click();
  await page.getByRole("button", { name: "恢复并发布", exact: true }).click();
  await expect
    .poll(
      async () => (await api("/resources/media/" + uploaded.id)).values.sha256,
    )
    .toBe(beforeReplacement.values.sha256);
  await expect(page.locator(".ant-modal-wrap")).toHaveCount(0);
  await page.getByRole("button", { name: "返回列表", exact: true }).click();
  await page.getByRole("button", { name: "删除", exact: true }).click();
  await page.getByRole("button", { name: "删除并发布", exact: true }).click();
  await expect
    .poll(async () => (await api("/resources/media/" + uploaded.id)).deleted)
    .toBe(true);
  await navigate(page, "产品类别");
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
  await navigate(page, "产品管理");
  await page.getByRole("button", { name: "创建产品", exact: true }).click();
  await page.getByLabel("名称或标题", { exact: true }).fill("界面创建验证产品");
  await page
    .getByLabel("内容说明", { exact: true })
    .fill("验证真实表单创建产品，结束后可恢复删除。");
  await page.getByLabel("产品类别", { exact: true }).click();
  await page.getByTitle("界面创建验证类别", { exact: true }).click();
  await page.getByLabel("图片", { exact: true }).focus();
  await page.getByLabel("图片", { exact: true }).press("ArrowDown");
  await page.getByLabel("图片", { exact: true }).press("Enter");
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
  await navigate(page, "产品类别");
  await page.getByLabel("搜索资源").fill(category.id);
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await deleteFromEditor();
  const automatic = (await api("/resources/sections?limit=500")).items.find(
    (r: ResourceRecord) => r.values.category_id === category.id,
  ) as ResourceRecord;
  await navigate(page, "页面内容");
  await page.getByLabel("搜索资源").fill(automatic.id);
  await page
    .locator(`tr[data-row-key="${automatic.id}"]`)
    .getByRole("button", { name: "编辑", exact: true })
    .click();
  await deleteFromEditor();
  await page.getByLabel("搜索资源").clear();
  await page.getByRole("button", { name: "创建页面板块", exact: true }).click();
  await page.getByLabel("名称或标题", { exact: true }).fill("界面创建验证板块");
  await page
    .getByLabel("内容说明", { exact: true })
    .fill("验证页面板块的创建、隐藏、排序和删除。");
  await page.getByLabel("所属页面", { exact: true }).click();
  await page
    .locator(".ant-select-dropdown:visible .ant-select-item-option")
    .first()
    .click();
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
  await page.getByLabel("显示顺序", { exact: true }).fill("2");
  await page.getByRole("switch", { name: "公开显示", exact: true }).click();
  await page.getByRole("button", { name: "保存并发布", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await api("/resources/sections/" + section.id)).values.is_visible,
    )
    .toBe(false);
  await publicPage.goto("/");
  await expect(
    publicPage.getByText("界面创建验证板块", { exact: true }),
  ).toHaveCount(0);
  await deleteFromEditor();
  const bad = await page.request.patch(
    adminOrigin + "/api/v1/admin/resources/settings/company_name",
    {
      headers: { Origin: adminOrigin, "X-CSRF-Token": session.csrfToken },
      data: {
        version: 1,
        operationId: crypto.randomUUID(),
        changes: { invalid: "bad" },
      },
    },
  );
  expect(bad.status()).toBe(409);
  const linked = await context.newPage();
  await linked.goto(adminOrigin + "/admin/#/settings/company_name");
  await expect(linked.locator(".editor-toolbar h2")).toHaveText("公司名称");
  await linked.close();
  await navigate(page, "资源覆盖");
  await expect(page.getByText("编辑映射已建立", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "screenshots/admin-coverage.png",
    fullPage: true,
  });
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
        mediaReplacementAndHistory: true,
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
