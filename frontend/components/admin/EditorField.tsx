import NextImage from "next/image";
import { Button, Input, InputNumber, Switch, Select, Space, Upload } from "antd";
import { getValue, ICON_NAMES, type FieldDefinition, type JsonValue, type ResourceRecord, type Values } from "../../../shared/content";
import { createId } from "../../lib/create-id";
import { IconPreview } from "./IconPreview";

// 普通资源与全局设置使用同一组字段控件、图片展示和列表编辑行为。
export function EditorField({ field, values, busy, change, media: currentMedia, categories, pages, upload }: {
  field: FieldDefinition;
  values: Values;
  busy: boolean;
  change: (key: string, value: JsonValue) => void;
  media: ResourceRecord[];
  categories: ResourceRecord[];
  pages: ResourceRecord[];
  upload: (file: File, key: string) => Promise<ResourceRecord | null>;
}) {
  const options = currentMedia.filter((item) => !item.deleted).map((item) => ({ value: item.id, label: item.title, src: '/media/' + item.values.file_name }));

    const value = getValue(values, field.key);
    const common = {
      id: field.key,
      "aria-label": field.label,
      disabled: busy || field.readonly,
    };
    if (field.kind === "boolean")
      return (
        <Switch
          {...common}
          checked={Boolean(value)}
          onChange={(v) => change(field.key, v)}
        />
      );
    if (field.key === "category_id")
      return (
        <Select
          {...common}
          value={String(value ?? "")}
          options={categories.map((c) => ({ value: c.id, label: c.title }))}
          onChange={(v) => change(field.key, v)}
        />
      );
    if (field.key === "page_id")
      return (
        <Select
          {...common}
          value={Number(value)}
          options={pages.map((p) => ({ value: Number(p.id), label: p.title }))}
          onChange={(v) => change(field.key, v)}
        />
      );
    if (field.kind === "number")
      return (
        <InputNumber
          {...common}
          value={Number(value)}
          min={0}
          max={65535}
          onChange={(v) => change(field.key, v ?? 0)}
        />
      );
    if (field.kind === "image")
      return (
        <div className="inline-media-field">
          {value && <Button disabled={busy || field.required} onClick={() => change(field.key, "")}>移除图片</Button>}
          <Upload
            accept=".png,.jpg,.jpeg,.webp"
            showUploadList={false}
            beforeUpload={(file) => {
              void upload(file, field.key).then((uploaded) => {
                if (uploaded) change(field.key, uploaded.id);
              });
              return false;
            }}
          >
            <Button disabled={busy}>上传图片</Button>
          </Upload>
          {value && currentMedia.some((item) => item.id === value && item.values.file_name) && (
            <NextImage
              unoptimized
              width={160}
              height={100}
              className="field-image"
              src={`/media/${currentMedia.find((m) => m.id === value)?.values.file_name ?? ""}`}
              alt={field.label}
            />
          )}
        </div>
      );
    if (field.kind === "icon")
      return (
        <div className="icon-field">
          <Select
            {...common}
            showSearch
            value={String(value ?? "")}
            options={[
              ...ICON_NAMES.map((name) => ({ value: name, label: name })),

            ]}
            onChange={(v) => change(field.key, v)}
          />
          <Upload
            accept=".png,.jpg,.jpeg,.webp"
            showUploadList={false}
            beforeUpload={(file) => {
              void upload(file, field.key).then((uploaded) => {
                if (uploaded) change(field.key, `media:${uploaded.id}`);
              });
              return false;
            }}
          >
            <Button disabled={busy}>上传图标</Button>
          </Upload>
          {String(value ?? "").startsWith("media:") ? (
            <NextImage unoptimized width={64} height={64} className="field-image" src={`/media/${currentMedia.find(item => item.id === String(value).slice(6))?.values.file_name ?? ""}`} alt={field.label} />
          ) : <IconPreview name={String(value ?? "")} />}
          {value && <Button disabled={busy} onClick={() => change(field.key, "CircuitBoard")}>使用默认图标</Button>}
        </div>
      );
    if (field.kind === "select")
      return (
        <Select
          {...common}
          value={String(value ?? "")}
          options={field.options?.map((v) => ({ value: v, label: v }))}
          onChange={(v) => change(field.key, v)}
        />
      );
    if (field.kind === "list")
      return (
        <ListField
          field={field}
          value={Array.isArray(value) ? value : []}
          onChange={(v) => change(field.key, v)}
          options={field.key === "gallery_json" ? options : undefined}
          onUpload={
            field.key === "gallery_json"
              ? async (file, index) => {
                  const uploaded = await upload(file, field.key);
                  if (!uploaded) return;
                  const next = Array.isArray(getValue(values, field.key))
                    ? [...(getValue(values, field.key) as JsonValue[])]
                    : [];
                  next[index] = uploaded.id;
                  change(field.key, next);
                }
              : undefined
          }
        />
      );
    if (field.kind === "longtext")
      return (
        <Input.TextArea
          {...common}
          value={String(value ?? "")}
          autoSize={{ minRows: 3, maxRows: 10 }}
          maxLength={field.max}
          showCount
          onChange={(e) => change(field.key, e.target.value)}
        />
      );
    if (field.kind === "color")
      return (
        <Space>
          <input
            {...common}
            id={field.key + "-picker"}
            aria-label={field.label + "颜色选择器"}
            type="color"
            value={String(value || "#f1f3ef")}
            onChange={(e) => change(field.key, e.target.value)}
          />
          <Input
            {...common}
            value={String(value ?? "")}
            maxLength={7}
            onChange={(e) => change(field.key, e.target.value)}
          />
          <Button onClick={() => change(field.key, "")}>默认</Button>
        </Space>
      );
    return (
      <Input
        {...common}
        value={String(value ?? "")}
        maxLength={field.max}
        showCount
        onChange={(e) => change(field.key, e.target.value)}
      />
    );
  }
