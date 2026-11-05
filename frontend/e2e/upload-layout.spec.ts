import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

test("图片字段垂直顺序、默认图标、自定义上传与恢复", async ({ page }) => {
  test.setTimeout(120000);
  const credential = JSON.parse(await readFile(path.resolve("../backend/storage/private/browser-verification.json"), "utf8"));
  await page.goto("/admin/global/settings");
  await page.getByLabel("用户名", { exact: true }).fill(credential.username);
  await page.getByLabel("密码", { exact: true }).fill(credential.password ?? credential.temporaryPassword);
  await page.getByRole("button", { name: "登录后台", exact: true }).click();
  await expect(page.getByLabel("网站名称", { exact: true })).toBeVisible();
  await expect(page.locator(".icon-field .ant-select")).toHaveCount(0);
  const field = page.locator(".icon-field").first();
  const original = await field.locator("[data-visual-value]").getAttribute("data-visual-value");
  const source = path.resolve("../backend/storage/media/site-favicon.png");
  const response = page.waitForResponse(r => r.url().endsWith("/media/uploads") && r.request().method() === "POST");
  await field.locator('input[type="file"]').setInputFiles(source);
  expect((await response).ok()).toBe(true);
  await expect(field.locator("img")).toBeVisible();
  const brand = page.locator('[data-global-group="brand"]');
  await brand.getByRole("button", { name: "保存并发布", exact: true }).click();
  await expect(brand.getByRole("button", { name: "保存并发布", exact: true })).toBeDisabled();
  await page.reload();
  await expect(field.locator("img")).toBeVisible();
  const preview = await field.locator("img").boundingBox();
  const upload = await field.getByRole("button", { name: "上传自定义图片" }).boundingBox();
  expect(preview!.y + preview!.height).toBeLessThanOrEqual(upload!.y);
  await field.getByRole("button", { name: "恢复默认图片" }).click();
  await expect(field.locator("[data-visual-value]")).toHaveAttribute("data-visual-value", original!);
  await expect(field.getByRole("button", { name: "恢复默认图片" })).toBeDisabled();
  await brand.getByRole("button", { name: "保存并发布", exact: true }).click();
  await expect(brand.getByRole("button", { name: "保存并发布", exact: true })).toBeDisabled();
  await page.reload();
  await expect(field.locator("[data-visual-value]")).toHaveAttribute("data-visual-value", original!);
  for (const size of [{ width: 320, height: 700 }, { width: 1440, height: 900 }, { width: 2560, height: 600 }]) {
    await page.setViewportSize(size);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    for (const region of await page.locator(".inline-media-field, .icon-field").all()) {
      const image = region.locator(".visual-image, [data-visual-value]").first();
      const button = region.locator(".ant-upload button").first();
      if (await image.count() && await button.count()) {
        const a = await image.boundingBox(); const b = await button.boundingBox();
        expect(a!.y + a!.height).toBeLessThanOrEqual(b!.y + 1);
      }
    }
  }
  await page.screenshot({ path: "screenshots/upload-default-layout.png", fullPage: true });
});
