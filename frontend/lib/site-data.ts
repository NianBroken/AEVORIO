import type { Metadata } from 'next';
import type { PageSlug, SitePayload } from './site-types';

const PAGE_SECTION_COUNTS: Record<PageSlug, number> = { home: 12, products: 13, about: 12 };

export type SiteResult =
  | { ok: true; data: SitePayload; error: null }
  | { ok: false; data: null; error: string };

// 所有页面只从独立 Express 接口读取真实数据，不在前端维护重复内容副本。
export async function fetchSitePage(slug: PageSlug): Promise<SiteResult> {
  const backendOrigin = process.env.BACKEND_ORIGIN ?? 'http://127.0.0.1:3101';
  const url = new URL('/api/v1/site', backendOrigin);
  url.searchParams.set('page', slug);

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8_000),
    });
    const envelope: unknown = await response.json();

    if (!isRecord(envelope) || typeof envelope.Messages !== 'string') {
      return { ok: false, data: null, error: '网页数据暂时无法读取，请确认后端服务正在运行。' };
    }
    if (!response.ok || envelope.Code !== 0) {
      return { ok: false, data: null, error: envelope.Messages };
    }
    if (!isSitePayload(envelope.Data, slug)) {
      return { ok: false, data: null, error: '页面内容的结构尚未完成初始化，请核对后端网站数据。' };
    }

    return { ok: true, data: envelope.Data, error: null };
  } catch {
    return {
      ok: false,
      data: null,
      error: '网页内容服务未连接，请检查 Express 服务和当前网络连接。',
    };
  }
}

// 元数据从与页面相同的实时数据库内容中读取，同时在离线时安全使用示例名称。
export async function makePageMetadata(slug: PageSlug): Promise<Metadata> {
  const result = await fetchSitePage(slug);
  const companyName = result.ok ? result.data.settings.companyName : '企业名称（示例）';
  const title = result.ok ? result.data.page.title : '企业硬件与电路板工程';
  const description = result.ok
    ? result.data.page.description
    : '企业名称（示例）从事 PCB 电路板、嵌入式硬件与工程技术探索。';

  return {
    title: `${companyName}｜${title}`,
    description,
  };
}

function isSitePayload(value: unknown, slug: PageSlug): value is SitePayload {
  if (!isRecord(value) || !isRecord(value.settings) || !isRecord(value.page)) return false;
  if (value.page.slug !== slug || typeof value.page.title !== 'string') return false;
  if (!Array.isArray(value.page.sections) || value.page.sections.length !== PAGE_SECTION_COUNTS[slug]) return false;
  if (typeof value.settings.companyName !== 'string') return false;

  const allSectionsHaveContent = value.page.sections.every((section) =>
    isRecord(section)
    && typeof section.sectionKey === 'string'
    && typeof section.title === 'string'
    && typeof section.description === 'string'
    && isRecord(section.content));
  if (!allSectionsHaveContent) return false;

  if (!Array.isArray(value.categories) || !Array.isArray(value.products)) return false;
  return slug !== 'products' || (value.categories.length === 9 && value.products.length === 45);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
