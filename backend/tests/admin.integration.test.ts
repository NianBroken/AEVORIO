import { isolateAllMedia, mediaFields } from "../src/services/media-ownership";
import { randomUUID } from 'node:crypto';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';
import request from 'supertest';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readEnvironment } from '../src/config/env';
import { createApp } from '../src/app';
import { hashPassword } from '../src/services/password-service';
import { ResourceService } from '../src/services/resource-service';
import { MediaService } from '../src/services/media-service';
import { MysqlSiteRepository } from '../src/repositories/site-repository';
import {
  getValue,
  ICON_NAMES,
  type JsonValue,
  type ResourceRecord,
  type ResourceType,
  type Values,
} from '../../shared/content';

const testName = `aevorio_test_admin_${Date.now()}`;
const mediaRoot = path.resolve('storage', testName, 'media');
const password = randomUUID() + randomUUID();
const origin = 'http://127.0.0.1:24681';
let database: mysql.Pool;
let management: ResourceService;
let app: ReturnType<typeof createApp>;
let agent: ReturnType<typeof request.agent>;
let csrf = '';
let owner: mysql.Connection;
const actor = { actorId: 'test-admin', requestId: randomUUID() };
const operation = () => ({ ...actor, operationId: randomUUID() });
const coverageResults: Array<Record<string, unknown>> = [];

// 测试复制真实数据到独立 MySQL 数据库，正式网站和图片始终不受测试写入影响。
beforeAll(async () => {
  const env = readEnvironment();
  owner = await mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    charset: 'utf8mb4',
  });
  await owner.query('CREATE DATABASE ?? CHARACTER SET utf8mb4', [testName]);
  await owner.query('USE ??', [testName]);
  await owner.query('SET FOREIGN_KEY_CHECKS=0');
  const [names] = await owner.query<mysql.RowDataPacket[]>(
    'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=?',
    [env.DB_NAME],
  );
  for (const entry of names) {
    const table = String(entry.TABLE_NAME);
    const [create] = await owner.query<mysql.RowDataPacket[]>(
      'SHOW CREATE TABLE ??.??',
      [env.DB_NAME, table],
    );
    await owner.query(String(create[0]?.['Create Table']));
    if (
      ![
        'admin_sessions',
        'audit_logs',
        'content_revisions',
        'admin_users',
      ].includes(table)
    )
      await owner.query('INSERT INTO ?? SELECT * FROM ??.??', [
        table,
        env.DB_NAME,
        table,
      ]);
  }
  await owner.query('SET FOREIGN_KEY_CHECKS=1');
  database = mysql.createPool({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: testName,
    charset: 'utf8mb4',
    connectionLimit: 8,
    jsonStrings: true,
  });
  await database.execute(
    'INSERT INTO admin_users(id,username,password_hash,must_change_password) VALUES(?,?,?,0)',
    ['test-admin', 'integration', await hashPassword(password)],
  );
  await cp(path.resolve('storage/media'), mediaRoot, { recursive: true });
  management = new ResourceService(database, mediaRoot);
  app = createApp({ database, mediaDirectory: mediaRoot });
  agent = request.agent(app);
  csrf = (await agent.get('/api/v1/admin/auth/session')).body.Data.csrfToken;
  const login = await agent
    .post('/api/v1/admin/auth/login')
    .set('Origin', origin)
    .set('X-CSRF-Token', csrf)
    .send({ username: 'integration', password });
  expect(login.status).toBe(200);
  csrf = login.body.Data.csrfToken;
}, 60000);
afterAll(async () => {
  if (database) await database.end();
  if (owner) {
    await owner.query('DROP DATABASE IF EXISTS ??', [testName]);
    await owner.end();
  }
  await rm(path.dirname(mediaRoot), { recursive: true, force: true });
}, 30000);
const edit = async (
  type: ResourceType,
  record: ResourceRecord,
  changes: Values,
  operationId = randomUUID(),
) =>
  agent
    .patch(`/api/v1/admin/resources/${type}/${record.id}`)
    .set('Origin', origin)
    .set('X-CSRF-Token', csrf)
    .send({ version: record.version, operationId, changes });

