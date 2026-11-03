import { expect, test, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const PAGE_CASES = [
  { path: '/', slug: 'home', sections: 12, screenshot: 'home' },
  { path: '/products', slug: 'products', sections: 13, screenshot: 'products' },
  { path: '/about', slug: 'about', sections: 12, screenshot: 'about' },
] as const;

const VIEWPORT_WIDTHS = [1920, 1600, 1440, 1280, 1024, 768, 390, 320];
const browserFailures = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const failures: string[] = [];
  browserFailures.set(page, failures);
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') failures.push(message.text());
  });
});

test.afterEach(async ({ page }) => {
  expect(browserFailures.get(page) ?? []).toEqual([]);
});

test.describe('三个网站页面', () => {
  for (const pageCase of PAGE_CASES) {
    test(`${pageCase.path} 显示数据库内容并保存截图`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 960 });
      await page.goto(pageCase.path);

      await expect(page.locator(`[data-page="${pageCase.slug}"]`)).toBeVisible();
      await expect(page.locator('main h1')).toHaveCount(1);
      await expect(page.locator('header .nav-link')).toHaveCount(3);
      await expect(page.locator('section[data-section-id]')).toHaveCount(pageCase.sections);
      await expect(page.locator('.footer-note')).toContainText('示例');
      await waitForAllImages(page);

      if (pageCase.slug === 'products') {
        await expect(page.locator('.category-index-row')).toHaveCount(9);
        await expect(page.locator('.product-category-section')).toHaveCount(9);
        await expect(page.locator('.product-tile')).toHaveCount(45);
        await expect(page.locator('.product-grid')).toHaveCount(9);
        for (const grid of await page.locator('.product-grid').all()) {
          await expect(grid.locator('.product-tile')).toHaveCount(5);
        }
      }

      const imageReport = await page.locator('img').evaluateAll((elements) => elements.map((element) => {
        const image = element as HTMLImageElement;
        return {
          alt: image.getAttribute('alt'),
          source: image.currentSrc,
          loaded: image.complete && image.naturalWidth > 0,
        };
      }));
      expect(imageReport.length).toBeGreaterThan(0);
      expect(imageReport.every((image) => image.loaded && image.alt?.trim())).toBe(true);

      await page.screenshot({ path: `screenshots/${pageCase.screenshot}-first-viewport.png` });
      await page.screenshot({ path: `screenshots/${pageCase.screenshot}-full-page.png`, fullPage: true });
    });
  }
});

test('产品说明弹窗支持焦点管理与 Escape 关闭', async ({ page }) => {
  await page.goto('/products');
  const firstProduct = page.locator('.product-tile').first();
  await firstProduct.focus();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('h2')).toContainText(await firstProduct.locator('.product-tile-title').innerText());
  await expect(page.getByRole('button', { name: '关闭产品说明' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: '关闭产品说明' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: '关闭产品说明' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(firstProduct).toBeFocused();

  await firstProduct.click();
  await expect(dialog).toBeVisible();
  await page.getByRole('button', { name: '关闭产品说明' }).click();
  await expect(dialog).toHaveCount(0);
});

test('四十五个产品分别打开对应说明', async ({ page }) => {
  await page.goto('/products');
  const buttons = await page.locator('.product-tile').all();
  expect(buttons).toHaveLength(45);
  const names = [];
  for (const button of buttons) {
    const name = await button.locator('.product-tile-title').innerText();
    names.push(name);
    await button.click();
    await expect(page.locator('#product-dialog-title')).toHaveText(name);
    await expect(page.locator('.dialog-description')).not.toBeEmpty();
    await expect(page.locator('.dialog-feature-group li')).toHaveCount(2);
    await page.keyboard.press('Escape');
    await expect(button).toBeFocused();
  }
  expect(new Set(names).size).toBe(45);
});

test('窄屏产品说明和减少动态效果设置保持可用', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/products');
  const button = page.locator('.product-tile').last();
  await button.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  if (!bounds) throw new Error('窄屏弹窗尚未进入可见区域');
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(740);
  await page.screenshot({ path: 'screenshots/products-dialog-320.png' });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(button).toBeFocused();
  expect(await button.locator('img').evaluate((element) => getComputedStyle(element).transitionDuration)).toBe('1e-05s');
});

test('未知路径回到首页', async ({ page }) => {
  await page.goto('/not-a-public-page');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('[data-page="home"]')).toBeVisible();
});

