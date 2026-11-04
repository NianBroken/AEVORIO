import {
  INITIAL_PUBLIC_CONTENT,
  PUBLIC_LABELS,
  SECTION_NAMES,
  type FieldDefinition,
  type ResourceType,
  type Values,
} from "../../../shared/content";

// 实体和数据库列的允许名单是唯一的数据访问定义，展示 JSON 使用可解释的字段规则。
export const ENTITIES = {
  settings: {
    table: "site_settings",
    id: "setting_key",
    title: "setting_key",
    columns: ["setting_value"],
    json: ["setting_value"],
  },
  pages: {
    table: "pages",
    id: "id",
    title: "title",
    columns: [
      "title",
      "meta_description",
      "og_title",
      "og_description",
      "og_media_id",
    ],
    json: [],
  },
  sections: {
    table: "page_sections",
    id: "id",
    title: "title",
    columns: [
      "page_id",
      "section_key",
      "section_type",
      "title",
      "subtitle",
      "description",
      "content_json",
      "media_id",
      "category_id",
      "sort_order",
      "is_visible",
    ],
    json: ["content_json"],
  },
  products: {
    table: "products",
    id: "id",
    title: "name",
    columns: [
      "slug",
      "category_id",
      "name",
      "model",
      "subtitle",
      "description",
      "primary_media_id",
      "specifications_json",
      "features_json",
      "tags_json",
      "gallery_json",
      "icon",
      "sort_order",
      "is_demo",
      "is_visible",
    ],
    json: ["specifications_json", "features_json", "tags_json", "gallery_json"],
  },
  categories: {
    table: "product_categories",
    id: "id",
    title: "name",
    columns: [
      "slug",
      "name",
      "description",
      "media_id",
      "icon",
      "sort_order",
      "is_visible",
    ],
    json: [],
  },
  media: {
    table: "media_assets",
    id: "id",
    title: "resource_key",
    columns: [
      "resource_key",
      "alt_text",
      "caption",
      "file_name",
      "relative_path",
      "mime_type",
      "file_size",
      "width",
      "height",
      "sha256",
    ],
    json: [],
  },
} as const;
const LABELS: Record<string, string> = {
  title: "标题",
  meta_description: "页面描述",
  og_title: "分享标题",
  og_description: "分享描述",
  og_media_id: "分享图片",
  page_id: "所属页面",
  section_key: "稳定板块标识",
  section_type: "板块类型",
  subtitle: "副标题",
  description: "详细说明",
  media_id: "图片",
  category_id: "所属类别",
  sort_order: "显示顺序",
  is_visible: "公开显示",
  slug: "稳定标识",
  name: "名称",
  model: "产品型号",
  primary_media_id: "主图",
  specifications_json: "产品规格",
  features_json: "产品特点",
  tags_json: "展示标签",
  gallery_json: "辅助图片",
  icon: "图标",
  is_demo: "示例产品",
  resource_key: "资源名称",
  alt_text: "图片替代文字",
  caption: "图片说明",
  points: "内容要点",
  steps: "步骤",
  eyebrow: "首屏标签",
  note: "首屏说明",
  status: "协作说明",
  links: "原有导航关系",
  category: "原有类别关系",
  label: "板块分类文字",
  stamp: "首屏装饰标记",
  imageCaption: "图片标记",
  validationStatus: "验证状态文字",
  quoteReference: "引言标记",
  closingLabel: "结尾标签",
  primaryText: "主要按钮文字",
  primaryHref: "主要按钮地址",
  secondaryText: "次要按钮文字",
  secondaryHref: "次要按钮地址",
  primaryIcon: "主要按钮图标",
  secondaryIcon: "次要按钮图标",
  arrowIcon: "列表图标",
  backgroundMedia: "背景图片",
  background: "板块背景",
  imageFit: "图片适配方式",
  imagePosition: "图片显示位置",
  style: "板块样式",
  reference: "补充说明",
  overview: "板块分类说明",
};
const PUBLIC_LENGTHS: Record<string, number> = {
  navHome: 12,
  navProducts: 12,
  navAbout: 12,
  brandTagline: 80,
  headerNote: 32,
  homeSuffix: 40,
  productCountLabel: 24,
  dialogCaption: 80,
  dialogReference: 80,
  demoProductLabel: 40,
  featuresTitle: 60,
  specificationsTitle: 60,
};
export function fieldKind(
  key: string,
  value: unknown,
): FieldDefinition["kind"] {
  if (key === "background") return "color";
  if (/Icon$|^icon$/u.test(key)) return "icon";
  if (/Href$/u.test(key)) return "link";
  if (/Media$|media_id$|^logo$|^favicon$|^defaultShareImage$/u.test(key))
    return "image";
  if (typeof value === "boolean" || /^(is_visible|is_demo)$/u.test(key))
    return "boolean";
  if (typeof value === "number") return "number";
  if (Array.isArray(value)) return "list";
  if (/^#[0-9a-f]{6}$/iu.test(String(value))) return "color";
  if (/description|Note|Summary|Message|^note$|^status$/u.test(key))
    return "longtext";
  return "text";
}
export function fieldsFor(
  type: ResourceType,
  values: Values,
): FieldDefinition[] {
  const fields: FieldDefinition[] = [];
  const append = (object: Values, prefix = "", publicFields = false): void => {
    for (const [key, value] of Object.entries(object)) {
      if (["category", "links", "source"].includes(key)) continue;
      const full = prefix + key;
      if (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value)
      ) {
        append(value as Values, full + ".", publicFields);
        continue;
      }
      const kind = fieldKind(key, value);
      const readonly =
        (type === "media" &&
          !["resource_key", "alt_text", "caption"].includes(key)) ||
        ["section_key", "section_type", "slug", "page_id"].includes(key);
      const columnLimits: Record<string, number> = {
        title: type === "pages" ? 120 : 180,
        meta_description: 255,
        og_title: 240,
        og_description: 4000,
        subtitle: type === "products" ? 180 : 240,
        name: type === "categories" ? 96 : 128,
        description: type === "categories" ? 200 : 4000,
        model: 120,
        resource_key: 96,
        alt_text: 255,
        caption: 240,
        slug: type === "categories" ? 64 : 96,
        section_key: 64,
        section_type: 48,
      };
      fields.push({
        key: full,
        label: (publicFields ? PUBLIC_LABELS[key] : LABELS[key]) ?? key,
        kind,
        max:
          (publicFields ? PUBLIC_LENGTHS[key] : undefined) ??
          columnLimits[key] ??
          (kind === "longtext" ? 4000 : kind === "list" ? 30 : 240),
        readonly:
          readonly ||
          (type === "sections" &&
            ((values.section_type === "product-matrix" && key === "title") ||
              (values.section_type !== "product-matrix" &&
                key === "category_id"))),
        required: [
          "title",
          "name",
          "resource_key",
          "alt_text",
          "primary_media_id",
        ].includes(key),
      });
    }
  };
  if (type === "settings") {
    const setting = values.setting_value;
    if (setting && typeof setting === "object" && !Array.isArray(setting))
      append(setting as Values, "setting_value.", true);
    else
      fields.push({
        key: "setting_value",
        label: "公司名称",
        kind: "text",
        required: true,
        max: 80,
      });
  } else {
    for (const column of ENTITIES[type].columns) {
      if (column === "content_json")
        append(values[column] as Values, "content_json.");
      else append({ [column]: values[column] ?? "" });
    }
  }
  for (const field of fields) {
    const key = field.key.split(".").at(-1) ?? "";
    if (key === "font") {
      field.kind = "select";
      field.options = ["system", "sans", "serif"];
    }
    if (key === "decoration") {
      field.kind = "select";
      field.options = ["dots", "none"];
    }
    if (key === "imageFit") {
      field.kind = "select";
      field.options = ["contain", "cover"];
    }
    if (key === "style") {
      field.kind = "select";
      field.options = ["default", "soft", "plain"];
    }
    if (key === "imagePosition") {
      field.kind = "select";
      field.options = ["center", "top", "bottom", "left", "right"];
    }
  }
  return fields;
}
export function publicDefaults(): Values {
  return structuredClone(INITIAL_PUBLIC_CONTENT);
}