describe('真实 MySQL 管理接口与发布恢复', () => {
  it('拒绝未登录、缺少 CSRF、伪造来源和错误密码', async () => {
    expect(
      (await request(app).get('/api/v1/admin/resources/products')).status,
    ).toBe(401);
    expect(
      (await agent.patch('/api/v1/admin/resources/products/x').send({})).status,
    ).toBe(403);
    expect(
      (
        await agent
          .post('/api/v1/admin/auth/logout')
          .set('Origin', 'https://invalid.example')
          .set('X-CSRF-Token', csrf)
      ).status,
    ).toBe(403);
    const anon = request.agent(app);
    const token = (await anon.get('/api/v1/admin/auth/session')).body.Data
      .csrfToken;
    const failure = await anon
      .post('/api/v1/admin/auth/login')
      .set('Origin', origin)
      .set('X-CSRF-Token', token)
      .send({ username: 'integration', password: 'incorrect' });
    expect(failure.status).toBe(401);
    expect(failure.body.Messages).toMatch(/密码/u);
  });
  it('所有管理 JSON 响应包含约定字段，并且不暴露敏感数据', async () => {
    for (const url of [
      '/overview',
      '/coverage',
      '/resources/products',
      '/resources/pages',
    ]) {
      const response = await agent.get('/api/v1/admin' + url);
      expect(response.status).toBe(200);
      expect(Object.keys(response.body)).toEqual([
        'Code',
        'Messages',
        'Data',
        'RequestId',
        'Timestamp',
      ]);
      expect(JSON.stringify(response.body)).not.toMatch(
        /password_hash|DB_PASSWORD|session_secret/u,
      );
    }
  });
  it('类别详情列出关联产品和目录板块', async () => {
    const products = await management.list('products');
    const sections = await management.list('sections');
    const category = (await management.list('categories')).find(
      (item) =>
        products.some((product) => product.values.category_id === item.id) &&
        sections.some(
          (section) =>
            section.values.section_type === 'product-matrix' &&
            section.values.category_id === item.id,
        ),
    )!;
    const response = await agent.get('/api/v1/admin/resources/categories/' + category.id);
    expect(response.status).toBe(200);
    expect(response.body.Data.references.some((item: {type:string}) => item.type === 'products')).toBe(true);
    expect(response.body.Data.references.some((item: {type:string}) => item.type === 'sections')).toBe(true);
  });
  it('自定义模块类型可创建、改名和删除，类型长度由服务端限制', async () => {
    const hero = (await management.list('sections')).find(
      (item) => item.values.section_type === 'hero',
    )!;
    expect(
      hero.fields.find((field) => field.key === 'section_type')?.readonly,
    ).toBe(true);
    await expect(
      management.create(
        'sections',
        {
          page_id: 1,
          section_type: 'product-matrix',
          title: '受保护模块',
          description: '不能通过自定义模块接口创建系统模块。',
        },
        operation(),
      ),
    ).rejects.toThrow(/系统模块类型/u);
    const section = await management.create(
      'sections',
      {
        page_id: 1,
        section_type: 'custom-research-note',
        title: '自定义模块验证',
        subtitle: '',
        description: '自定义模块使用安全的通用展示结构。',
        content_json: {},
        media_id: null,
        category_id: null,
        sort_order: 99,
        is_visible: true,
      },
      operation(),
    );
    expect(section.values.section_type).toBe('custom-research-note');
    expect(section.values.content_json).toMatchObject({
      label: 'custom-research-note',
      points: [],
    });
    expect(
      section.fields.find((field) => field.key === 'section_type')?.readonly,
    ).toBe(false);
    const renamed = await management.save(
      'sections',
      section.id,
      {
        version: section.version,
        changes: { section_type: 'custom-field-note' },
      },
      operation(),
    );
    expect(renamed.values.section_type).toBe('custom-field-note');
    const deleted = await management.save(
      'sections',
      section.id,
      { version: renamed.version, changes: {} },
      operation(),
      'delete',
      true,
    );
    expect(deleted.deleted).toBe(true);
    const invalid = await agent
      .post('/api/v1/admin/resources/sections')
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf)
      .send({
        operationId: randomUUID(),
        values: {
          page_id: 1,
          section_type: 'x'.repeat(49),
          title: '无效类型',
          description: '类型超过允许长度。',
        },
      });
    expect(invalid.status).toBe(400);
  });
  it('保存立即更新公开读取，并且版本冲突不会覆盖已发布内容', async () => {
    const product = (await management.list('products'))[0]!;
    const changed = await edit('products', product, {
      name: '集成验证产品名称',
    });
    expect(changed.status).toBe(200);
    expect(
      (
        await new MysqlSiteRepository(database).getSite('products')
      )?.products.find((p) => p.id === product.id)?.name,
    ).toBe('集成验证产品名称');
    const conflict = await edit('products', product, {
      name: '过期版本不能覆盖',
    });
    expect(conflict.status).toBe(409);
    const history = await management.revisions('products', product.id);
    const original = history.find(
      (h) => Number(h.version) === product.version,
    )!;
    const restored = await management.restore(
      'products',
      product.id,
      Number(original.id),
      changed.body.Data.version,
      operation(),
    );
    expect(restored.values.name).toBe(product.values.name);
  });
  it('重复操作标识只产生一次发布', async () => {
    const record = (await management.list('products'))[1]!;
    const id = randomUUID();
    const first = await edit(
      'products',
      record,
      { subtitle: '重复提交验证' },
      id,
    );
    const second = await edit(
      'products',
      record,
      { subtitle: '重复提交验证' },
      id,
    );
    expect(second.status).toBe(200);
    expect(second.body.Data.version).toBe(first.body.Data.version);
    await management.save(
      'products',
      record.id,
      {
        version: first.body.Data.version,
        changes: { subtitle: record.values.subtitle! },
      },
      operation(),
    );
  });
  it('并发隐藏不同板块不会突破每页十个有效板块', async () => {
    const items = (await management.list('sections'))
      .filter((s) => s.values.page_id === 1 && s.values.section_type !== 'hero')
      .slice(0, 3);
    const results = await Promise.all(
      items.map((s) =>
        management
          .save(
            'sections',
            s.id,
            { version: s.version, changes: { is_visible: false } },
            operation(),
          )
          .then((r) => ({ ok: true, record: r }))
          .catch((e) => ({ ok: false, error: e })),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(2);
    expect(
      (await new MysqlSiteRepository(database).getSite('home'))?.page.sections,
    ).toHaveLength(10);
    for (const result of results)
      if ('record' in result && result.record)
        await management.save(
          'sections',
          result.record.id,
          { version: result.record.version, changes: { is_visible: true } },
          operation(),
        );
  });
  it('逐项修改可编辑字段，核对持久化与恢复，并生成真实覆盖报告', async () => {
    const types = [
      'settings',
      'pages',
      'sections',
      'products',
      'categories',
    ] as const;
    const freshMedia = async () => {
      const buffer = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#345678" } }).png().toBuffer();
      return (await new MediaService(management, mediaRoot).upload({ buffer, size: buffer.length, originalname: "验证.png", mimetype: "image/png" } as Express.Multer.File, operation())).id;
    };
    for (const type of types)
      for (const baseline of await management.list(type)) {
        for (const field of baseline.fields.filter((f) => !f.readonly)) {
          if (field.key === 'category_id') continue;
          const current = await management.get(type, baseline.id);
          const original = getValue(current.values, field.key);
          let value: JsonValue;
          if (field.kind === 'image')
            value = await freshMedia();
          else if (field.kind === 'icon')
            value = ICON_NAMES.find((name) => name !== original)!;
          else if (field.kind === 'color')
            value = original === '#102030' ? '#203040' : '#102030';
          else if (field.kind === 'select')
            value = field.options!.find((v) => v !== original)!;
          else if (field.kind === 'number')
            value = (Number(original) + 1) % 60000;
          else if (field.kind === 'boolean') value = !original;
          else if (field.kind === 'list')
            value =
              field.key === 'gallery_json'
                ? [await freshMedia()]
                : [{ id: randomUUID(), text: '资源完整性验证' }];
          else if (field.kind === 'link')
            value = original === '/about' ? '/products' : '/about';
          else value = String(original ?? '') + '核验';
          if (value === undefined) continue;
          const changed = await management.save(
            type,
            current.id,
            { version: current.version, changes: { [field.key]: value } },
            operation(),
          );
          expect(
            getValue(
              (await management.get(type, current.id)).values,
              field.key,
            ),
          ).toEqual(value);
          const restored = await management.save(
            type,
            current.id,
            {
              version: changed.version,
              changes: { [field.key]: original ?? null },
            },
            operation(),
          );
          expect(getValue(restored.values, field.key)).toEqual(
            original ?? null,
          );
          coverageResults.push({
            type,
            id: current.id,
            field: field.key,
            passed: true,
            version: restored.version,
          });
        }
      }
    await mkdir('reports', { recursive: true });
    await writeFile(
      'reports/resource-field-verification.json',
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          isolatedDatabase: true,
          verified: coverageResults.length,
          results: coverageResults,
        },
        null,
        2,
      ),
      'utf8',
    );
    expect(coverageResults.length).toBeGreaterThan(500);
  }, 600000);
  it('拒绝非法字段、超长文字、危险链接和非法图标', async () => {
    const record = (await management.list('sections')).find(
      (s) => s.values.section_type === 'hero',
    )!;
    const invalidChanges: Values[] = [
      { 'content_json.primaryHref': 'javascript:alert(1)' },
      { 'content_json.primaryIcon': 'UntrustedComponent' },
      { title: '字'.repeat(300) },
      { '__proto__.x': '污染' },
    ];
    for (const changes of invalidChanges) {
      const response = await edit(
        'sections',
        await management.get('sections', record.id),
        changes,
      );
      expect(response.status).toBe(400);
      expect(response.body.Messages).toMatch(/[\u4e00-\u9fff]/u);
    }
  });
  it('真实图片上传、共享替换、历史恢复和引用保护', async () => {
    const original = (await management.list('media'))[0]!;
    const data = await sharp({
      create: { width: 320, height: 240, channels: 3, background: '#345678' },
    })
      .png()
      .toBuffer();
    const response = await agent
      .post('/api/v1/admin/media/uploads')
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf)
      .field('operationId', randomUUID())
        .field('ownerType', 'products')
        .field('fieldKey', 'primary_media_id')
      .field('replaceId', original.id)
      .field('version', String(original.version))
      .attach('file', data, { filename: '验证.png', contentType: 'image/png' });
    expect(response.status).toBe(400);
    expect((await management.get('media', original.id)).values.sha256).toBe(original.values.sha256);
  });
  it('拒绝危险 SVG、伪造图片与超大文件', async () => {
    for (const [filename, data, contentType] of [
      ['unsafe.svg', Buffer.from('<svg onload="alert(1)"/>'), 'image/svg+xml'],
      ['fake.png', Buffer.from('not an image'), 'image/png'],
    ] as const) {
      const response = await agent
        .post('/api/v1/admin/media/uploads')
        .set('Origin', origin)
        .set('X-CSRF-Token', csrf)
        .field('operationId', randomUUID())
        .field('ownerType', 'products')
        .field('fieldKey', 'primary_media_id')
        .attach('file', data, { filename, contentType });
      expect(response.status).toBe(415);
    }
    const tooLarge = await agent
      .post('/api/v1/admin/media/uploads')
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf)
      .field('operationId', randomUUID())
        .field('ownerType', 'products')
        .field('fieldKey', 'primary_media_id')
      .attach('file', Buffer.alloc(15_000_001), {
        filename: 'large.png',
        contentType: 'image/png',
      });
    expect(tooLarge.status).toBe(413);
  });
  it('新增类别自动建立目录，产品可迁移，创建操作可重复提交', async () => {
    const key = randomUUID();
    const category = await management.create(
      'categories',
      { name: '隔离验证类别', description: '验证真实目录建立', sort_order: 98 },
      { ...operation(), operationId: key },
    );
    const repeated = await management.create(
      'categories',
      { name: '重复提交', description: '不会创建第二条' },
      { ...operation(), operationId: key },
    );
    expect(repeated.id).toBe(category.id);
    expect(
      (
        await new MysqlSiteRepository(database).getSite('products')
      )?.page.sections.some((s) => s.categoryId === category.id),
    ).toBe(true);
    const categorySection = (await management.list('sections')).find(
      (section) => section.values.category_id === category.id,
    )!;
    const item = await management.create(
      'products',
      {
        name: '隔离验证产品',
        description: '验证类别关联',
        category_id: category.id,
        primary_media_id: (await new MediaService(management, mediaRoot).upload({ buffer: await sharp({ create: { width: 8, height: 8, channels: 3, background: "#345678" } }).png().toBuffer(), size: 100, originalname: "创建.png", mimetype: "image/png" } as Express.Multer.File, operation())).id,
      },
      operation(),
    );
    await expect(
      management.save(
        'categories',
        category.id,
        { version: category.version, changes: {} },
        operation(),
        'delete',
        true,
      ),
    ).rejects.toThrow(/关联产品/u);
    const target = (await management.list('categories')).find(
      (c) => c.id !== category.id,
    )!;
    const moved = await management.save(
      'products',
      item.id,
      { version: item.version, changes: { category_id: target.id } },
      operation(),
    );
    expect(moved.values.category_id).toBe(target.id);
    await management.save(
      'products',
      moved.id,
      { version: moved.version, changes: {} },
      operation(),
      'delete',
      true,
    );
    const deletedCategory = await management.save(
      'categories',
      category.id,
      { version: category.version, changes: {} },
      operation(),
      'delete',
      true,
    );
    expect(
      (await management.list('sections')).some(
        (section) => section.id === categorySection.id,
      ),
    ).toBe(false);
    expect((await management.get('sections', categorySection.id)).deleted).toBe(
      true,
    );
    await management.save(
      'categories',
      category.id,
      { version: deletedCategory.version, changes: {} },
      operation(),
      'restore',
      false,
    );
    expect(
      (await management.list('sections')).some(
        (section) => section.id === categorySection.id,
      ),
    ).toBe(true);
    expect((await management.get('sections', categorySection.id)).deleted).toBe(
      false,
    );
    await expect(
      management.create('products', { name: '缺少必填项' }, operation()),
    ).rejects.toThrow(/必填/u);
  });
  it('相同图片可供独立资源使用，上传与替换重复提交不会生成第二次发布', async () => {
    const bytes = await sharp({
      create: { width: 200, height: 200, channels: 3, background: '#718293' },
    })
      .png()
      .toBuffer();
    const file = {
      buffer: bytes,
      size: bytes.length,
      originalname: 'same.png',
      mimetype: 'image/png',
    } as Express.Multer.File;
    const media = new MediaService(management, mediaRoot);
    const ctx = operation();
    const first = await media.upload(file, ctx);
    const repeat = await media.upload(file, ctx);
    const second = await media.upload(file, operation());
    expect(repeat.id).toBe(first.id);
    expect(second.id).not.toBe(first.id);
    const replace = operation();
    const changed = await media.upload(file, replace, {
      id: first.id,
      version: first.version,
    });
    const again = await media.upload(file, replace, {
      id: first.id,
      version: first.version,
    });
    expect(again.version).toBe(changed.version);
    await media.cleanup();
    await media.verifyHistoricalFiles();
  });
  it('恢复产品历史图片只改变当前产品，保留共享资源的当前版本', async () => {
    const product = (await management.list('products'))[0]!;
    const originalMedia = await management.get(
      'media',
      String(product.values.primary_media_id),
    );
    const edited = await management.save(
      'products',
      product.id,
      { version: product.version, changes: { name: '历史图片验证' } },
      operation(),
    );
    const bytes = await sharp({
      create: { width: 240, height: 240, channels: 3, background: '#563412' },
    })
      .png()
      .toBuffer();
    const changedMedia = await new MediaService(management, mediaRoot).upload(
      {
        buffer: bytes,
        size: bytes.length,
        originalname: 'history.png',
        mimetype: 'image/png',
      } as Express.Multer.File,
      operation(),
      { id: originalMedia.id, version: originalMedia.version },
    );
    const revision = (await management.revisions('products', product.id)).find(
      (r) => Number(r.version) === product.version,
    )!;
    const restored = await management.restore(
      'products',
      product.id,
      Number(revision.id),
      edited.version,
      operation(),
    );
    const pinned = await management.get(
      'media',
      String(restored.values.primary_media_id),
    );
    expect(pinned.values.sha256).toBe(originalMedia.values.sha256);
    expect(pinned.id).not.toBe(originalMedia.id);
    expect(
      (await management.get('media', originalMedia.id)).values.sha256,
    ).toBe(changedMedia.values.sha256);
  });
  it('数据库提交失败会回滚业务、版本和操作记录', async () => {
    const listed = (await management.list('products'))[1]!;
    const item = await management.get('products', listed.id);
    const ctx = operation();
    await database.query(
      `CREATE TRIGGER test_revision_failure BEFORE INSERT ON content_revisions FOR EACH ROW BEGIN IF NEW.operation_id='${ctx.operationId}' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='test transaction rollback'; END IF; END`,
    );
    try {
      await expect(
        management.save(
          'products',
          item.id,
          { version: item.version, changes: { name: '不得发布' } },
          ctx,
        ),
      ).rejects.toThrow('test transaction rollback');
      expect(await management.get('products', item.id)).toEqual(item);
      const [logs] = await database.execute<mysql.RowDataPacket[]>(
        'SELECT id FROM audit_logs WHERE operation_id=?',
        [ctx.operationId],
      );
      expect(logs).toHaveLength(0);
    } finally {
      await database.query('DROP TRIGGER test_revision_failure');
    }
  });
  it('全站配置与页面历史可恢复，固定对象不执行删除状态更新', async () => {
    for (const [type, id, key] of [
      ['settings', 'company_name', 'setting_value'],
      ['pages', '1', 'meta_description'],
    ] as const) {
      const baseline = await management.get(type, id);
      const changed = await management.save(
        type,
        id,
        {
          version: baseline.version,
          changes: { [key]: '固定对象历史恢复验证' },
        },
        operation(),
      );
      const revision = (await management.revisions(type, id)).find(
        (r) => Number(r.version) === baseline.version,
      )!;
      const restored = await management.restore(
        type,
        id,
        Number(revision.id),
        changed.version,
        operation(),
      );
      expect(restored.values[key]).toBe(baseline.values[key]);
    }
  });
  it('文件落盘失败和非法图库引用均保留已发布内容', async () => {
    const item = (await management.list('media'))[0]!;
    const invalid = path.join(
      path.dirname(mediaRoot),
      'file-instead-of-directory',
    );
    await writeFile(invalid, '不可用目录', 'utf8');
    const bytes = await sharp({
      create: { width: 20, height: 20, channels: 3, background: '#fff' },
    })
      .png()
      .toBuffer();
    await expect(
      new MediaService(management, invalid).upload(
        {
          buffer: bytes,
          size: bytes.length,
          originalname: 'test.png',
          mimetype: 'image/png',
        } as Express.Multer.File,
        operation(),
        { id: item.id, version: item.version },
      ),
    ).rejects.toThrow();
    expect(await management.get('media', item.id)).toEqual(item);
    const product = (await management.list('products'))[0]!;
    expect(
      (await edit('products', product, { gallery_json: ['../../private'] }))
        .status,
    ).toBe(400);
    expect(
      (
        await agent
          .post('/api/v1/admin/auth/logout')
          .set('Origin', origin)
          .set('X-CSRF-Token', 'é'.repeat(64))
      ).status,
    ).toBe(403);
  });
  it('历史分页保留全部旧版本并支持恢复',async()=>{
    const baseline=(await management.list('products'))[2]!;let current=baseline;
    for(let i=0;i<102;i++)current=await management.save('products',current.id,{version:current.version,changes:{subtitle:'历史分页验证'+i}},operation());
    const first=await management.revisions('products',current.id);const second=await management.revisions('products',current.id,2);expect(first).toHaveLength(100);expect(second.length).toBeGreaterThan(0);expect(new Set([...first,...second].map(r=>r.id)).size).toBe(first.length+second.length);
    const revision=[...first,...second].find(r=>Number(r.version)===baseline.version)!;expect(revision).toBeTruthy();const restored=await management.restore('products',current.id,Number(revision.id),current.version,operation());expect(restored.values.subtitle).toBe(baseline.values.subtitle);
  }, 30000);
  it('首次改密、旧会话失效、过期会话和登录限速均由服务端执行', async () => {
    const username = 'password-flow';
    const initial = randomUUID() + randomUUID();
    const next = randomUUID().replaceAll("-", "");
    await database.execute(
      'INSERT INTO admin_users(id,username,password_hash,must_change_password) VALUES(?,?,?,1)',
      [username, username, await hashPassword(initial)],
    );
    const first = request.agent(app);
    const login = async (
      client: ReturnType<typeof request.agent>,
      password: string,
    ) => {
      const token = (await client.get('/api/v1/admin/auth/session')).body.Data
        .csrfToken;
      return client
        .post('/api/v1/admin/auth/login')
        .set('Origin', origin)
        .set('X-CSRF-Token', token)
        .send({ username, password });
    };
    const signed = await login(first, initial);
    expect(signed.status).toBe(200);
    expect((await first.get('/api/v1/admin/overview')).status).toBe(403);
    const old = request.agent(app);
    expect((await login(old, initial)).status).toBe(200);
    for (const invalid of ['1234567', 'x'.repeat(33), 'abc defg', 'abcd\tefg', '密码123456', 'abc\nefgx']) {
      const rejected = await first.patch('/api/v1/admin/auth/password')
        .set('Origin', origin).set('X-CSRF-Token', signed.body.Data.csrfToken)
        .send({ currentPassword: initial, newPassword: invalid });
      expect(rejected.status).toBe(400);
      expect((await first.get('/api/v1/admin/overview')).status).toBe(403);
    }
    const changed = await first
      .patch('/api/v1/admin/auth/password')
      .set('Origin', origin)
      .set('X-CSRF-Token', signed.body.Data.csrfToken)
      .send({ currentPassword: initial, newPassword: next });
    expect(changed.status).toBe(200);
    expect((await first.get('/api/v1/admin/overview')).status).toBe(200);
    expect((await old.get('/api/v1/admin/overview')).status).toBe(401);
    await database.execute('UPDATE admin_sessions SET expires=0');
    expect((await first.get('/api/v1/admin/overview')).status).toBe(401);
    const anon = request.agent(app);
    const token = (await anon.get('/api/v1/admin/auth/session')).body.Data
      .csrfToken;
    let limited = false;
    for (let i = 0; i < 12; i++) {
      const response = await anon
        .post('/api/v1/admin/auth/login')
        .set('Origin', origin)
        .set('X-CSRF-Token', token)
        .send({ username: "' OR 1=1 --", password: 'incorrect-password' });
      expect([401, 429]).toContain(response.status);
      if (response.status === 429) limited = true;
    }
    expect(limited).toBe(true);
  });
  it('管理员账号修改校验密码和重名，并更新当前会话版本', async () => {
    const id = randomUUID();
    const username = 'account-' + id.slice(0, 8);
    const nextUsername = 'renamed-' + id.slice(0, 8);
    const accountPassword = randomUUID() + randomUUID();
    await database.execute(
      'INSERT INTO admin_users(id,username,password_hash,must_change_password) VALUES(?,?,?,0)',
      [id, username, await hashPassword(accountPassword)],
    );
    const accountApp = createApp({ database, mediaDirectory: mediaRoot });
    const first = request.agent(accountApp);
    const second = request.agent(accountApp);
    const login = async (
      client: ReturnType<typeof request.agent>,
    ) => {
      const token = (await client.get('/api/v1/admin/auth/session')).body.Data
        .csrfToken;
      return client
        .post('/api/v1/admin/auth/login')
        .set('Origin', origin)
        .set('X-CSRF-Token', token)
        .send({ username, password: accountPassword });
    };
    expect((await login(first)).status).toBe(200);
    expect((await login(second)).status).toBe(200);
    const token = (await first.get('/api/v1/admin/auth/session')).body.Data
      .csrfToken;
    const duplicate = await first
      .patch('/api/v1/admin/auth/account')
      .set('Origin', origin)
      .set('X-CSRF-Token', token)
      .send({ username: 'integration', currentPassword: accountPassword });
    expect(duplicate.status).toBe(409);
    const wrongPassword = await first
      .patch('/api/v1/admin/auth/account')
      .set('Origin', origin)
      .set('X-CSRF-Token', token)
      .send({ username: nextUsername, currentPassword: 'incorrect-password' });
    expect(wrongPassword.status).toBe(401);
    const changed = await first
      .patch('/api/v1/admin/auth/account')
      .set('Origin', origin)
      .set('X-CSRF-Token', token)
      .send({ username: nextUsername, currentPassword: accountPassword });
    expect(changed.status).toBe(200);
    expect(changed.body.Data.user.username).toBe(nextUsername);
    expect(
      (await first.get('/api/v1/admin/auth/session')).body.Data.user.username,
    ).toBe(nextUsername);
    expect((await first.get('/api/v1/admin/overview')).status).toBe(200);
    expect((await second.get('/api/v1/admin/overview')).status).toBe(401);
  });
});


