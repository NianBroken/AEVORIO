import { expect, test, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";

const PAGE_CASES = [
  { path: "/", slug: "home", screenshot: "home" },
  { path: "/products", slug: "products", screenshot: "products" },
  { path: "/about", slug: "about", screenshot: "about" },
] as const;

const VIEWPORTS: Array<[number, number]> = [
  [1920, 1080],
  [1440, 900],
  [1280, 720],
  [1024, 768],
  [768, 1024],
  [390, 844],
  [360, 800],
];
const browserFailures = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const failures: string[] = [];
  browserFailures.set(page, failures);
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning")
      failures.push(message.text());
  });
});

test.afterEach(async ({ page }) => {
  expect(browserFailures.get(page) ?? []).toEqual([]);
});

test.describe("三个网站页面", () => {
  for (const pageCase of PAGE_CASES) {
    test(`${pageCase.path} 显示数据库内容并保存截图`, async ({
      page,
      request,
    }) => {
      const payload = (
        await (await request.get("/api/v1/site?page=" + pageCase.slug)).json()
      ).Data;
      await page.setViewportSize({ width: 1440, height: 960 });
      await page.goto(pageCase.path);

      await expect(
        page.locator(`[data-page="${pageCase.slug}"]`),
      ).toBeVisible();
      await expect(page.locator("main h1")).toHaveCount(1);
      await expect(page.locator("header .nav-link")).toHaveCount(3);
      await expect(page.locator("section[data-section-id]")).toHaveCount(
        payload.page.sections.length,
      );
      await expect(page.locator(".footer-note")).toContainText("示例");
      await waitForAllImages(page);

      if (pageCase.slug === "products") {
        await expect(page.locator(".category-index-row")).toHaveCount(
          payload.categories.length,
        );
        await expect(page.locator(".product-category-section")).toHaveCount(
          payload.categories.length,
        );
        await expect(page.locator(".product-tile")).toHaveCount(
          payload.products.length,
        );
        await expect(page.locator(".product-grid")).toHaveCount(
          payload.categories.length,
        );
        for (const grid of await page.locator(".product-grid").all()) {
          const slug = await grid.locator("..").getAttribute("data-category");
          expect(await grid.locator(".product-tile").count()).toBe(
            payload.products.filter(
              (p: { categorySlug: string }) => p.categorySlug === slug,
            ).length,
          );
        }
      }

      const imageReport = await page.locator("img").evaluateAll((elements) =>
        elements.map((element) => {
          const image = element as HTMLImageElement;
          return {
            alt: image.getAttribute("alt"),
            source: image.currentSrc,
            loaded: image.complete && image.naturalWidth > 0,
          };
        }),
      );
      expect(imageReport.length).toBeGreaterThan(0);
      expect(
        imageReport.every((image) => image.loaded && image.alt?.trim()),
      ).toBe(true);

      await page.screenshot({
        path: `screenshots/${pageCase.screenshot}-first-viewport.png`,
      });
      await page.screenshot({
        path: `screenshots/${pageCase.screenshot}-full-page.png`,
        fullPage: true,
      });
    });
  }
});

