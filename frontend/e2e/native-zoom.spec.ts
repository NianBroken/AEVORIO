import { chromium, expect, test } from "@playwright/test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

type ZoomApi = { tabs: { query: (query: object) => Promise<Array<{ id: number; url?: string }>>; setZoom: (id: number, factor: number) => Promise<void> } };
const FACTORS = [0.5, 0.8, 1, 1.25, 1.5, 2];

// 扩展调用浏览器原生页面缩放，独立临时配置不接触用户浏览器数据。
test("浏览器原生缩放保持完整画布", async ({ baseURL }) => {
  test.setTimeout(120000);
  const profile = await mkdtemp(path.join(tmpdir(), "aevorio-zoom-"));
  const temporaryRoot = path.resolve(tmpdir()) + path.sep;
  if (!path.resolve(profile).startsWith(temporaryRoot)) throw new Error("临时浏览器目录超出系统临时目录。");
  const extension = path.resolve("e2e/zoom-extension");
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium", headless: true, viewport: null,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, "--window-size=1440,1000"],
  });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const extensionId = new URL(worker.url()).host;
    const driver = await context.newPage();
    await driver.goto(`chrome-extension://${extensionId}/zoom.html`);
    const page = await context.newPage();
    const credential = JSON.parse(await readFile("../backend/storage/private/browser-verification.json", "utf8"));
    await page.goto(new URL("/admin/global/settings", baseURL!).href);
    await page.getByLabel("用户名", { exact: true }).fill(credential.username);
    await page.getByLabel("密码", { exact: true }).fill(credential.password ?? credential.temporaryPassword);
    await page.getByRole("button", { name: "登录后台", exact: true }).click();
    await expect(page.getByLabel("网站名称", { exact: true })).toBeVisible({ timeout: 20000 });
    await page.goto(baseURL!);
    const baselineWidth = await page.evaluate(() => innerWidth);
    const rows = [];
    for (const factor of FACTORS) {
      await driver.evaluate(async ({ targetUrl, zoom }) => {
        const browser = (globalThis as unknown as { chrome: ZoomApi }).chrome;
        const tabs = await browser.tabs.query({});
        const target = tabs.find((tab) => tab.url?.startsWith(targetUrl));
        if (!target) throw new Error("待缩放页面尚未打开。");
        await browser.tabs.setZoom(target.id, zoom);
      }, { targetUrl: baseURL!, zoom: factor });
      await expect.poll(() => page.evaluate(() => innerWidth)).toBeGreaterThan(baselineWidth / factor - 3);
      await expect.poll(() => page.evaluate(() => innerWidth)).toBeLessThan(baselineWidth / factor + 3);
      for (const address of ["/", "/products", "/about", "/admin/global/settings"]) {
        await page.goto(new URL(address, baseURL!).href);
        await expect.poll(() => page.locator(".scaled-canvas-stage").evaluate((element) => Math.abs(element.getBoundingClientRect().width - document.documentElement.clientWidth))).toBeLessThan(2);
        const size = await page.evaluate(() => ({ inner: innerWidth, client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, dpr: devicePixelRatio }));
        expect(size.scroll).toBeLessThanOrEqual(size.client);
        if (address.startsWith("/admin/")) {
          await page.getByRole("combobox", { name: "字体", exact: true }).click();
          await expect(page.locator(".ant-select-dropdown:visible")).toBeVisible();
          await page.keyboard.press("Escape");
          await page.locator('[data-global-group="footer"]').getByRole("button", { name: "历史与恢复" }).click();
          const dialog = page.getByRole("dialog");
          await expect(dialog).toBeVisible();
          const bounds = await dialog.boundingBox();
          expect(bounds!.x).toBeGreaterThanOrEqual(-1);
          expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(size.client + 1);
          await dialog.locator(".ant-modal-close").click();
        }
        rows.push({ factor, address, ...size });
      }
    }
    await writeFile("reports/native-browser-zoom.json", JSON.stringify({ passed: true, method: "chrome.tabs.setZoom", rows }, null, 2), "utf8");
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});