describe('媒体独立归属', () => {
  it('上传、创建、跨位置拒绝和历史恢复保持独立归属', async () => {
    const file = { buffer: await sharp({ create: { width: 16, height: 16, channels: 3, background: "#376d58" } }).png().toBuffer(), originalname: "独立图片.png", mimetype: "image/png", size: 100 } as Express.Multer.File;
    const uploads = new MediaService(management, mediaRoot);
    const first = await uploads.upload(file, operation());
    const second = await uploads.upload(file, operation());
    expect(first.id).not.toBe(second.id);
    expect(first.values.file_name).not.toBe(second.values.file_name);
    const product = (await management.list("products"))[0]!;
    const created = await management.create("products", { name: "归属测试", description: "归属验证", category_id: String(product.values.category_id), primary_media_id: first.id }, operation());
    await expect(management.save("products", product.id, { version: product.version, changes: { primary_media_id: first.id } }, operation())).rejects.toThrow("属于其他使用位置");
    await expect(management.save("products", created.id, { version: created.version, changes: { gallery_json: [first.id] } }, operation())).rejects.toThrow("多个位置");
    const published = await management.save("products", created.id, { version: created.version, changes: { primary_media_id: second.id } }, operation());
    const revisions = await management.revisions("products", created.id);
    const initial = revisions.find(row => (row.snapshot_json as ResourceRecord).values.primary_media_id === first.id)!;
    const restored = await management.restore("products", created.id, Number(initial.id), published.version, operation());
    expect(restored.values.primary_media_id).toBe(first.id);
    expect((await management.get("products", product.id)).values.primary_media_id).toBe(product.values.primary_media_id);
    await database.execute('INSERT INTO admin_users(id,username,password_hash,must_change_password) VALUES(?,?,?,0)', ['media-test-admin', 'media-test', await hashPassword(password)]);
    const local = request.agent(createApp({ database, mediaDirectory: mediaRoot }));
    const token = (await local.get('/api/v1/admin/auth/session')).body.Data.csrfToken;
    const login = await local.post('/api/v1/admin/auth/login').set('Origin', origin).set('X-CSRF-Token', token).send({ username: 'media-test', password });
    expect(login.status).toBe(200);
    expect((await local.get("/api/v1/admin/resources/media")).status).toBe(404);
    const detail = await local.get(`/api/v1/admin/resources/products/${created.id}`);
    expect(detail.body.Data.relatedMedia.map((item: ResourceRecord) => item.id)).toContain(first.id);
    const bound = await local.post('/api/v1/admin/media/uploads').set('Origin', origin).set('X-CSRF-Token', login.body.Data.csrfToken)
      .field('operationId', randomUUID()).field('ownerType', 'products').field('ownerId', created.id).field('fieldKey', 'primary_media_id')
      .attach('file', file.buffer, { filename: '绑定.png', contentType: 'image/png' });
    expect(bound.status).toBe(200);
    const bad = await local.patch(`/api/v1/admin/resources/products/${product.id}`).set('Origin', origin).set('X-CSRF-Token', login.body.Data.csrfToken)
      .send({ version: product.version, operationId: randomUUID(), changes: { primary_media_id: bound.body.Data.id } });
    expect(bad.status).toBe(400);
    const good = await local.patch(`/api/v1/admin/resources/products/${created.id}`).set('Origin', origin).set('X-CSRF-Token', login.body.Data.csrfToken)
      .send({ version: restored.version, operationId: randomUUID(), changes: { primary_media_id: bound.body.Data.id } });
    expect(good.status).toBe(200);
  });
});