test("产品说明弹窗支持焦点管理与 Escape 关闭", async ({ page }) => {
  await page.goto("/products");
  const firstProduct = page.locator(".product-tile").first();
  await firstProduct.focus();
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("h2")).toContainText(
    await firstProduct.locator(".product-tile-title").innerText(),
  );
  await expect(
    page.getByRole("button", { name: "关闭产品说明" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "关闭产品说明" }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    page.getByRole("button", { name: "关闭产品说明" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(firstProduct).toBeFocused();

  await firstProduct.click();
  await expect(dialog).toBeVisible();
  await page.getByRole("button", { name: "关闭产品说明" }).click();
  await expect(dialog).toHaveCount(0);
});

test("全部已发布产品分别打开对应说明", async ({ page, request }) => {
  const payload = (
    await (await request.get("/api/v1/site?page=products")).json()
  ).Data;
  await page.goto("/products");
  const buttons = await page.locator(".product-tile").all();
  expect(buttons).toHaveLength(payload.products.length);
  const names = [];
  for (const button of buttons) {
    const name = await button.locator(".product-tile-title").innerText();
    names.push(name);
    await button.click();
    await expect(page.locator("#product-dialog-title")).toHaveText(name);
    await expect(page.locator(".dialog-description")).not.toBeEmpty();
    const slug = await button.getAttribute("data-product-slug");
    await expect(page.locator(".dialog-feature-group li")).toHaveCount(
      payload.products.find((p: { slug: string }) => p.slug === slug).features
        .length,
    );
    await page.keyboard.press("Escape");
    await expect(button).toBeFocused();
  }
  expect(names.length).toBe(payload.products.length);
});

test("窄屏产品说明和减少动态效果设置保持可用", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/products");
  const button = page.locator(".product-tile").last();
  await button.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  if (!bounds) throw new Error("窄屏弹窗尚未进入可见区域");
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(740);
  await page.screenshot({ path: "screenshots/products-dialog-320.png" });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(button).toBeFocused();
  expect(
    await button
      .locator("img")
      .evaluate((element) => getComputedStyle(element).transitionDuration),
  ).toBe("1e-05s");
});

test("未知路径回到首页", async ({ page }) => {
  await page.goto("/not-a-public-page");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('[data-page="home"]')).toBeVisible();
});

for (const pageCase of PAGE_CASES) {
  test(`${pageCase.slug} 的七种视口保持同一画布比例`, async ({
    page,
    request,
  }) => {
    const payload = (
      await (await request.get("/api/v1/site?page=" + pageCase.slug)).json()
    ).Data;
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto(pageCase.path);
    await expect(page.locator("section[data-section-id]")).toHaveCount(
      payload.page.sections.length,
    );
    await waitForAllImages(page);

    let baselineHeight = 0;
    const measurements = [];
    for (const [width, height] of VIEWPORTS) {
      await page.setViewportSize({ width: width!, height: height! });
      await expect
        .poll(async () =>
          page.locator(".scaled-page-shell").getAttribute("data-scale-factor"),
        )
        .toBe((width! / 1440).toFixed(5));
      const dimensions = await page.evaluate(() => {
        const shell = document.querySelector<HTMLElement>(".scaled-page-shell");
        const stage = document.querySelector<HTMLElement>(".design-stage");
        const grid = document.querySelector<HTMLElement>(".product-grid");
        if (!shell || !stage) throw new Error("固定画布元素不存在");
        return {
          viewportWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          stageWidth: stage.getBoundingClientRect().width,
          zoom: Number(getComputedStyle(stage).zoom),
          logicalHeight: stage.scrollHeight,
          shellHeight: shell.getBoundingClientRect().height,
          columns: grid
            ? getComputedStyle(grid).gridTemplateColumns.split(" ").length
            : null,
        };
      });

      expect(dimensions.scrollWidth).toBeLessThanOrEqual(
        dimensions.viewportWidth,
      );
      expect(dimensions.stageWidth).toBeCloseTo(width, 0);
      expect(dimensions.zoom).toBeCloseTo(width / 1440, 5);
      if (pageCase.slug === "products") expect(dimensions.columns).toBe(5);
      if (baselineHeight === 0) baselineHeight = dimensions.logicalHeight;
      // zoom 在布局阶段按设备像素舍入，检查总高度比例与固定列关系。
      expect(Math.abs(dimensions.logicalHeight - baselineHeight) / baselineHeight).toBeLessThan(0.005);
      expect(
        Math.abs(
          dimensions.shellHeight - (dimensions.logicalHeight * width!) / 1440,
        ),
      ).toBeLessThanOrEqual(1);
      measurements.push({
        requestedWidth: width,
        requestedHeight: height,
        ...dimensions,
      });
      await page.screenshot({
        path: `screenshots/${pageCase.slug}-${width}-full-page.png`,
        fullPage: true,
      });
    }
    await writeFile(
      `reports/layout-${pageCase.slug}.json`,
      `${JSON.stringify(measurements, null, 2)}\n`,
      "utf8",
    );
  });
}

test("三个导航入口和页面元数据可以实际访问", async ({ page }) => {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning")
      failures.push(message.text());
  });
  await page.goto("/");
  const titles = [];
  for (const pageCase of PAGE_CASES) {
    await page.locator(`.primary-nav a[href="${pageCase.path}"]`).click();
    await expect(page.locator(`[data-page="${pageCase.slug}"]`)).toBeVisible();
    await expect(
      page.locator('.primary-nav a[aria-current="page"]'),
    ).toHaveAttribute("href", pageCase.path);
    const description = await page
      .locator('meta[name="description"]')
      .getAttribute("content");
    expect(description?.length).toBeGreaterThan(15);
    titles.push(await page.title());
  }
  expect(new Set(titles).size).toBe(3);
  expect(failures).toEqual([]);
});

async function waitForAllImages(page: Page): Promise<void> {
  await expect.poll(() => page.locator("img").count()).toBeGreaterThan(0);
  await page.locator("img").evaluateAll(async (images) => {
    await Promise.all(
      images.map(async (element) => {
        const image = element as HTMLImageElement;
        image.loading = "eager";
        if (!image.complete)
          await new Promise<void>((resolve) => {
            image.addEventListener("load", () => resolve(), { once: true });
            image.addEventListener("error", () => resolve(), { once: true });
          });
        if (image.decode) await image.decode().catch(() => undefined);
      }),
    );
  });
  await expect
    .poll(() =>
      page.locator("img").evaluateAll((elements) =>
        elements.every((element) => {
          const image = element as HTMLImageElement;
          return image.complete && image.naturalWidth > 0;
        }),
      ),
    )
    .toBe(true);
}

for (const [width, height] of VIEWPORTS) {
  test(`后台加载与登录 ${width}×${height} 不横向溢出`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    await page.route("**/api/v1/admin/auth/session", async (route) => {
      await waiting;
      await route.continue();
    });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/admin/overview", { waitUntil: "domcontentloaded" });
    try {
      await expect(page.locator(".loading-page")).toBeVisible();
      const loading = await page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
        supportsZoom: CSS.supports("zoom", "calc(100cqw / 1440px)"),
      }));
      expect(loading.supportsZoom).toBe(true);
      expect(loading.scroll).toBeLessThanOrEqual(loading.width);
      await page.screenshot({ path: `screenshots/admin-loading-${width}.png` });
    } finally { release(); }
    await expect(page.locator(".login-page")).toBeVisible();
    await expect.poll(() => page.locator(".admin-stage").evaluate((stage) =>
      Math.abs(stage.getBoundingClientRect().width - document.documentElement.clientWidth),
    )).toBeLessThan(1);
    const login = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
      height: document.querySelector(".login-page")!.getBoundingClientRect().height,
      viewportHeight: window.innerHeight,
    }));
    expect(login.scroll).toBeLessThanOrEqual(login.width);
    expect(login.height).toBeGreaterThanOrEqual(login.viewportHeight - 1);
    expect(errors).toEqual([]);
    await page.screenshot({ path: `screenshots/admin-login-${width}.png` });
  });
}
