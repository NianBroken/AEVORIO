export type PageSlug = 'home' | 'products' | 'about';

export interface ApiResponse<T> {
  Code: number;
  Messages: string;
  Data: T | null;
  RequestId: string;
  Timestamp: string;
}

export interface SiteSettings {
  projectName: string;
  author: string;
  companyName: string;
  language: string;
}

// 后端暂不可用时仍然只显示与真实业务一致的中性企业名称占位值。
export const DEMO_SITE_SETTINGS: SiteSettings = {
  projectName: 'AEVORIO',
  author: 'NianBroken',
  companyName: '企业名称（示例）',
  language: 'zh-CN',
};

export interface SiteMedia {
  id: string;
  fileName: string;
  mimeType: string;
  width: number;
  height: number;
  sha256: string;
  altText: string;
  url: string;
}

export interface SiteSection {
  id: number;
  sectionKey: string;
  sectionType: string;
  sortOrder: number;
  title: string;
  subtitle: string;
  description: string;
  content: Record<string, unknown>;
  media: SiteMedia | null;
}

export interface ProductCategory {
  id: string;
  slug: string;
  name: string;
  description: string;
  sortOrder: number;
}

export interface SiteProduct {
  id: string;
  slug: string;
  categorySlug: string;
  categoryName: string;
  name: string;
  subtitle: string;
  description: string;
  specifications: string[];
  features: string[];
  sortOrder: number;
  isDemo: boolean;
  media: SiteMedia;
}

export interface SitePayload {
  settings: SiteSettings;
  page: {
    slug: PageSlug;
    title: string;
    description: string;
    sections: SiteSection[];
  };
  categories: ProductCategory[];
  products: SiteProduct[];
}