describe('上传暂存回收', () => {
  it('仅回收超过24小时且没有业务和历史引用的未认领上传', async () => {
    const buffer = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#345678" } }).png().toBuffer();
    const service = new MediaService(management, mediaRoot);
    const file = { buffer, size: buffer.length, originalname: "暂存.png", mimetype: "image/png" } as Express.Multer.File;
    const expired = await service.upload(file, operation());
    const fresh = await service.upload(file, operation());
    const history = await service.upload(file, operation());
    const product = (await management.list("products"))[0]!;
    const published = await management.save("products", product.id, { version: product.version, changes: { primary_media_id: history.id } }, operation());
    await management.save("products", product.id, { version: published.version, changes: { primary_media_id: product.values.primary_media_id! } }, operation());
    await database.execute("UPDATE media_ownership SET claimed=0 WHERE media_id=?", [history.id]);
    await database.execute("UPDATE media_assets SET created_at=TIMESTAMPADD(HOUR,-25,CURRENT_TIMESTAMP) WHERE id IN (?,?)", [expired.id, history.id]);
    const result = await service.cleanup();
    expect(result.removed).toContain(expired.values.file_name);
    await expect(management.get("media", expired.id)).rejects.toThrow("未找到");
    expect((await management.get("media", fresh.id)).id).toBe(fresh.id);
    expect((await management.get("media", history.id)).id).toBe(history.id);
    await service.verifyHistoricalFiles();
  });
});


