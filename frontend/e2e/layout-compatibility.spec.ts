import { expect, test, chromium, firefox, webkit, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";

const VIEWPORTS = [[320, 700], [390, 844], [768, 1024], [1024, 768], [1440, 900], [1920, 1080], [2560, 600]] as const;
const PATHS = ["/", "/products", "/about"];
const ENGINES = { chromium, firefox, webkit };

async function measure(page: Page) {
  return page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>(".design-stage")!;
    const viewport = window.visualViewport!;
    const rectangle = stage.getBoundingClientRect();
    return {
      width: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
      scale: Number(getComputedStyle(stage).zoom),
      viewportWidth: viewport.width,
      viewportScale: viewport.scale,
      left: rectangle.left,
      right: rectangle.right,
      viewportLeft: viewport.offsetLeft,
      grids: [...document.querySelectorAll(".product-grid")].map((grid) => getComputedStyle(grid).gridTemplateColumns.split(" ").length),
    };
  });
}

for (const [engineName, engine] of Object.entries(ENGINES)) {
  test(`${engineName} 三页尺寸、像素密度和横向结构`, async ({ baseURL }) => {
    test.setTimeout(180000);
    const browser = await engine.launch();
    const failures: string[] = [];
    const measurements = [];
    try {
      const context = await browser.newContext({ baseURL });
      const page = await context.newPage();
      page.on("pageerror", (failure) => failures.push(failure.message));
      page.on("console", (message) => { if (["warning", "error"].includes(message.type())) failures.push(message.text()); });
      for (const address of PATHS) {
        await page.goto(address);
        await expect(page.locator("main h1")).toBeVisible();
        for (const [width, height] of VIEWPORTS) {
          await page.setViewportSize({ width, height });
          await expect.poll(async () => Math.abs((await measure(page)).scale - width / 1440)).toBeLessThan(0.001);
          const value = await measure(page);
          expect(value.scroll).toBeLessThanOrEqual(value.width);
          expect(value.right).toBeLessThanOrEqual(value.width + 1);
          expect(value.grids.every((count) => count === 5)).toBe(true);
          measurements.push({ address, requestedWidth: width, requestedHeight: height, ...value });
        }
      }
      for (const density of [1, 1.25, 1.5, 2, 3]) {
        const denseContext = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, deviceScaleFactor: density });
        const densePage = await denseContext.newPage();
        await densePage.goto("/products");
        await expect.poll(async () => (await measure(densePage)).scale).toBeCloseTo(390 / 1440, 3);
        const value = await measure(densePage);
        expect(value.scroll).toBeLessThanOrEqual(value.width);
        measurements.push({ density, ...value });
        await denseContext.close();
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/products");
      await page.locator(".product-tile").last().click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await page.setViewportSize({ width: 1024, height: 768 });
      await expect.poll(async () => {
        const rectangle = await dialog.boundingBox();
        return Boolean(rectangle && rectangle.x >= 0 && rectangle.x + rectangle.width <= 1025 && rectangle.y >= -1 && rectangle.y + rectangle.height <= 769);
      }).toBe(true);
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      expect(failures).toEqual([]);
      await writeFile(`reports/layout-${engineName}.json`, JSON.stringify({ passed: true, engine: engineName, measurements, failures }, null, 2), "utf8");
      await context.close();
    } finally { await browser.close(); }
  });
}

test("双指缩放后的可见区域持续等比铺满", async ({ baseURL }) => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await page.goto("/products");
    const session = await context.newCDPSession(page);
    const measurements = [];
    for (const factor of [1, 1.5, 2, 3, 1]) {
      await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: factor });
      await expect.poll(async () => {
        const value = await measure(page);
        return Math.abs(value.scale - value.viewportWidth / 1440);
      }).toBeLessThan(0.001);
      const value = await measure(page);
      expect(value.scroll).toBeLessThanOrEqual(value.width);
      expect(value.left).toBeGreaterThanOrEqual(value.viewportLeft - 1);
      expect(value.right).toBeLessThanOrEqual(value.viewportLeft + value.viewportWidth + 1);
      measurements.push({ factor, ...value });
    }
    await writeFile("reports/pinch-zoom.json", JSON.stringify({ passed: true, measurements }, null, 2), "utf8");
    await context.close();
  } finally { await browser.close(); }
});
