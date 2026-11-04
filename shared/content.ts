// 前后台共用的内容契约。初始值只用于迁移，运行时展示读取数据库发布内容。
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type Values = Record<string, JsonValue>;
export const REVISION_PAGE_SIZE = 100;
export const ACTION_NAMES: Record<string, string> = {
  publish: "保存发布",
  restore: "历史恢复",
  create: "创建",
  delete: "可恢复删除",
  upload: "上传图片",
  replace: "替换图片",
};
export type ResourceType =
  "settings" | "pages" | "sections" | "products" | "categories" | "media";
export type FieldKind =
  | "text"
  | "longtext"
  | "number"
  | "boolean"
  | "list"
  | "image"
  | "icon"
  | "color"
  | "select"
  | "link";
export interface FieldDefinition {
  key: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  max?: number;
  options?: string[];
  readonly?: boolean;
}
export interface ResourceRecord {
  id: string;
  type: ResourceType;
  title: string;
  version: number;
  deleted: boolean;
  values: Values;
  fields: FieldDefinition[];
  references: Array<{ type: string; id: string; title: string }>;
}
export const ICON_NAMES = [
  "CircuitBoard",
  "ArrowUpRight",
  "ArrowDownRight",
  "MoveRight",
  "ChevronRight",
  "X",
  "Cpu",
  "Radio",
  "Layers",
  "Zap",
  "Code",
  "Box",
  "Globe",
  "Check",
  "Settings",
  "Activity",
  "Cable",
  "Sparkles",
];
export const RESOURCE_NAMES: Record<ResourceType, string> = {
  settings: "全局内容",
  pages: "页面信息",
  sections: "页面模块",
  products: "产品",
  categories: "产品类别",
  media: "图片文件",
};
export const SECTION_NAMES: Record<string, string> = {
  hero: "页面首屏",
  editorial: "工程笔记",
  engineering: "线路设计",
  craft: "制作细节",
  "board-showcase": "板卡观察",
  workflow: "开发路径",
  timeline: "工程过程",
  validation: "测试验证",
  applications: "应用方向",
  capabilities: "工作范围",
  disciplines: "专业分工",
  collaboration: "协作方式",
  principles: "设计原则",
  "category-overview": "分类索引",
  "product-matrix": "产品目录",
  "selection-guide": "选型提示",
  quote: "工程引言",
  closing: "结尾导航",
};
export const PROTECTED_SECTION_TYPES = new Set([
  "hero",
  "closing",
  "category-overview",
  "product-matrix",
]);
export const INITIAL_PUBLIC_CONTENT: Values = {
  brandTagline: "PCB / HARDWARE ENGINEERING",
  skipLink: "跳至当前页面主要内容",
  navLabel: "网站主导航",
  footerNavLabel: "页脚导航",
  navHome: "首页",
  navProducts: "产品介绍",
  navAbout: "关于我们",
  homeSuffix: "首页",
  headerNote: "工程实践",
  footerSummary: "项目示例内容，可依照真实资料独立更新",
  footerNote:
    "展示产品、服务和协作内容均为可编辑示例，不表示已量产、取得认证或存在实际合作承诺。",
  copyright: "",
  contact: "",
  logo: "",
  favicon: "",
  defaultShareImage: "",
  logoIcon: "CircuitBoard",
  footerIcon: "CircuitBoard",
  headerIcon: "ArrowUpRight",
  productCountLabel: "产品样例",
  openProductLabel: "打开 {name} 产品说明",
  productGridLabel: "{name}产品",
  closeProductLabel: "关闭产品说明",
  dialogCaption: "硬件示例",
  dialogReference: "HARDWARE REFERENCE",
  demoProductLabel: "示例产品",
  featuresTitle: "板卡方向",
  specificationsTitle: "接口与结构",
  demoNote: "此板卡为技术外观示例，不表示已量产或正式销售。",
  emptyProducts: "此类别暂未发布产品。",
  imageUnavailable: "图像不可读取",
  unavailableHome: "首页内容暂不可用",
  unavailableProducts: "产品目录暂不可用",
  unavailableAbout: "企业介绍暂不可用",
  unavailableLabel: "AE / CONTENT READINESS",
  unavailableMessage: "网页内容服务暂不可用，请稍后重新加载。",
  productArrowIcon: "ChevronRight",
  closeIcon: "X",
  dialogIcon: "ArrowUpRight",
  paper: "#f1f3ef",
  paperSoft: "#e9ede7",
  paperWhite: "#fbfcfa",
  ink: "#26352f",
  inkMuted: "#69776e",
  line: "#d9e0d7",
  forest: "#376d58",
  forestDeep: "#294b3e",
  clay: "#b77457",
  copper: "#d4a16c",
  sky: "#6d8790",
  sage: "#9ca487",
  font: "system",
  decoration: "dots",
};
export const PUBLIC_LABELS: Record<string, string> = {
  brandTagline: "品牌说明",
  skipLink: "跳转正文文字",
  navLabel: "主导航辅助说明",
  footerNavLabel: "页脚导航辅助说明",
  navHome: "首页导航文字",
  navProducts: "产品导航文字",
  navAbout: "关于我们导航文字",
  homeSuffix: "公司首页辅助后缀",
  headerNote: "顶部链接文字",
  footerSummary: "页脚摘要",
  footerNote: "页脚说明",
  copyright: "版权说明",
  contact: "联系信息",
  logo: "导航 Logo 图片",
  favicon: "站点图标",
  defaultShareImage: "默认分享图片",
  logoIcon: "导航默认图标",
  footerIcon: "页脚图标",
  headerIcon: "顶部链接图标",
  productCountLabel: "产品数量说明",
  openProductLabel: "打开产品辅助文字模板",
  productGridLabel: "产品网格辅助文字模板",
  closeProductLabel: "关闭产品说明",
  dialogCaption: "产品图片说明后缀",
  dialogReference: "产品详情标记",
  demoProductLabel: "示例产品标签",
  featuresTitle: "特点标题",
  specificationsTitle: "规格标题",
  demoNote: "示例产品说明",
  emptyProducts: "产品为空时的说明",
  imageUnavailable: "图片失败说明",
  unavailableHome: "首页故障标题",
  unavailableProducts: "产品页故障标题",
  unavailableAbout: "关于我们故障标题",
  unavailableLabel: "内容故障标记",
  unavailableMessage: "内容服务故障说明",
  productArrowIcon: "产品卡片图标",
  closeIcon: "详情关闭图标",
  dialogIcon: "详情装饰图标",
  paper: "页面底色",
  paperSoft: "柔和底色",
  paperWhite: "表面底色",
  ink: "主要文字颜色",
  inkMuted: "次要文字颜色",
  line: "分隔线颜色",
  forest: "主题强调色",
  forestDeep: "深色强调色",
  clay: "辅助强调色",
  copper: "铜色",
  sky: "灰蓝色",
  sage: "灰绿色",
  font: "字体",
  decoration: "背景装饰",
};

// 字段路径只由受信任的定义生成，不允许通过外部输入访问对象原型。
export function getValue(values: Values, key: string): JsonValue | undefined {
  return key
    .split(".")
    .reduce<JsonValue | undefined>(
      (value, part) =>
        value && typeof value === "object" && !Array.isArray(value)
          ? value[part]
          : undefined,
      values,
    );
}
export function setValue(values: Values, key: string, value: JsonValue): void {
  const parts = key.split(".");
  let node = values;
  for (const part of parts.slice(0, -1)) {
    if (["__proto__", "prototype", "constructor"].includes(part))
      throw new Error("字段路径无效。");
    if (
      !node[part] ||
      typeof node[part] !== "object" ||
      Array.isArray(node[part])
    )
      node[part] = {};
    node = node[part] as Values;
  }
  const last = parts.at(-1);
  if (last && !["__proto__", "prototype", "constructor"].includes(last))
    node[last] = value;
}
export function textList(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map((v) =>
          typeof v === "string" ? v : typeof v?.text === "string" ? v.text : "",
        )
        .filter(Boolean)
    : [];
}