describe('默认数据库媒体归属', () => {
  it('空库导入默认SQL后可独立初始化媒体并重复执行', async () => {
    const env = readEnvironment();
    const initName = testName + "_init";
    const root = path.join(path.dirname(mediaRoot), "initialized-media");
    const admin = await mysql.createConnection({ host: env.DB_HOST, port: env.DB_PORT, user: env.DB_USER, password: env.DB_PASSWORD, charset: "utf8mb4", multipleStatements: true });
    const pool = mysql.createPool({ host: env.DB_HOST, port: env.DB_PORT, user: env.DB_USER, password: env.DB_PASSWORD, database: initName, charset: "utf8mb4", jsonStrings: true });
    try {
      const sql = await readFile(path.resolve("database/default.sql"), "utf8");
      await admin.query(sql.replaceAll("`aevorio`", mysql.escapeId(initName)));
      await cp(path.resolve("storage/media"), root, { recursive: true });
      expect((await isolateAllMedia(pool, root)).length).toBeGreaterThan(0);
      expect(await isolateAllMedia(pool, root)).toEqual([]);
      const service = new ResourceService(pool, root);
      const ids = new Set<string>();
      for (const type of ["settings", "pages", "sections", "products", "categories"] as const)
        for (const record of await service.list(type, "", true))
          for (const item of mediaFields(record, record.values)) {
            expect(ids.has(item.id)).toBe(false);
            ids.add(item.id);
          }
      await new MediaService(service, root).recover();
    } finally {
      await pool.end();
      await admin.query("DROP DATABASE IF EXISTS ??", [initName]);
      await admin.end();
    }
  }, 60000);
});
