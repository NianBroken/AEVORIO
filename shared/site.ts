import type { Values } from "./content";
export type PageSlug = "home" | "products" | "about";
export interface MediaAsset {
  id: string;
  fileName: string;
  mimeType: string;
  width: number;
  height: number;
  sha256: string;
  altText: string;
  url: string;
  caption?: string;
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
  media: MediaAsset | null;
  categoryId?: string;
}
export interface ProductCategory {
  id: string;
  slug: string;
  name: string;
  description: string;
  sortOrder: number;
  icon?: string;
  media?: MediaAsset | null;
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
  media: MediaAsset;
  model?: string;
  tags?: string[];
  gallery?: MediaAsset[];
  icon?: string;
}
export interface SiteSettings {
  projectName: string;
  author: string;
  companyName: string;
  language: string;
  content?: Values;
  media?: MediaAsset[];
}
export interface SitePayload {
  settings: SiteSettings;
  page: {
    slug: PageSlug;
    title: string;
    description: string;
    sections: SiteSection[];
    ogTitle?: string;
    ogDescription?: string;
    ogMedia?: MediaAsset | null;
  };
  categories: ProductCategory[];
  products: SiteProduct[];
}
export interface ApiEnvelope<T> {
  Code: number;
  Messages: string;
  Data: T | null;
  RequestId: string;
  Timestamp: string;
}
