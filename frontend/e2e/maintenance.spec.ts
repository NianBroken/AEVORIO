import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { ApiResponse, SitePayload } from "../lib/site-types";

const execute = promisify(execFile);
const backendDirectory = path.resolve(process.cwd(), "../backend");
const maintenanceScript = path.join(
  backendDirectory,
  "scripts/maintain-content.ts",
);
const typeScriptRuntime = path.join(
  backendDirectory,
  "node_modules/tsx/dist/cli.mjs",
);

// 维护验收只在普通网站验收完成后执行，且无论断言是否通过都恢复真实内容。
test("数据库文字与产品图片替换立即显示，验收后恢复原内容", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const originalResponse = await request.get("/api/v1/site?page=products");
  const originalEnvelope =
    (await originalResponse.json()) as ApiResponse<SitePayload>;
  const original = originalEnvelope.Data;
  expect(originalEnvelope.Code).toBe(0);
  if (!original) throw new Error("数据库产品内容尚未提供");
  const product = original.products[0];
  const alternate = original.products[10];
  if (!product || !alternate)
    throw new Error("产品目录没有足够的图片数据供维护验收");

  const stagingDirectory = await mkdtemp(
    path.join(os.tmpdir(), "aevorio-browser-maintenance-"),
  );
  const originalPath = path.join(stagingDirectory, "original.png");
  const originalImage = await readFile(
    path.join(backendDirectory, "storage/media", product.media.fileName),
  );
  const originalHash = createHash("sha256").update(originalImage).digest("hex");
  await writeFile(originalPath, originalImage, { flag: "wx" });
  const replacementSource = path.join(
    backendDirectory,
    "storage/media",
    "home-engineering.png",
  );
  const resourceKey = `product-${product.slug}`;
  const editedDescription =
    "浏览器维护验收文字，单独验证该产品的说明已从真实数据库更新。";
  const editedCompany = "企业名称示例验证";
  let imageChanged = false;
  let companyChanged = false;
  let descriptionChanged = false;

  try {
    await maintain("product", product.slug, editedDescription);
    descriptionChanged = true;
    await maintain("company", editedCompany);
    companyChanged = true;
    await page.goto("/products");
    await expect(page.locator(".wordmark-name")).toHaveText(editedCompany);
    const productButton = page.locator(`[data-product-slug="${product.slug}"]`);
    await productButton.click();
    await expect(page.locator(".dialog-description")).toHaveText(
      editedDescription,
    );
    await page.getByRole("button", { name: "关闭产品说明" }).click();

    const imageLocator = productButton.locator("img");
    await expect(imageLocator).toBeVisible();
    const beforePixels = createHash("sha256")
      .update(await imageLocator.screenshot())
      .digest("hex");
    await maintain("image", resourceKey, replacementSource);
    imageChanged = true;
    await page.reload();
    await expect(productButton).toBeVisible();
    await productButton.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        imageLocator.evaluate((element) => {
          const image = element as HTMLImageElement;
          return image.complete && image.naturalWidth > 0;
        }),
      )
      .toBe(true);
    const afterPixels = createHash("sha256")
      .update(await imageLocator.screenshot())
      .digest("hex");
    expect(afterPixels).not.toBe(beforePixels);
    const updated = (await (
      await request.get("/api/v1/site?page=products")
    ).json()) as ApiResponse<SitePayload>;
    expect(updated.Data?.products[0]?.media.url).not.toBe(product.media.url);
    expect(updated.Data?.products[0]?.media.sha256).not.toBe(originalHash);
    await productButton.click();
    await page.screenshot({
      path: "screenshots/maintenance-replacement-dialog.png",
    });
    await page.getByRole("button", { name: "关闭产品说明" }).click();
  } finally {
    if (imageChanged) await maintain("image", resourceKey, originalPath);
    if (descriptionChanged)
      await maintain("product", product.slug, product.description);
    if (companyChanged)
      await maintain("company", original.settings.companyName);
    await rm(stagingDirectory, { recursive: true, force: true });
  }

  await page.reload();
  await expect(page.locator(".wordmark-name")).toHaveText(
    original.settings.companyName,
  );
  await page.locator(`[data-product-slug="${product.slug}"]`).click();
  await expect(page.locator(".dialog-description")).toHaveText(
    product.description,
  );
  await page.getByRole("button", { name: "关闭产品说明" }).click();
  const restored = (await (
    await request.get("/api/v1/site?page=products")
  ).json()) as ApiResponse<SitePayload>;
  expect(restored.Data?.products[0]?.description).toBe(product.description);
  expect(restored.Data?.products[10]?.description).toBe(alternate.description);
  const restoredImage = await readFile(
    path.join(backendDirectory, "storage/media", product.media.fileName),
  );
  expect(createHash("sha256").update(restoredImage).digest("hex")).toBe(
    restored.Data?.products[0]?.media.sha256,
  );
  await writeFile(
    "reports/browser-maintenance-report.json",
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        databaseTextVisible: true,
        companyNameVisible: true,
        imagePixelsChanged: true,
        mediaVersionedUrlChanged: true,
        originalContentRestored: true,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
});

async function maintain(...args: string[]): Promise<void> {
  await execute(
    process.execPath,
    [typeScriptRuntime, maintenanceScript, ...args],
    {
      cwd: backendDirectory,
      encoding: "utf8",
      timeout: 20_000,
      windowsHide: true,
    },
  );
}
