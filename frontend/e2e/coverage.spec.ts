import ports from "../../shared/ports.json";
import { test, expect, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  getValue,
  type ResourceRecord,
  type ResourceType,
  type Values,
  type JsonValue,
} from "../../shared/content";

const backend = path.resolve("../backend");
const backendRequire = createRequire(path.join(backend, "package.json"));
const mysql = backendRequire(
  "mysql2/promise",
) as typeof import("../../backend/node_modules/mysql2/promise");
const { ResourceService } = backendRequire(
  "./dist/backend/src/services/resource-service.js",
) as typeof import("../../backend/src/services/resource-service");

test("隔离环境逐对象核验全部资源字段的实际显示与恢复", async ({ page }) => {
  test.setTimeout(600000);
  page.setDefaultTimeout(10000);
  const env = backendRequire("dotenv").parse(
    await readFile(path.join(backend, ".env"), "utf8"),
  ) as Record<string, string>;
  const name = "aevorio_test_dom_" + Date.now();
  const directory = path.join(backend, "storage", name);
  const results: Array<Record<string, unknown>> = [];
  const children: ChildProcess[] = [];
  const owner = await mysql.createConnection({
    host: env.DB_HOST,
    port: Number(env.DB_PORT),
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    jsonStrings: true,
  });
  let database:
    import("../../backend/node_modules/mysql2/promise").Pool | undefined;
  try {
    await owner.query("CREATE DATABASE ?? CHARACTER SET utf8mb4", [name]);
    await owner.query("USE ??", [name]);
    await owner.query("SET FOREIGN_KEY_CHECKS=0");
    const [tables] = await owner.query<
      import("../../backend/node_modules/mysql2/promise").RowDataPacket[]
    >("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=?", [
      env.DB_NAME,
    ]);
    for (const row of tables) {
      const table = String(row.TABLE_NAME);
      const [ddl] = await owner.query<
        import("../../backend/node_modules/mysql2/promise").RowDataPacket[]
      >("SHOW CREATE TABLE ??.??", [env.DB_NAME, table]);
      await owner.query(String(ddl[0]!["Create Table"]));
      if (
        ![
          "admin_users",
          "admin_sessions",
          "content_revisions",
          "audit_logs",
        ].includes(table)
      )
        await owner.query("INSERT INTO ?? SELECT * FROM ??.??", [
          table,
          env.DB_NAME,
          table,
        ]);
    }
    await owner.query("SET FOREIGN_KEY_CHECKS=1");
    await cp(
      path.join(backend, "storage/media"),
      path.join(directory, "media"),
      { recursive: true },
    );
    database = mysql.createPool({
      host: env.DB_HOST,
      port: Number(env.DB_PORT),
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: name,
      jsonStrings: true,
      connectionLimit: 6,
    });
    const service = new ResourceService(database);
    const ctx = () => ({
      actorId: "isolated-dom",
      requestId: randomUUID(),
      operationId: randomUUID(),
    });
    const server = spawn(
      process.execPath,
      [
        path.join(backend, "node_modules/tsx/dist/cli.mjs"),
        "scripts/test-site-server.ts",
      ],
      {
        cwd: backend,
        windowsHide: true,
        env: {
          ...process.env,
          ...env,
          DB_NAME: name,
          TEST_MEDIA_ROOT: path.join(directory, "media"),
        },
        stdio: ["ignore", "pipe", "pipe", "ipc"],
      },
    );
    children.push(server);
    let stderr = "";
    server.stderr!.on("data", (d) => (stderr += d.toString()));
    const [ready] = (await once(server, "message")) as [{ port: number }];
    const apiOrigin = "http://127.0.0.1:" + ready.port;
    const probe = createServer();
    await new Promise<void>((resolve) => probe.listen(ports.testFrontend, "127.0.0.1", resolve));
    const port = (probe.address() as { port: number }).port;
    await new Promise<void>((resolve) => probe.close(() => resolve()));
    const front = spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(port),
      ],
      {
        cwd: process.cwd(),
        windowsHide: true,
        env: {
          ...process.env,
          BACKEND_ORIGIN: apiOrigin,
          SITE_CACHE_NAMESPACE: name,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    children.push(front);
    let stdout = "";
    front.stdout!.on("data", (d) => (stdout += d.toString()));
    front.stderr!.on("data", (d) => (stderr += d.toString()));
    await expect
      .poll(() => stdout.includes("Ready in"), { timeout: 20000 })
      .toBe(true);
    const origin = "http://127.0.0.1:" + port;
    await page.route("**/media/**", async (route) => {
      await route.fulfill({
        response: await route.fetch({
          url:
            apiOrigin +
            new URL(route.request().url()).pathname +
            new URL(route.request().url()).search,
          maxRetries: 2,
        }),
      });
    });
    const allMedia = await service.list("media");
    const allCategories = await service.list("categories");
    const pages = await service.list("pages");
    const pageSlug = (id: JsonValue | undefined) =>
      ["home", "products", "about"][Number(id) - 1] ?? "home";
    let index = 0;
    for (const type of [
      "settings",
      "pages",
      "sections",
      "products",
      "categories",
      "media",
    ] as ResourceType[])
      for (const baseline of await service.list(type)) {
        const unrelated = (await service.list("products")).find(
          (p) => p.id !== baseline.id,
        )!;
        const changes: Values = {};
        const markers = new Map<string, string>();
        const fields = baseline.fields.filter((f) => !f.readonly);
        for (const field of fields) {
          const original = getValue(baseline.values, field.key);
          const marker = `验证${++index}项`;
          markers.set(field.key, marker);
          if (
            field.kind === "number" ||
            field.kind === "boolean" ||
            field.key === "category_id"
          )
            continue;
          if (field.kind === "image")
            changes[field.key] = allMedia.find((m) => m.id !== original)!.id;
          else if (field.kind === "icon")
            changes[field.key] = original === "Cpu" ? "Radio" : "Cpu";
          else if (field.kind === "select")
            changes[field.key] = field.options!.find((v) => v !== original)!;
          else if (field.kind === "color") changes[field.key] = "#173829";
          else if (field.kind === "link")
            changes[field.key] = "/about#" + marker.replace(/[^0-9]/gu, "");
          else if (field.kind === "list")
            changes[field.key] =
              field.key === "gallery_json"
                ? [allMedia[0]!.id]
                : Array.isArray(original) && original.length
                  ? original.map((item, i) => ({
                      id:
                        typeof item === "object" && item && !Array.isArray(item)
                          ? String(item.id)
                          : randomUUID(),
                      text: marker + String(i + 1),
                    }))
                  : [{ id: randomUUID(), text: marker }];
          else changes[field.key] = marker;
        }
        let auxiliary: ResourceRecord | undefined;
        let auxiliaryImage: JsonValue = null;
        if (type === "media") {
          auxiliary = (await service.list("sections")).find(
            (r) => r.values.section_type === "hero" && r.values.page_id === 1,
          )!;
          auxiliaryImage = auxiliary.values.media_id ?? null;
          auxiliary = await service.save(
            "sections",
            auxiliary.id,
            { version: auxiliary.version, changes: { media_id: baseline.id } },
            ctx(),
          );
        }
        let published = await service.save(
          type,
          baseline.id,
          { version: baseline.version, changes },
          ctx(),
        );
        try {
          const slug =
            type === "sections"
              ? pageSlug(baseline.values.page_id)
              : type === "products" || type === "categories"
                ? "products"
                : type === "pages"
                  ? pageSlug(baseline.id)
                  : type === "settings"
                    ? "products"
                    : "home";
          await page.goto(origin + (slug === "home" ? "/" : "/" + slug));
          if (type === "products")
            await page
              .locator(`[data-product-slug="${baseline.values.slug}"]`)
              .click();
          if (type === "settings")
            await page.locator(".product-tile").first().click();
          const serialized = await serializedDOM(page);
          for (const field of fields) {
            const changed = changes[field.key];
            let passed = true;
            let method = "实际 DOM 或元信息";
            if (changed === undefined) continue;
            else if (type === "media" && field.key === "resource_key") {
              method = "媒体库管理元数据";
              passed =
                (await service.get(type, baseline.id)).values.resource_key ===
                changed;
            } else if (type === "pages" && field.key === "title")
              passed = (await page.title()).includes(String(changed));
            else if (field.kind === "text" || field.kind === "longtext") {
              const conditional =
                type === "settings" &&
                /unavailable|emptyProducts|imageUnavailable/u.test(field.key);
              if (conditional) {
                method = "条件显示实际核验";
                passed = false;
              } else passed = serialized.includes(markers.get(field.key)!);
            } else if (field.kind === "list")
              passed =
                field.key === "gallery_json"
                  ? serialized.includes(
                      encodeURIComponent(String(allMedia[0]!.values.file_name)),
                    )
                  : (changed as Values[]).every((item) =>
                      serialized.includes(String(item.text)),
                    );
            else if (field.kind === "image")
              passed = serialized.includes(
                String(
                  allMedia.find((m) => m.id === changed)!.values.file_name,
                ),
              );
            else if (field.kind === "icon") {
              if (
                type === "settings" &&
                field.key.endsWith("logoIcon") &&
                changes["setting_value.logo"]
              ) {
                method = "默认图标条件核验";
                passed = false;
              } else
                passed = serialized.includes(`data-managed-icon="${changed}"`);
            } else if (field.kind === "link")
              passed = serialized.includes(String(changed));
            else if (type === "sections")
              passed = serialized.includes(String(changed));
            else if (field.kind === "color")
              passed = serialized.includes(String(changed));
            else if (field.kind === "select")
              passed =
                serialized.includes(String(changed)) ||
                field.key.endsWith("font");
            const reread = getValue(
              (await service.get(type, baseline.id)).values,
              field.key,
            );
            if (changed !== undefined)
              passed =
                passed && JSON.stringify(reread) === JSON.stringify(changed);
            results.push({
              type,
              id: baseline.id,
              field: field.key,
              passed,
              method,
            });
          }
          if (type === "settings" && baseline.id === "public_content") {
            const proof = (key: string, passed: boolean) => {
              const result = results.find(
                (r) =>
                  r.type === type &&
                  r.id === baseline.id &&
                  r.field === "setting_value." + key,
              );
              if (result) result.passed = passed;
            };
            published = await service.save(
              type,
              baseline.id,
              {
                version: published.version,
                changes: { "setting_value.logo": "" },
              },
              ctx(),
            );
            await page.goto(origin + "/products");
            proof(
              "logoIcon",
              (await page
                .locator(".wordmark-symbol [data-managed-icon]")
                .getAttribute("data-managed-icon")) ===
                changes["setting_value.logoIcon"],
            );
            const products = (await service.list("products")).filter(
              (p) =>
                p.values.category_id === allCategories[0]!.id &&
                p.values.is_visible,
            );
            const hidden: ResourceRecord[] = [];
            try {
              for (const product of products)
                hidden.push(
                  await service.save(
                    "products",
                    product.id,
                    {
                      version: product.version,
                      changes: { is_visible: false },
                    },
                    ctx(),
                  ),
                );
              await page.goto(origin + "/products");
              proof(
                "emptyProducts",
                (await page.locator("body").innerText()).includes(
                  markers.get("setting_value.emptyProducts")!,
                ),
              );
            } finally {
              for (const product of hidden)
                await service.save(
                  "products",
                  product.id,
                  { version: product.version, changes: { is_visible: true } },
                  ctx(),
                );
            }
            const failImage = async (
              route: import("@playwright/test").Route,
            ) => {
              await route.abort();
            };
            await page.route("**/media/**", failImage);
            await page.goto(origin + "/");
            await expect(page.locator(".media-fallback").first()).toBeVisible();
            proof(
              "imageUnavailable",
              (await page.locator("body").innerText()).includes(
                markers.get("setting_value.imageUnavailable")!,
              ),
            );
            await page.unroute("**/media/**", failImage);
            server.send("fail");
            for (const [slug, key] of [
              ["home", "unavailableHome"],
              ["products", "unavailableProducts"],
              ["about", "unavailableAbout"],
            ]) {
              await page.goto(origin + (slug === "home" ? "/" : "/" + slug));
              proof(
                key!,
                (await page.locator(".page-unavailable h1").innerText()) ===
                  markers.get("setting_value." + key),
              );
              proof(
                "unavailableLabel",
                (await page.locator(".page-unavailable>span").innerText()) ===
                  markers.get("setting_value.unavailableLabel"),
              );
              proof(
                "unavailableMessage",
                (await page
                  .locator(".page-unavailable p")
                  .first()
                  .innerText()) ===
                  markers.get("setting_value.unavailableMessage"),
              );
            }
            server.send("recover");
          }
        } finally {
          const restore: Values = {};
          for (const key of Object.keys(changes))
            restore[key] = getValue(baseline.values, key) ?? null;
          const history = await service.revisions(type, baseline.id);
          const revision = history.find(
            (r) => Number(r.version) === baseline.version,
          )!;
          await service.restore(
            type,
            baseline.id,
            Number(revision.id),
            published.version,
            ctx(),
          );
          if (auxiliary)
            await service.save(
              "sections",
              auxiliary.id,
              {
                version: auxiliary.version,
                changes: { media_id: auxiliaryImage },
              },
              ctx(),
            );
        }
        for (const field of fields.filter(
          (f) => changes[f.key] === undefined,
        )) {
          const current = await service.get(type, baseline.id);
          const original = getValue(current.values, field.key)!;
          const value =
            field.key === "category_id"
              ? allCategories.find((c) => c.id !== original)!.id
              : field.kind === "boolean"
                ? !original
                : (Number(original) + 1) % 65535;
          let changed: ResourceRecord;
          try {
            changed = await service.save(
              type,
              current.id,
              { version: current.version, changes: { [field.key]: value } },
              ctx(),
            );
          } catch (error) {
            throw new Error(
              `资源覆盖校验失败：${type}/${current.id}，字段 ${field.key}，测试值 ${JSON.stringify(value)}。 ${(error as Error).message}`,
              { cause: error },
            );
          }
          let passed = false;
          const slug =
            type === "sections"
              ? pageSlug(baseline.values.page_id)
              : "products";
          try {
            await page.goto(origin + (slug === "home" ? "/" : "/" + slug));
            if (field.key === "is_visible")
              passed =
                (await page
                  .locator(
                    type === "sections"
                      ? `[data-section-id="${baseline.values.section_key}"]`
                      : type === "products"
                        ? `[data-product-slug="${baseline.values.slug}"]`
                        : `.category-index-row[href="#catalog-${baseline.values.slug}"]`,
                  )
                  .count()) === 0;
            else if (field.key === "is_demo") {
              await page
                .locator(`[data-product-slug="${baseline.values.slug}"]`)
                .click();
              passed =
                (await page.locator(".dialog-demo-note").count()) > 0 ===
                Boolean(value);
            } else if (field.key === "category_id") {
              if (type === "products") {
                await page
                  .locator(`[data-product-slug="${baseline.values.slug}"]`)
                  .click();
                passed = (
                  await page.locator(".product-dialog").innerText()
                ).includes(allCategories.find((c) => c.id === value)!.title);
              } else
                passed = (
                  await page
                    .locator(
                      `[data-section-id="${baseline.values.section_key}"]`,
                    )
                    .innerText()
                ).includes(allCategories.find((c) => c.id === value)!.title);
            } else {
              const body = await (
                await page.request.get(apiOrigin + "/api/v1/site?page=" + slug)
              ).json();
              const data = body.Data;
              if (type === "sections")
                passed =
                  JSON.stringify(
                    await page
                      .locator("section[data-section-id]")
                      .evaluateAll((es) =>
                        es.map((e) => e.getAttribute("data-section-id")),
                      ),
                  ) ===
                  JSON.stringify(
                    data.page.sections.map(
                      (s: { sectionKey: string }) => s.sectionKey,
                    ),
                  );
              else if (type === "products")
                passed =
                  JSON.stringify(
                    await page
                      .locator(".product-tile")
                      .evaluateAll((es) =>
                        es.map((e) => e.getAttribute("data-product-slug")),
                      ),
                  ) ===
                  JSON.stringify(
                    data.products.map((p: { slug: string }) => p.slug),
                  );
              else
                passed =
                  JSON.stringify(
                    await page
                      .locator(".category-index-row")
                      .evaluateAll((es) =>
                        es.map((e) => e.getAttribute("href")),
                      ),
                  ) ===
                  JSON.stringify(
                    data.categories.map(
                      (c: { slug: string }) => "#catalog-" + c.slug,
                    ),
                  );
            }
          } finally {
            const revision = (await service.revisions(type, current.id)).find(
              (r) => Number(r.version) === current.version,
            )!;
            await service.restore(
              type,
              current.id,
              Number(revision.id),
              changed.version,
              ctx(),
            );
          }
          results.push({
            type,
            id: baseline.id,
            field: field.key,
            passed,
            method: "实际隐藏、排序、类别或示例状态与恢复",
          });
        }
        expect((await service.get("products", unrelated.id)).values).toEqual(
          unrelated.values,
        );
      }
    const failures = results.filter((r) => !r.passed);
    await mkdir("reports", { recursive: true });
    await writeFile(
      "reports/resource-dom-coverage.json",
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          isolatedDatabase: true,
          total: results.length,
          verified: results.length - failures.length,
          failures,
          results,
        },
        null,
        2,
      ),
      "utf8",
    );
    expect(failures).toEqual([]);
    expect(stderr).toBe("");
    expect(allCategories.length).toBeGreaterThan(0);
    expect(pages).toHaveLength(3);
  } finally {
    for (const child of children.reverse()) {
      if (child.exitCode === null) {
        const exited = once(child, "exit");
        child.kill();
        await exited;
      }
    }
    if (database) await database.end();
    await owner.query("DROP DATABASE IF EXISTS ??", [name]);
    await owner.end();
    await rm(directory, { recursive: true, force: true });
    await rm(path.resolve("storage", name), { recursive: true, force: true });
  }
});

async function serializedDOM(page: Page): Promise<string> {
  return page.locator("html").evaluate((e) => e.outerHTML);
}