// 创建板块时只提供与实际布局对应的字段，列表条目由管理员维护稳定标识。
export function sectionDefaults(type: string): Values {
  const result: Values = {
    label: SECTION_NAMES[type] ?? "内容",
    style: "default",
    background: "",
    backgroundMedia: "",
    imageFit: "contain",
    imagePosition: "center",
  };
  if (["workflow", "timeline"].includes(type)) result.steps = [];
  else if (
    ![
      "hero",
      "quote",
      "closing",
      "category-overview",
      "product-matrix",
    ].includes(type)
  )
    result.points = [];
  if (["editorial", "engineering", "craft"].includes(type))
    result.imageCaption = "AE / CIRCUIT NOTE";
  if (type === "validation") result.validationStatus = "检查记录";
  if (type === "collaboration") result.status = "";
  if (type === "quote") {
    result.quoteReference = "ENGINEERING NOTE";
    result.note = "";
  }
  if (type === "product-matrix") result.note = "";
  if (
    [
      "applications",
      "capabilities",
      "disciplines",
      "collaboration",
      "category-overview",
      "selection-guide",
      "closing",
    ].includes(type)
  )
    result.arrowIcon = "ArrowDownRight";
  if (["hero", "closing"].includes(type))
    Object.assign(result, {
      primaryHref: "/products",
      primaryText: "查看产品",
      primaryIcon: "ArrowUpRight",
      secondaryHref: "/about",
      secondaryText: "了解工程方法",
      secondaryIcon: "MoveRight",
    });
  if (type === "hero")
    Object.assign(result, {
      eyebrow: "AEVORIO",
      note: "",
      stamp: "AE / ENGINEERING",
    });
  if (type === "closing") result.closingLabel = "继续阅读";
  return result;
}
