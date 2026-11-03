import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { PageSlug, SitePayload, SiteRepository } from '../src/types/site';

const PAGE_INFORMATION: Record<
  PageSlug,
  { title: string; sectionCount: number }
> = {
  home: { title: '工程由板开始', sectionCount: 12 },
  products: { title: '硬件产品矩阵', sectionCount: 13 },
  about: { title: '设计之间', sectionCount: 12 },
};

const validApp = createApp({ repository: createSampleRepository() });

describe('AEVORIO 业务接口统一响应与参数验证', () => {
  it.each(['home', 'products', 'about'] as const)(
    '以独立的真实 HTTP 请求完整读取 %s 页面',
    async (slug) => {
      const response = await request(validApp)
        .get('/api/v1/site')
        .query({ page: slug });

      expect(response.status).toBe(200);
      expect(Object.keys(response.body)).toEqual([
        'Code',
        'Messages',
        'Data',
        'RequestId',
        'Timestamp',
      ]);
      expect(response.body.Code).toBe(0);
      expect(response.body.Messages).toContain(PAGE_INFORMATION[slug].title);
      expect(response.body.Messages).toMatch(/[\u4e00-\u9fff]/u);
      expect(response.body.Data.page.slug).toBe(slug);
      expect(response.body.Data.page.sections).toHaveLength(
        PAGE_INFORMATION[slug].sectionCount,
      );
      expect(response.body.Data.settings.companyName).toBe('企业名称（示例）');
      expect(response.body.RequestId).toMatch(/^[0-9a-f-]{36}$/iu);
      expect(Number.isNaN(Date.parse(response.body.Timestamp))).toBe(false);

      if (slug === 'products') {
        expect(response.body.Data.categories).toHaveLength(9);
        expect(response.body.Data.products).toHaveLength(45);
        expect(
          response.body.Data.products.every(
            (product: { isDemo: boolean }) => product.isDemo,
          ),
        ).toBe(true);
      }
    },
  );

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['unknown', 'unknown'],
    ['upper-case', 'HOME'],
    ['simplified-Chinese', '首页'],
    ['punctuation', '<script>alert(1)</script>'],
    ['overlong', 'a'.repeat(320)],
    ['encoded', '%252F%252e%252e%252f.env'],
    ['null-like', '\u0000'],
  ])('明确拒绝 %s 页面参数', async (_scenario, page) => {
    const endpoint = request(validApp).get('/api/v1/site');
    const response =
      page === undefined ? await endpoint : await endpoint.query({ page });
    expect(response.status).toBe(400);
    assertFailureEnvelope(response, 1001);
  });

  it('拒绝重复 page 参数', async () => {
    const response = await request(validApp).get(
      '/api/v1/site?page=home&page=about',
    );
    expect(response.status).toBe(400);
    assertFailureEnvelope(response, 1001);
  });

  it('拒绝未经许可的查询参数', async () => {
    const response = await request(validApp).get(
      '/api/v1/site?page=home&limit=200',
    );
    expect(response.status).toBe(400);
    expect(response.body.Messages).toContain('不接受 page 以外的查询参数');
    assertFailureEnvelope(response, 1001);
  });

  it.each(['post', 'put', 'patch', 'delete', 'options'] as const)(
    '为不支持的 %s 方法返回 HTTP 405',
    async (method) => {
      const response = await request(validApp)[method](
        '/api/v1/site?page=home',
      );
      expect(response.status).toBe(405);
      expect(response.headers.allow).toBe('GET');
      assertFailureEnvelope(response, 1003);
    },
  );

  it('HEAD 请求只返回方法限制状态和响应头', async () => {
    const response = await request(validApp).head('/api/v1/site?page=home');
    expect(response.status).toBe(405);
    expect(response.headers.allow).toBe('GET');
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.text).toBeUndefined();
  });

  it.each(['page[]=home', 'page[route]=home'])(
    '拒绝数组或嵌套查询 %s',
    async (query) => {
      const response = await request(validApp).get(`/api/v1/site?${query}`);
      expect(response.status).toBe(400);
      assertFailureEnvelope(response, 1001);
    },
  );

  it('为不存在的业务接口返回 HTTP 404', async () => {
    const response = await request(validApp).get('/api/v1/unknown');
    expect(response.status).toBe(404);
    assertFailureEnvelope(response, 1002);
  });

  it('为数据读取故障返回受控中文说明且绝不回显内部错误', async () => {
    const repository: SiteRepository = {
      async getSite() {
        throw new Error('private database credentials');
      },
    };
    const response = await request(createApp({ repository })).get(
      '/api/v1/site?page=home',
    );
    expect(response.status).toBe(500);
    expect(response.body.Code).toBe(2001);
    expect(response.body.Messages).toContain('未能完成 MySQL 数据查询');
    expect(response.body.Messages).not.toContain('credentials');
    assertFailureEnvelope(response, 2001);
  });

  it('拒绝板块不足的页面数据', async () => {
    const response = await request(
      createApp({ repository: createSampleRepository(2) }),
    ).get('/api/v1/site?page=home');
    expect(response.status).toBe(500);
    expect(response.body.Code).toBe(2002);
    assertFailureEnvelope(response, 2002);
  });

  it('用固定随机种子的百组参数验证输入校验稳定性', async () => {
    let seed = 0x39a4d17b;
    const requests = Array.from({ length: 100 }, () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const length = 3 + (seed % 52);
      const value = Array.from({ length }, () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return String.fromCharCode(33 + (seed % 89));
      }).join('');
      return request(validApp).get('/api/v1/site').query({ page: value });
    });

    const responses = await Promise.all(requests);
    expect(responses).toHaveLength(100);
    expect(
      responses.every(
        (response) => response.status === 400 && response.body.Code === 1001,
      ),
    ).toBe(true);
    expect(
      new Set(responses.map((response) => response.body.RequestId)).size,
    ).toBe(100);
    responses.forEach((response) => assertFailureEnvelope(response, 1001));
  });
});

