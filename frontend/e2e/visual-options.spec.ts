import { chromium, firefox, webkit, expect, test, type BrowserContext } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { ICON_NAMES, type ResourceRecord } from "../../shared/content";

const SIZES = [[320, 700], [390, 844], [768, 1024], [1024, 768], [1280, 800], [1440, 900], [1600, 900], [1920, 1080], [2560, 600]];

// 三种浏览器共享一次真实登录会话，避免重复登录消耗服务端限额。
test.describe.configure({ mode: "serial" });
let storageState: Awaited<ReturnType<BrowserContext["storageState"]>>;
test.beforeAll(async ({ baseURL }) => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL });
  try {
    const page = await context.newPage();
    const credential = JSON.parse(await readFile("../backend/storage/private/browser-verification.json", "utf8"));
    await page.goto("/admin/global/settings");
    await page.getByLabel("用户名", { exact: true }).fill(credential.username);
    await page.getByLabel("密码", { exact: true }).fill(credential.password ?? credential.temporaryPassword);
    await page.getByRole("button", { name: "登录后台", exact: true }).click();
    await expect(page.getByLabel("网站名称", { exact: true })).toBeVisible({ timeout: 20000 });
    storageState = await context.storageState();
  } finally { await context.close(); await browser.close(); }
});

for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  test(`${name} 资源菜单直接展示实际效果且不横向溢出`, async ({ baseURL }) => {
    test.setTimeout(180000);
    const browser = await engine.launch();
    const context = await browser.newContext({ baseURL, storageState });
    const page = await context.newPage();
    const failures: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    page.on("console", (message) => { if (["warning", "error"].includes(message.type())) failures.push(message.text()); });
    try {
      await page.goto("/admin/global/settings");
      await expect(page.getByLabel("网站名称", { exact: true })).toBeVisible({ timeout: 20000 });
      await expect(page.locator(".page-heading h1, .page-heading .eyebrow, .global-settings-links")).toHaveCount(0);
      await expect(page.getByLabel("网站名称", { exact: true })).toBeVisible();
      const icons = page.locator(".icon-field .ant-select").first();
      await icons.click();
      const popup = page.locator(".ant-select-dropdown:visible");
      await expect(popup.locator("svg[data-managed-icon]")).toHaveCount(ICON_NAMES.length);
      await page.keyboard.press("Escape");
      await expect(page.locator(".ant-select-dropdown:visible")).toHaveCount(0);
      for (const [label, count] of [["字体", 3], ["背景装饰", 2]] as const) {
        const field = page.getByRole("combobox", { name: label, exact: true });
        await field.click();
        await expect(popup.locator("[data-visual-value]")).toHaveCount(count);
        await page.keyboard.press("Escape");
        await expect(page.locator(".ant-select-dropdown:visible")).toHaveCount(0);
      }
      const measurements = [];
      for (const [width, height] of SIZES) {
        await page.setViewportSize({ width: width!, height: height! });
        await page.getByRole("combobox", { name: "字体", exact: true }).click();
        await expect(popup).toBeVisible();
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
        const bounds = await popup.boundingBox();
        expect(bounds!.x).toBeGreaterThanOrEqual(-1);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width! + 1);
        measurements.push({ width, height, bounds });
        await page.keyboard.press("Escape");
        await expect(page.locator(".ant-select-dropdown:visible")).toHaveCount(0);
      }
      await page.setViewportSize({ width: 1440, height: 900 });
      const list = (await (await page.request.get("/api/v1/admin/resources/sections?limit=100")).json()).Data.items as ResourceRecord[];
      const section = list.find((record) => record.fields.some((field) => field.key.endsWith("imagePosition")));
      expect(section).toBeTruthy();
      await page.goto(`/admin/home/sections/${section!.id}`);
      await page.getByRole("tab", { name: "展示设置", exact: true }).click();
      for (const key of ["style", "imageFit", "imagePosition"]) {
        const field = section!.fields.find((item) => item.key.endsWith(key))!;
        await page.getByRole("combobox", { name: field.label, exact: true }).click();
        await expect(popup.locator("[data-visual-value]")).toHaveCount(field.options!.length);
        if (key !== "style") {
          await expect.poll(() => popup.locator("img").evaluateAll((images) => images.length > 0 && images.every((image) => (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
          if (name === "chromium" && key === "imagePosition") {
            await mkdir("screenshots", { recursive: true });
            await page.screenshot({ path: "screenshots/visual-image-position.png" });
          }
        }
        await page.keyboard.press("Escape");
        await expect(page.locator(".ant-select-dropdown:visible")).toHaveCount(0);
      }
      expect(failures).toEqual([]);
      await writeFile(`reports/visual-options-${name}.json`, JSON.stringify({ passed: true, measurements, failures }, null, 2), "utf8");
    } finally { await context.close(); await browser.close(); }
  });
}
