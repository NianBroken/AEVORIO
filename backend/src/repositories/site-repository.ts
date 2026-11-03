import type { Pool, RowDataPacket } from 'mysql2/promise';
import type {
  MediaAsset,
  PageSlug,
  ProductCategory,
  SitePayload,
  SiteProduct,
  SiteRepository,
  SiteSection,
} from '../types/site';

interface SettingRow extends RowDataPacket {
  setting_key: string;
  setting_value: string;
}

interface PageRow extends RowDataPacket {
  slug: PageSlug;
  title: string;
  meta_description: string;
}

interface SectionRow extends RowDataPacket {
  id: number;
  section_key: string;
  section_type: string;
  sort_order: number;
  title: string;
  subtitle: string;
  description: string;
  content_json: string | Record<string, unknown>;
  media_id: string | null;
  media_file_name: string | null;
  media_mime_type: string | null;
  media_width: number | null;
  media_height: number | null;
  media_sha256: string | null;
  media_alt_text: string | null;
}

interface CategoryRow extends RowDataPacket {
  id: string;
  slug: string;
  name: string;
  description: string;
  sort_order: number;
}

interface ProductRow extends RowDataPacket {
  id: string;
  slug: string;
  category_slug: string;
  category_name: string;
  name: string;
  subtitle: string;
  description: string;
  specifications_json: string | string[];
  features_json: string | string[];
  sort_order: number;
  is_demo: number;
  media_id: string;
  media_file_name: string;
  media_mime_type: string;
  media_width: number;
  media_height: number;
  media_sha256: string;
  media_alt_text: string;
}

const pageSummaries = new Map<PageSlug, string>([
  ['home', '了解公司的硬件研发方向、工程实践与开源思路。'],
  ['products', '浏览九类四十五款用于研发与技术验证的硬件示例。'],
  ['about', '了解公司业务组织、设计方法与工程责任。'],
]);

export class MysqlSiteRepository implements SiteRepository {
  public constructor(private readonly database: Pool) {}

  public async getSite(pageSlug: PageSlug): Promise<SitePayload | null> {
    const [pageRows] = await this.database.execute<PageRow[]>(
      'SELECT slug, title, meta_description FROM pages WHERE slug = :pageSlug AND is_visible = 1 LIMIT 1',
      { pageSlug },
    );

    const pageRow = pageRows[0];
    if (!pageRow) return null;

    const [settingRows] = await this.database.query<SettingRow[]>(
      'SELECT setting_key, setting_value FROM site_settings ORDER BY setting_key',
    );

    const [sectionRows] = await this.database.execute<SectionRow[]>(
      `SELECT section.id, section.section_key, section.section_type,
        section.sort_order, section.title, section.subtitle,
        section.description, section.content_json, section.media_id,
        media.file_name AS media_file_name, media.mime_type AS media_mime_type,
        media.width AS media_width, media.height AS media_height,
        media.sha256 AS media_sha256, media.alt_text AS media_alt_text
       FROM page_sections AS section
       LEFT JOIN media_assets AS media ON media.id = section.media_id
       WHERE section.page_id = (SELECT id FROM pages WHERE slug = :pageSlug)
         AND section.is_visible = 1
       ORDER BY section.sort_order ASC, section.id ASC`,
      { pageSlug },
    );

    const [categoryRows] = await this.database.query<CategoryRow[]>(
      `SELECT id, slug, name, description, sort_order
       FROM product_categories
       WHERE is_visible = 1
       ORDER BY sort_order ASC, id ASC`,
    );

    const [productRows] = await this.database.query<ProductRow[]>(
      `SELECT product.id, product.slug, category.slug AS category_slug,
        category.name AS category_name, product.name, product.subtitle,
        product.description, product.specifications_json,
        product.features_json, product.sort_order, product.is_demo,
        media.id AS media_id, media.file_name AS media_file_name,
        media.mime_type AS media_mime_type, media.width AS media_width,
        media.height AS media_height, media.sha256 AS media_sha256,
        media.alt_text AS media_alt_text
       FROM products AS product
       INNER JOIN product_categories AS category ON category.id = product.category_id
       INNER JOIN media_assets AS media ON media.id = product.primary_media_id
       WHERE product.is_visible = 1 AND category.is_visible = 1
       ORDER BY category.sort_order ASC, product.sort_order ASC, product.id ASC`,
    );

    const settings = Object.fromEntries(
      settingRows.map((row) => [row.setting_key, decodeJson(row.setting_value)]),
    );

    return {
      settings: {
        projectName: asString(settings.project_name, 'AEVORIO'),
        author: asString(settings.author, 'NianBroken'),
        companyName: asString(settings.company_name, '企业名称（示例）'),
        language: asString(settings.language, 'zh-CN'),
      },
      page: {
        slug: pageRow.slug,
        title: pageRow.title,
        description: pageRow.meta_description || pageSummaries.get(pageSlug) || '',
        sections: sectionRows.map(mapSection),
      },
      categories: categoryRows.map(mapCategory),
      products: productRows.map(mapProduct),
    };
  }
}

function mapSection(row: SectionRow): SiteSection {
  const media = row.media_id && row.media_file_name ? mapMedia({
    id: row.media_id,
    fileName: row.media_file_name,
    mimeType: row.media_mime_type ?? 'image/png',
    width: row.media_width ?? 1,
    height: row.media_height ?? 1,
    sha256: row.media_sha256 ?? '',
    altText: row.media_alt_text ?? row.title,
  }) : null;

  return {
    id: row.id,
    sectionKey: row.section_key,
    sectionType: row.section_type,
    sortOrder: row.sort_order,
    title: row.title,
    subtitle: row.subtitle,
    description: row.description,
    content: parseObject(row.content_json),
    media,
  };
}

function mapCategory(row: CategoryRow): ProductCategory {
  return { id: row.id, slug: row.slug, name: row.name, description: row.description, sortOrder: row.sort_order };
}

function mapProduct(row: ProductRow): SiteProduct {
  return {
    id: row.id,
    slug: row.slug,
    categorySlug: row.category_slug,
    categoryName: row.category_name,
    name: row.name,
    subtitle: row.subtitle,
    description: row.description,
    specifications: parseStringArray(row.specifications_json),
    features: parseStringArray(row.features_json),
    sortOrder: row.sort_order,
    isDemo: Boolean(row.is_demo),
    media: mapMedia({
      id: row.media_id,
      fileName: row.media_file_name,
      mimeType: row.media_mime_type,
      width: row.media_width,
      height: row.media_height,
      sha256: row.media_sha256,
      altText: row.media_alt_text,
    }),
  };
}

function mapMedia(media: Omit<MediaAsset, 'url'>): MediaAsset {
  return { ...media, url: `/media/${encodeURIComponent(media.fileName)}` };
}

function decodeJson(value: string): unknown {
  try { return JSON.parse(value) as unknown; } catch { return value; }
}

function parseObject(value: string | Record<string, unknown>): Record<string, unknown> {
  const parsed = typeof value === 'string' ? decodeJson(value) : value;
  return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};
}

function parseStringArray(value: string | string[]): string[] {
  const parsed = Array.isArray(value) ? value : decodeJson(value);
  return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}