function ListField({
  field,
  value,
  onChange,
  options,
  onUpload,
}: {
  field: FieldDefinition;
  value: JsonValue[];
  onChange: (value: JsonValue[]) => void;
  options?: Array<{ value: string; label: string; src?: string }>;
  onUpload?: (file: File, index: number) => Promise<void>;
}) {
  const update = (index: number, text: string) =>
    onChange(
      value.map((item, i) =>
        i === index
          ? options
            ? text
            : {
                id:
                  typeof item === "object" && item && !Array.isArray(item)
                    ? String(item.id)
                    : createId(),
                text,
              }
          : item,
      ),
    );
  return (
    <div className="list-editor">
      {value.map((item, index) => (
        <div
          className="list-item"
          key={
            typeof item === "object" && item && !Array.isArray(item)
              ? String(item.id)
              : index
          }
        >
          {options ? (
            <Space>
              {options.find(option => option.value === item)?.src ? <NextImage unoptimized width={96} height={64} className="field-image" src={options.find(option => option.value === item)!.src!} alt={`${field.label}第${index + 1}项`} /> : <span>请上传图片</span>}
              {onUpload && (
                <Upload
                  accept=".png,.jpg,.jpeg,.webp"
                  showUploadList={false}
                  beforeUpload={(file) => {
                    void onUpload(file, index);
                    return false;
                  }}
                >
                  <Button>上传图片</Button>
                </Upload>
              )}
            </Space>
          ) : (
            <Input
              aria-label={`${field.label}第${index + 1}项`}
              value={
                typeof item === "string"
                  ? item
                  : String((item as Values)?.text ?? "")
              }
              maxLength={400}
              onChange={(e) => update(index, e.target.value)}
            />
          )}
          <Button
            aria-label="上移"
            disabled={!index}
            onClick={() => {
              const next = [...value];
              [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
              onChange(next);
            }}
          >
            ↑
          </Button>
          <Button
            aria-label="删除此项"
            onClick={() => onChange(value.filter((_, i) => i !== index))}
          >
            移除
          </Button>
        </div>
      ))}
      <Button
        disabled={value.length >= 30}
        onClick={() =>
          onChange([
            ...value,
            options ? "" : { id: createId(), text: "" },
          ])
        }
      >
        添加一项
      </Button>
    </div>
  );
}
