import { chromium, firefox, webkit, expect, test } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";

// 各引擎使用真实局域网会话检查表单和弹窗，不发布业务修改。
for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  test(`${name} 全局表单与弹窗在尺寸变化后可用`, async ({ baseURL }) => {
    test.setTimeout(120000);
    const credential = JSON.parse(await readFile("../backend/storage/private/browser-verification.json", "utf8"));
    const browser = await engine.launch();
    try {
      const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 960 }, ...(name === "chromium" ? { isMobile: true, hasTouch: true } : {}) });
      const page = await context.newPage();
      const failures: string[] = [];
      page.on("pageerror", (error) => failures.push(error.message));
      await page.goto("/admin/global/settings");
      await page.getByLabel("用户名", { exact: true }).fill(credential.username);
      await page.getByLabel("密码", { exact: true }).fill(credential.password ?? credential.temporaryPassword);
      await page.getByRole("button", { name: "登录后台", exact: true }).click();
      await expect(page.getByLabel("网站名称", { exact: true })).toBeVisible({ timeout: 20000 });
      const measurements = [];
      for (const [width, height] of [[320, 700], [390, 844], [768, 1024], [1440, 900], [2560, 600]]) {
        await page.setViewportSize({ width: width!, height: height! });
        await expect.poll(() => page.locator(".admin-stage").evaluate((element) => Math.abs(element.getBoundingClientRect().width - document.documentElement.clientWidth))).toBeLessThan(2);
        const metrics = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
        expect(metrics.scroll).toBeLessThanOrEqual(metrics.client);
        measurements.push({ width, height, ...metrics });
        await page.getByRole("combobox", { name: "字体", exact: true }).click();
        await expect(page.locator(".ant-select-dropdown:visible")).toBeVisible();
        await page.keyboard.press("Escape");
        await page.locator('[data-global-group="footer"]').getByRole("button", { name: "历史与恢复" }).click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        const bounds = await dialog.boundingBox();
        expect(bounds!.x).toBeGreaterThanOrEqual(-1);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width! + 1);
        await dialog.locator(".ant-modal-close").click();
        await expect(dialog).toBeHidden();
        await page.locator('[data-global-group="footer"]').getByRole("button", { name: "历史与恢复" }).click();
        await expect(dialog).toBeVisible();
        await dialog.locator(".ant-modal-close").click();
      }
      const pinchMeasurements = [];
      if (name === "chromium") {
        await page.setViewportSize({ width: 390, height: 844 });
        const session = await context.newCDPSession(page);
        for (const factor of [1.5, 2, 3, 1]) {
          await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: factor });
          await expect.poll(() => page.locator(".admin-stage").evaluate((element) => Math.abs(element.getBoundingClientRect().width - window.visualViewport!.width))).toBeLessThan(1);
          await page.locator('[data-global-group="footer"]').getByRole("button", { name: "历史与恢复" }).tap();
          const dialog = page.getByRole("dialog");
          await expect(dialog).toBeVisible();
          const bounds = await dialog.boundingBox();
          const viewport = await page.evaluate(() => ({ width: visualViewport!.width, left: visualViewport!.offsetLeft }));
          expect(bounds!.x).toBeGreaterThanOrEqual(viewport.left - 1);
          expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.left + viewport.width + 1);
          pinchMeasurements.push({ factor, viewport, bounds });
          await dialog.evaluate(async (element) => { await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished)); });
          const closePoint = await dialog.locator(".ant-modal-close").evaluate((element) => {
            const bounds = element.getBoundingClientRect();
            const x = bounds.x + bounds.width / 2;
            const y = bounds.y + bounds.height / 2;
            return { x, y, hitsClose: element.contains(document.elementFromPoint(x, y)) };
          });
          expect(closePoint.hitsClose).toBe(true);
          await page.touchscreen.tap(closePoint.x, closePoint.y);
          await expect(dialog).toBeHidden();
        }
        await session.detach();
      }
      expect(failures).toEqual([]);
      await writeFile(`reports/admin-${name}-compatibility.json`, JSON.stringify({ passed: true, measurements, pinchMeasurements, failures }, null, 2), "utf8");
      await context.close();
    } finally { await browser.close(); }
  });
}
