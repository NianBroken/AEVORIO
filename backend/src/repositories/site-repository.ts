import type { Pool, RowDataPacket } from "mysql2/promise";
import type {
  MediaAsset,
  PageSlug,
  SitePayload,
  SiteRepository,
} from "../types/site";
import { textList, type Values } from "../../../shared/content";
const decode = (value: unknown): unknown =>
  typeof value === "string" ? JSON.parse(value) : value;
// 单次读取使用一致性事务，防止发布过程中拼出不同版本的页面内容。
export class MysqlSiteRepository implements SiteRepository {
  public constructor(private readonly database: Pool) {}
  public async getSite(slug: PageSlug): Promise<SitePayload | null> {
    const db = await this.database.getConnection();
    await db.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await db.beginTransaction();
    try {
      const [pages] = await db.execute<RowDataPacket[]>(
        "SELECT * FROM pages WHERE slug=? AND is_visible=1",
        [slug],
      );
      const page = pages[0];
      if (!page) {
        await db.commit();
        return null;
      }
      const [settings] = await db.query<RowDataPacket[]>(
        "SELECT setting_key,setting_value FROM site_settings",
      );
      const [sections] = await db.execute<RowDataPacket[]>(
        "SELECT * FROM page_sections WHERE page_id=? AND is_visible=1 AND is_deleted=0 ORDER BY sort_order,id",
        [page.id],
      );
      const [categories] = await db.query<RowDataPacket[]>(
        "SELECT * FROM product_categories WHERE is_visible=1 AND is_deleted=0 ORDER BY sort_order,id",
      );
      const [products] = await db.query<RowDataPacket[]>(
        "SELECT p.* FROM products p JOIN product_categories c ON c.id=p.category_id WHERE p.is_visible=1 AND p.is_deleted=0 AND c.is_visible=1 AND c.is_deleted=0 ORDER BY c.sort_order,p.sort_order,p.id",
      );
      const [media] = await db.query<RowDataPacket[]>(
        "SELECT * FROM media_assets WHERE is_deleted=0",
      );
      const mediaMap = new Map<string, MediaAsset>(
        media.map((m) => [
          String(m.id),
          {
            id: String(m.id),
            fileName: String(m.file_name),
            mimeType: String(m.mime_type),
            width: Number(m.width),
            height: Number(m.height),
            sha256: String(m.sha256),
            altText: String(m.alt_text),
            caption: String(m.caption ?? ""),
            url: `/media/${encodeURIComponent(String(m.file_name))}?v=${String(m.sha256).slice(0, 16)}`,
          },
        ]),
      );
      const config = Object.fromEntries(
        settings.map((s) => [s.setting_key, decode(s.setting_value)]),
      );
      const categoryMap = new Map(categories.map((c) => [String(c.id), c]));
      const payload: SitePayload = {
        settings: {
          projectName: String(config.project_name),
          author: String(config.author),
          companyName: String(config.company_name),
          language: String(config.language),
          content: config.public_content as Values,
          media: [...mediaMap.values()],
        },
        page: {
          slug,
          title: String(page.title),
          description: String(page.meta_description),
          ogTitle: String(page.og_title ?? ""),
          ogDescription: String(page.og_description ?? ""),
          ogMedia: mediaMap.get(String(page.og_media_id)) ?? null,
          sections: sections
            .filter(
              (s) =>
                s.section_type !== "product-matrix" ||
                categoryMap.has(String(s.category_id)),
            )
            .map((s) => ({
              id: Number(s.id),
              sectionKey: String(s.section_key),
              sectionType: String(s.section_type),
              sortOrder: Number(s.sort_order),
              title:
                s.section_type === "product-matrix"
                  ? String(categoryMap.get(String(s.category_id))?.name)
                  : String(s.title),
              subtitle: String(s.subtitle),
              description: String(s.description),
              content: decode(s.content_json) as Record<string, unknown>,
              media: mediaMap.get(String(s.media_id)) ?? null,
              categoryId: s.category_id ? String(s.category_id) : undefined,
            })),
        },
        categories: categories.map((c) => ({
          id: String(c.id),
          slug: String(c.slug),
          name: String(c.name),
          description: String(c.description),
          sortOrder: Number(c.sort_order),
          icon: String(c.icon),
          media: mediaMap.get(String(c.media_id)) ?? null,
        })),
        products: products.map((p) => {
          const category = categoryMap.get(String(p.category_id))!;
          return {
            id: String(p.id),
            slug: String(p.slug),
            categorySlug: String(category.slug),
            categoryName: String(category.name),
            name: String(p.name),
            subtitle: String(p.subtitle),
            description: String(p.description),
            specifications: textList(decode(p.specifications_json)),
            features: textList(decode(p.features_json)),
            sortOrder: Number(p.sort_order),
            isDemo: Boolean(p.is_demo),
            media: mediaMap.get(String(p.primary_media_id))!,
            model: String(p.model),
            tags: textList(decode(p.tags_json)),
            icon: String(p.icon),
            gallery: textList(decode(p.gallery_json))
              .map((id) => mediaMap.get(id))
              .filter((m): m is MediaAsset => Boolean(m)),
          };
        }),
      };
      await db.commit();
      return payload;
    } catch (error) {
      await db.rollback();
      throw error;
    } finally {
      db.release();
    }
  }
}
