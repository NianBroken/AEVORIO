import { expect, test } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getValue, type ResourceRecord, type Values } from "../../shared/content";

// 浏览器写入均在结束时按最新版本恢复，正式账户与原有内容保持完整。
test("全局内容直接编辑、分组发布、冲突、失败保留及图片", async ({ page, context }) => {
  test.setTimeout(240000);
  page.setDefaultTimeout(20000);
  const credential = JSON.parse(await readFile(path.resolve("../backend/storage/private/browser-verification.json"), "utf8"));
  await page.goto("/admin/global/settings");
  await page.getByLabel("用户名", { exact: true }).fill(credential.username);
  await page.getByLabel("密码", { exact: true }).fill(credential.password ?? credential.temporaryPassword);
  await page.getByRole("button", { name: "登录后台", exact: true }).click();
  await expect(page.getByLabel("网站名称", { exact: true })).toBeVisible({ timeout: 20000 });
  const origin = new URL(page.url()).origin;
  const session = (await (await page.request.get(origin + "/api/v1/admin/auth/session")).json()).Data;
  const get = async (id: string): Promise<ResourceRecord> => (await (await page.request.get(origin + "/api/v1/admin/resources/settings/" + id)).json()).Data;
  const patch = async (id: string, changes: Values) => {
    const current = await get(id);
    const response = await page.request.patch(origin + "/api/v1/admin/resources/settings/" + id, { headers: { Origin: origin, "X-CSRF-Token": session.csrfToken }, data: { version: current.version, operationId: randomUUID(), changes } });
    expect(response.ok()).toBe(true);
    return (await response.json()).Data as ResourceRecord;
  };
  const recoveryFile = process.env.AEVORIO_SETTINGS_RECOVERY;
  if (recoveryFile) {
    const originals = JSON.parse(await readFile(recoveryFile, "utf8")) as ResourceRecord[];
    for (const original of originals) await patch(original.id, Object.fromEntries(original.fields.filter((field) => !field.readonly).map((field) => [field.key, getValue(original.values, field.key) ?? null])));
    await page.reload();
    await expect(page.getByLabel("网站名称", { exact: true })).toBeVisible();
  }
  const baseline = await Promise.all([get("company_name"), get("public_content")]);
  const group = (key: string) => page.locator(`[data-global-group="${key}"]`);
  const publish = async (key: string) => {
    const result = page.waitForResponse((response) => response.url().includes("/resources/settings/") && response.request().method() === "PATCH");
    await group(key).getByRole("button", { name: "保存并发布", exact: true }).click();
    expect((await result).ok()).toBe(true);
    await expect(group(key).locator(".ant-btn-primary")).toBeDisabled();
    await expect(group(key).locator(".ant-btn-primary")).not.toHaveClass(/ant-btn-loading/u, { timeout: 20000 });
  };
  const publicPage = await context.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  try {
    await expect(page.getByRole("button", { name: "刷新数据", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "历史与恢复", exact: true })).toHaveCount(0);
    await expect(page.locator(".global-settings .ant-table")).toHaveCount(0);
    await expect(page.locator(".global-settings .editor-toolbar")).toHaveCount(0);
    await expect(page.getByLabel("搜索资源")).toHaveCount(0);
    for (const record of baseline) {
      for (const field of record.fields.filter((item) => !item.readonly)) {
        await expect(page.locator(`[data-global-field="${field.key}"]`)).toHaveCount(1);
      }
    }
    await page.getByLabel("网站名称", { exact: true }).fill("网站名称分组验收");
    await page.getByLabel("版权说明", { exact: true }).fill("页脚尚未发布的输入");
    await publish("name");
    expect((await get("company_name")).values.setting_value).toBe("网站名称分组验收");
    expect(getValue((await get("public_content")).values, "setting_value.copyright")).toEqual(getValue(baseline[1]!.values, "setting_value.copyright"));
    await expect(page.getByLabel("版权说明", { exact: true })).toHaveValue("页脚尚未发布的输入");
    for (const address of ["/", "/products", "/about"]) {
      await publicPage.goto(address);
      await expect(publicPage.locator(".wordmark-name")).toHaveText("网站名称分组验收");
      await expect(publicPage.locator('meta[name="application-name"]')).toHaveAttribute("content", "网站名称分组验收");
      await expect(publicPage.locator('meta[property="og:site_name"]')).toHaveAttribute("content", "网站名称分组验收");
    }
    const examples = [
      ["brand", "品牌说明", "brandTagline", "品牌内容验收"],
      ["navigation", "顶部链接文字", "headerNote", "页眉内容验收"],
      ["footer", "页脚署名", "footerAttribution", "可编辑页脚署名验收"],
      ["products", "特点标题", "featuresTitle", "产品特点验收"],
      ["messages", "图片失败说明", "imageUnavailable", "图片提示验收"],
      ["appearance", "次要文字颜色", "inkMuted", "#66776a"],
    ];
    for (const [key, label, field, value] of examples) {
      await page.getByRole("textbox", { name: label!, exact: true }).fill(value!);
      await publish(key!);
      expect(getValue((await get("public_content")).values, "setting_value." + field)).toBe(value);
    }
    await page.getByLabel("页脚署名", { exact: true }).fill("");
    await publish("footer");
    for (const address of ["/", "/products", "/about"]) {
      await publicPage.goto(address);
      await expect(publicPage.locator(".footer-attribution")).toHaveCount(0);
    }
    await page.getByLabel("顶部链接文字", { exact: true }).fill("其他分组保留草稿");
    await patch("public_content", { "setting_value.footerSummary": "并发发布的页脚摘要" });
    await page.getByLabel("品牌说明", { exact: true }).fill("冲突后确认发布");
    await group("brand").getByRole("button", { name: "保存并发布", exact: true }).click();
    await expect(page.getByRole("dialog").filter({ hasText: "内容已由其他操作更新" })).toBeVisible();
    await page.getByRole("button", { name: "以当前输入重新提交" }).click();
    await expect.poll(async () => getValue((await get("public_content")).values, "setting_value.brandTagline")).toBe("冲突后确认发布");
    expect(getValue((await get("public_content")).values, "setting_value.footerSummary")).toBe("并发发布的页脚摘要");
    await expect(page.getByLabel("顶部链接文字", { exact: true })).toHaveValue("其他分组保留草稿");
    await page.route("**/api/v1/admin/resources/settings/public_content", async (route) => {
      if (route.request().method() === "PATCH") await route.fulfill({ status: 503, json: { Code: 5000, Messages: "验收期间的受控保存失败", Data: null } });
      else await route.continue();
    });
    await group("navigation").getByRole("button", { name: "保存并发布", exact: true }).click();
    await expect(page.getByText("验收期间的受控保存失败", { exact: true })).toBeVisible();
    await expect(page.getByLabel("顶部链接文字", { exact: true })).toHaveValue("其他分组保留草稿");
    await page.unroute("**/api/v1/admin/resources/settings/public_content");
    await page.locator(".sidebar nav").getByRole("button", { name: "个人设置" }).click();
    await page.getByRole("button", { name: "继续编辑", exact: true }).click();
    await publish("navigation");
    const originalIcon = baseline[1]!.relatedMedia?.find((media) => media.id === getValue(baseline[1]!.values, "setting_value.favicon"));
    expect(originalIcon).toBeTruthy();
    const uploadResponse = page.waitForResponse((response) => response.url().endsWith("/media/uploads") && response.request().method() === "POST");
    const faviconField = group("brand").locator(".ant-form-item").filter({ has: page.locator("label", { hasText: /^站点图标$/u }) });
    await faviconField.locator('input[type="file"]').setInputFiles(path.resolve("../backend/storage/media", String(originalIcon!.values.file_name)));
    const uploaded = (await (await uploadResponse).json()).Data as ResourceRecord;
    await publish("brand");
    for (const address of ["/", "/products", "/about"]) {
      await publicPage.goto(address);
      await expect(publicPage.locator('link[rel="icon"]')).toHaveAttribute("href", new RegExp(String(uploaded.values.file_name)));
    }
    const measurements = [];
    for (const [width, height] of [[320, 700], [390, 844], [768, 1024], [1024, 768], [1440, 900], [1920, 1080], [2560, 600]]) {
      await page.setViewportSize({ width: width!, height: height! });
      await expect.poll(() => page.locator(".admin-stage").evaluate((element) => Math.abs(element.getBoundingClientRect().width - document.documentElement.clientWidth))).toBeLessThan(1);
      const size = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
      expect(size.scroll).toBeLessThanOrEqual(size.width);
      measurements.push({ viewportWidth: width, viewportHeight: height, ...size });
      if (width === 320 || width === 1440) await page.screenshot({ path: `screenshots/global-settings-${width}.png`, fullPage: true });
    }
    expect(pageErrors).toEqual([]);
    await writeFile("reports/global-settings-verification.json", JSON.stringify({ passed: true, origin, groupedSave: true, draftsPreserved: true, attributionEditableAndClearable: true, conflictConfirmation: true, failedSavePreservesInput: true, historyRemoved: true, upload: true, measurements, pageErrors }, null, 2), "utf8");
  } finally {
    await page.unrouteAll({ behavior: "wait" });
    for (const record of baseline) {
      const changes = Object.fromEntries(record.fields.filter((field) => !field.readonly).map((field) => [field.key, getValue(record.values, field.key) ?? null]));
      await patch(record.id, changes);
    }
    await publicPage.close();
  }
});
