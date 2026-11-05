import type { FieldDefinition, ResourceRecord } from "./content";

// 公共字段按用途归属单一分组，未列出的字段仍在其他公共内容中提供编辑。
export const GLOBAL_GROUPS = [
  { key: "name", label: "网站名称", recordId: "company_name", fields: ["setting_value"] },
  { key: "brand", label: "品牌与分享", recordId: "public_content", fields: ["brandTagline", "logo", "logoIcon", "favicon", "defaultShareImage"] },
  { key: "navigation", label: "页眉与导航", recordId: "public_content", fields: ["navHome", "navProducts", "navAbout", "navLabel", "homeSuffix", "headerNote", "headerIcon", "skipLink"] },
  { key: "footer", label: "页脚与版权", recordId: "public_content", fields: ["footerSummary", "footerNote", "copyright", "contact", "footerAttribution", "footerIcon", "footerNavLabel"] },
  { key: "products", label: "产品公共交互", recordId: "public_content", fields: ["productCountLabel", "openProductLabel", "productGridLabel", "closeProductLabel", "dialogCaption", "dialogReference", "demoProductLabel", "featuresTitle", "specificationsTitle", "demoNote", "emptyProducts", "productArrowIcon", "closeIcon", "dialogIcon"] },
  { key: "messages", label: "通用提示", recordId: "public_content", fields: ["imageUnavailable", "unavailableHome", "unavailableProducts", "unavailableAbout", "unavailableLabel", "unavailableMessage"] },
  { key: "appearance", label: "主题与展示", recordId: "public_content", fields: ["paper", "paperSoft", "paperWhite", "ink", "inkMuted", "line", "forest", "forestDeep", "clay", "copper", "sky", "sage", "font", "decoration"] },
  { key: "other", label: "其他公共内容", recordId: "public_content", fields: [] },
] as const;

export type GlobalGroup = (typeof GLOBAL_GROUPS)[number];

export function fieldsForGroup(group: GlobalGroup, record: ResourceRecord): FieldDefinition[] {
  const assigned = new Set<string>(GLOBAL_GROUPS.filter((item) => item.recordId === record.id).flatMap((item) => [...item.fields]));
  return record.fields.filter((field) => {
    if (field.readonly) return false;
    const key = record.id === "public_content" ? field.key.replace(/^setting_value\./u, "") : field.key;
    return group.key === "other" ? !assigned.has(key) : (group.fields as readonly string[]).includes(key);
  });
}