describe('后端本地图片安全与内容类型', () => {
  let mediaDirectory: string;

  afterAll(async () => {
    if (mediaDirectory) {
      await rm(mediaDirectory, { force: true, recursive: true });
    }
  });

  it('访问有效 PNG、缺失资源及越界路径时返回对应结果', async () => {
    mediaDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'aevorio-media-tests-'),
    );
    const image = await sharp({
      create: { width: 32, height: 32, channels: 3, background: '#326653' },
    })
      .png()
      .toBuffer();
    await writeFile(path.join(mediaDirectory, 'test-board.png'), image);
    const app = createApp({
      repository: createSampleRepository(),
      mediaDirectory,
    });

    const imageResponse = await request(app).get('/media/test-board.png');
    expect(imageResponse.status).toBe(200);
    expect(imageResponse.headers['content-type']).toContain('image/png');
    expect(imageResponse.headers['x-content-type-options']).toBe('nosniff');
    expect(imageResponse.body).toEqual(image);

    const missingResponse = await request(app).get('/media/missing-board.png');
    expect(missingResponse.status).toBe(404);
    assertFailureEnvelope(missingResponse, 1002);

    const traversalResponse = await request(app).get(
      '/media/%2e%2e%2f..%2f.env',
    );
    expect(traversalResponse.status).toBeGreaterThanOrEqual(400);
    expect(traversalResponse.status).toBeLessThan(500);
  });
});

function assertFailureEnvelope(
  response: request.Response,
  expectedCode: number,
): void {
  expect(response.body.Code).toBe(expectedCode);
  expect(typeof response.body.Messages).toBe('string');
  expect(response.body.Messages).not.toHaveLength(0);
  expect(response.body.Messages).toMatch(/[\u4e00-\u9fff]/u);
  expect(response.body.Data).toBeNull();
  expect(response.body.RequestId).toMatch(/^[0-9a-f-]{36}$/iu);
  expect(Number.isNaN(Date.parse(response.body.Timestamp))).toBe(false);
}

function createSampleRepository(sectionOverride?: number): SiteRepository {
  return {
    async getSite(page: PageSlug): Promise<SitePayload> {
      const info = PAGE_INFORMATION[page];
      const sectionCount =
        page === 'home' && sectionOverride !== undefined
          ? sectionOverride
          : info.sectionCount;

      return {
        settings: {
          projectName: 'AEVORIO',
          author: 'NianBroken',
          companyName: '企业名称（示例）',
          language: 'zh-CN',
        },
        page: {
          slug: page,
          title: info.title,
          description: '页面接口边界测试说明。',
          sections: Array.from({ length: sectionCount }, (_, index) => ({
            id: index + 1,
            sectionKey: `sample-section-${index + 1}`,
            sectionType: 'editorial',
            sortOrder: index + 1,
            title: `真实内容板块 ${index + 1}`,
            subtitle: '具有独立信息内容',
            description: '此板块用于验证页面读取接口保留完整内容。',
            content: {},
            media: null,
          })),
        },
        categories: Array.from(
          { length: page === 'products' ? 9 : 0 },
          (_, index) => ({
            id: `category-${index + 1}`,
            slug: `category-${index + 1}`,
            name: `产品类别 ${index + 1}`,
            description: `类别 ${index + 1} 的技术定位说明。`,
            sortOrder: index + 1,
          }),
        ),
        products: Array.from(
          { length: page === 'products' ? 45 : 0 },
          (_, index) => ({
            id: `product-${index + 1}`,
            slug: `product-${index + 1}`,
            categorySlug: `category-${Math.floor(index / 5) + 1}`,
            categoryName: `产品类别 ${Math.floor(index / 5) + 1}`,
            name: `硬件示例 ${index + 1}`,
            subtitle: `特性 ${index + 1}`,
            description: `独立功能说明 ${index + 1}`,
            specifications: [`接口结构 ${index + 1}`],
            features: [`使用方向 ${index + 1}`],
            sortOrder: index + 1,
            isDemo: true,
            media: {
              id: `media-${index + 1}`,
              fileName: `media-${index + 1}.png`,
              mimeType: 'image/png',
              width: 920,
              height: 680,
              sha256: 'a'.repeat(64),
              altText: `独立硬件示例 ${index + 1} 的电路结构图。`,
              url: `/media/media-${index + 1}.png`,
            },
          }),
        ),
      };
    },
  };
}
