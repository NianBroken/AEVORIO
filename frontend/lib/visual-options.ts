export const CONTENT_PUBLISHED_EVENT = "aevorio:content-published";
// 字体映射供公开页面和后台预览共同使用。
const FONT_FAMILIES: Record<string, string> = {
  system: '"Microsoft YaHei UI", "Microsoft YaHei", "Segoe UI", sans-serif',
  sans: '"Segoe UI", "Microsoft YaHei", sans-serif',
  serif: 'Georgia, "SimSun", serif',
};
export const VISUAL_LABELS: Record<string, string> = {
  dots: "点阵", none: "无装饰", center: "居中", top: "顶部", bottom: "底部",
  left: "左侧", right: "右侧", contain: "完整放入", cover: "铺满裁切",
  default: "默认", soft: "柔和", plain: "简洁", system: "系统字体", sans: "无衬线字体", serif: "衬线字体",
};
export function fontFamily(value: string) {
  return FONT_FAMILIES[value] ?? FONT_FAMILIES.system;
}

// 点阵参数供网站背景与选项预览共同使用。
export function decorationStyle(value: string) {
  return {
    backgroundImage: value === "dots" ? "radial-gradient(circle at 1px 1px, rgba(55,109,88,.045) 1px, transparent 1.5px)" : "none",
    backgroundSize: "32px 32px",
  };
}