for (const pageCase of PAGE_CASES) {
test(`${pageCase.slug} 的八种视口保持同一画布比例`, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(pageCase.path);
  await expect(page.locator('section[data-section-id]')).toHaveCount(pageCase.sections);
  await waitForAllImages(page);

  let baselineHeight = 0;
  const measurements = [];
  for (const width of VIEWPORT_WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(async () => page.locator('.scaled-page-shell').getAttribute('data-scale-factor'))
      .toBe((width / 1440).toFixed(5));
    const dimensions = await page.evaluate(() => {
      const shell = document.querySelector<HTMLElement>('.scaled-page-shell');
      const stage = document.querySelector<HTMLElement>('.design-stage');
      const grid = document.querySelector<HTMLElement>('.product-grid');
      if (!shell || !stage) throw new Error('固定画布元素不存在');
      return {
        viewportWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        stageWidth: stage.getBoundingClientRect().width,
        logicalHeight: stage.scrollHeight,
        shellHeight: shell.getBoundingClientRect().height,
        columns: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : null,
      };
    });

    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
    expect(dimensions.stageWidth).toBeCloseTo(width, 0);
    if (pageCase.slug === 'products') expect(dimensions.columns).toBe(5);
    if (baselineHeight === 0) baselineHeight = dimensions.logicalHeight;
    expect(dimensions.logicalHeight).toBe(baselineHeight);
    expect(Math.abs(dimensions.shellHeight - dimensions.logicalHeight * width / 1440)).toBeLessThanOrEqual(1);
    measurements.push({ requestedWidth: width, ...dimensions });
    await page.screenshot({ path: `screenshots/${pageCase.slug}-${width}-full-page.png`, fullPage: true });
  }
  await writeFile(`reports/layout-${pageCase.slug}.json`, `${JSON.stringify(measurements, null, 2)}\n`, 'utf8');
});
}

test('三个导航入口和页面元数据可以实际访问', async ({ page }) => {
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') failures.push(message.text());
  });
  await page.goto('/');
  const titles = [];
  for (const pageCase of PAGE_CASES) {
    await page.locator(`.primary-nav a[href="${pageCase.path}"]`).click();
    await expect(page.locator(`[data-page="${pageCase.slug}"]`)).toBeVisible();
    await expect(page.locator('.primary-nav a[aria-current="page"]')).toHaveAttribute('href', pageCase.path);
    const description = await page.locator('meta[name="description"]').getAttribute('content');
    expect(description?.length).toBeGreaterThan(15);
    titles.push(await page.title());
  }
  expect(new Set(titles).size).toBe(3);
  expect(failures).toEqual([]);
});

async function waitForAllImages(page: Page): Promise<void> {
  await expect.poll(() => page.locator('img').count()).toBeGreaterThan(0);
  await page.locator('img').evaluateAll(async (images) => {
    await Promise.all(images.map(async (element) => {
      const image = element as HTMLImageElement;
      image.loading = 'eager';
      if (!image.complete) await new Promise<void>((resolve) => {
        image.addEventListener('load', () => resolve(), { once: true });
        image.addEventListener('error', () => resolve(), { once: true });
      });
      if (image.decode) await image.decode().catch(() => undefined);
    }));
  });
  await expect.poll(() => page.locator('img').evaluateAll((elements) =>
    elements.every((element) => {
      const image = element as HTMLImageElement;
      return image.complete && image.naturalWidth > 0;
    }))).toBe(true);
}
