import { createContext, useContext, useEffect, useState, type ReactNode, type CSSProperties } from "react";
import NextImage from "next/image";
import { getValue, INITIAL_PUBLIC_CONTENT, type FieldDefinition, type ResourceRecord, type Values } from "../../../shared/content";
import { fontFamily, decorationStyle, VISUAL_LABELS, CONTENT_PUBLISHED_EVENT } from "../../lib/visual-options";
import type { SitePayload } from "../../../shared/site";
import { IconPreview } from "./IconPreview";

type PreviewContent = { content: Values; image: string; error: string };
const PreviewContext = createContext<PreviewContent>({ content: INITIAL_PUBLIC_CONTENT, image: "", error: "正在读取示例图片" });

// 预览共享一次公开内容读取，主题与示例图片均来自当前发布内容。
export function VisualPreviewProvider({ children }: { children: ReactNode }) {
  const [preview, setPreview] = useState<PreviewContent>({ content: INITIAL_PUBLIC_CONTENT, image: "", error: "正在读取示例图片" });
  useEffect(() => {
    let controller: AbortController;
    const load = () => {
      controller?.abort();
      controller = new AbortController();
      const request = controller;
      fetch("/api/v1/site?page=home", { signal: request.signal }).then(async (response) => {
        if (!response.ok) throw new Error("预览内容读取失败，请刷新数据");
        const body = await response.json();
        if (body.Code !== 0 || !body.Data) throw new Error("预览内容读取失败，请刷新数据");
        const data = body.Data as SitePayload;
        const image = data.page.sections.find((section) => section.media)?.media?.url ?? data.products.find((product) => product.media)?.media.url ?? "";
        if (!request.signal.aborted) setPreview({ content: data.settings.content ?? INITIAL_PUBLIC_CONTENT, image, error: image ? "" : "已发布内容中没有可用的示例图片" });
      }).catch((error: Error) => { if (!request.signal.aborted) setPreview((current) => ({ ...current, error: error.message })); });
    };
    load();
    window.addEventListener(CONTENT_PUBLISHED_EVENT, load);
    return () => { controller.abort(); window.removeEventListener(CONTENT_PUBLISHED_EVENT, load); };
  }, []);
  return <PreviewContext.Provider value={preview}>{children}</PreviewContext.Provider>;
}

type Context = { field: FieldDefinition; values: Values; media: ResourceRecord[] };
const assetUrl = (id: string, media: ResourceRecord[]) => {
  const item = media.find((entry) => entry.id === id.replace(/^media:/u, ""));
  return item?.values.file_name ? `/media/${item.values.file_name}` : "";
};

// 历史快照中的媒体元数据优先于当前媒体，确保比较展示历史原图。
export function previewMedia(record: ResourceRecord, media: ResourceRecord[]) {
  const snapshots = (record as ResourceRecord & { mediaSnapshots?: Record<string, Values> }).mediaSnapshots ?? {};
  return [
    ...Object.entries(snapshots).map(([id, values]): ResourceRecord => ({ id, type: "media", title: String(values.alt_text ?? "历史图片"), values, fields: [], references: [], version: 1, deleted: false })),
    ...(record.relatedMedia ?? []), ...media,
  ];
}

// 图片加载状态按地址隔离，失败时明确显示实际状态。
export function MediaPreview({ src, alt, style }: { src: string; alt: string; style?: CSSProperties }) {
  return <MediaImage key={src} src={src} alt={alt} style={style} />;
}
function MediaImage({ src, alt, style }: { src: string; alt: string; style?: CSSProperties }) {
  const [failed, setFailed] = useState(false);
  return src && !failed
    ? <NextImage unoptimized src={src} alt={alt} width={160} height={100} className="visual-image" style={style} onError={() => setFailed(true)} />
    : <span role="status" className="media-error">{src ? "图片读取失败，请替换图片" : "尚未设置图片"}</span>;
}

// 示例图片从已发布内容读取，只用于展示效果，不参与媒体选择与归属。
function PositionPreview({ field, values, media, value }: Context & { value: string }) {
  const prefix = field.key.includes(".") ? field.key.slice(0, field.key.lastIndexOf(".") + 1) : "";
  const references = ["image", "image_id", "media_id", "backgroundMedia", "backgroundImage", "logo", "defaultShareImage"].map((key) => getValue(values, prefix + key) ?? values[key]);
  const current = references.map((id) => assetUrl(String(id ?? ""), media)).find(Boolean);
  const { image: example, error: exampleError } = useContext(PreviewContext);
  const key = field.key.split(".").at(-1);
  return <span className="visual-picture"><MediaPreview src={current || example} alt={current ? "当前图片效果" : "示例图片"} style={{ objectFit: key === "imageFit" ? value as "contain" | "cover" : "cover", objectPosition: key === "imagePosition" ? value : String(getValue(values, prefix + "imagePosition") ?? "center") }} />{!current && <small>{exampleError || "示例图片"}</small>}</span>;
}

export function VisualOption({ field, values, media, value }: Context & { value: string }) {
  const key = field.key.split(".").at(-1) ?? "";
  const { content } = useContext(PreviewContext);
  const color = (name: string) => String(getValue(values, `setting_value.${name}`) ?? content[name] ?? INITIAL_PUBLIC_CONTENT[name]);
  let visual;
  if (field.kind === "icon") visual = value.startsWith("media:") ? <MediaPreview src={assetUrl(value, media)} alt={field.label} /> : <IconPreview name={value} />;
  else if (key === "imageFit" || key === "imagePosition") visual = <PositionPreview field={field} values={values} media={media} value={value} />;
  else if (key === "font") visual = <span className="visual-font" style={{ fontFamily: fontFamily(value) }}>工程设计 AEVORIO</span>;
  else if (key === "decoration") visual = <span className="visual-surface" style={{ backgroundColor: color("paper"), ...decorationStyle(value) }} />;
  else if (key === "style") visual = <span className="visual-surface" style={{ backgroundColor: value === "soft" ? color("paperSoft") : color("paper") }}><span className="visual-section" style={{ borderColor: value === "plain" ? "transparent" : color("line"), color: color("ink") }}>AEVORIO<br />工程与产品</span></span>;
  else return <span>{value}</span>;
  return <span className={`visual-option visual-${field.kind === "icon" ? "icon" : key}`} data-visual-value={value}>{visual}<span>{VISUAL_LABELS[value] ?? (value.startsWith("media:") ? "上传图标" : value)}</span></span>;
}

// 修改预览、历史恢复与冲突比较使用同一资源展示规则。
export function FieldValuePreview({ field, values, media }: Context) {
  const value = getValue(values, field.key);
  if (field.kind === "image") return value ? <MediaPreview src={assetUrl(String(value), media)} alt={field.label} /> : <span>空</span>;
  if (field.kind === "icon" || field.kind === "select") return <VisualOption field={field} values={values} media={media} value={String(value ?? "")} />;
  if (field.key === "gallery_json" && Array.isArray(value)) return <span className="visual-gallery">{value.map((id, index) => <MediaPreview key={`${index}-${id}`} src={assetUrl(String(id), media)} alt={`${field.label}第${index + 1}项`} />)}</span>;
  if (field.kind === "color" && value) return <span className="visual-option"><span className="visual-color" style={{ backgroundColor: String(value) }} />{String(value)}</span>;
  return <span>{value === "" || value == null ? "空" : typeof value === "object" ? JSON.stringify(value) : String(value)}</span>;
}
