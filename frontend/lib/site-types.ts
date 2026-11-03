export type {
  PageSlug,
  SiteSettings,
  SiteSection,
  SiteProduct,
  ProductCategory,
  SitePayload,
  MediaAsset as SiteMedia,
  ApiEnvelope as ApiResponse,
} from '../../backend/contracts/site';
import type { SiteSettings } from '../../backend/contracts/site';
import { INITIAL_PUBLIC_CONTENT } from '../../backend/contracts/content';
// 首次启动且内容服务不可用时提供明确的技术故障界面，不伪装业务读取成功。
export const DEMO_SITE_SETTINGS: SiteSettings = {
  projectName: 'AEVORIO',
  author: 'NianBroken',
  companyName: '企业名称（示例）',
  language: 'zh-CN',
  content: INITIAL_PUBLIC_CONTENT,
};
