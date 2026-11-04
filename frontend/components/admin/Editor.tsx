import NextImage from "next/image";
import { lazy, useEffect, useState } from "react";
import {
  Button,
  Form,
  Input,
  InputNumber,
  Empty,
  Switch,
  Tabs,
  Tag,
  App,
  Space,
} from "antd";
import {
  getValue,
  setValue,
  ICON_NAMES,
  REVISION_PAGE_SIZE,
  RESOURCE_NAMES,
  type FieldDefinition,
  type JsonValue,
  type ResourceRecord,
  type Values,
} from "../../../shared/content";
const Alert = lazy(
  () => import("antd/es/alert"),
) as unknown as (typeof import("antd"))["Alert"];
const Upload = lazy(
  () => import("antd/es/upload"),
) as unknown as (typeof import("antd"))["Upload"];
import { api } from "./api";
const Select = lazy(
  () => import("antd/es/select"),
) as unknown as (typeof import("antd"))["Select"];
import { IconPreview } from "./IconPreview";

export function Editor({
  record,
  media,
  categories,
  pages,
  onSaved,
  onMediaUploaded,
  onClose,
}: {
  record: ResourceRecord;
  media: ResourceRecord[];
  categories: ResourceRecord[];
  pages: ResourceRecord[];
  onSaved: (record: ResourceRecord) => void;
  onMediaUploaded: (record: ResourceRecord) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Values>(() =>
    structuredClone(record.values),
  );
  const [busy, setBusy] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyMore, setHistoryMore] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [revisions, setRevisions] = useState<
    Array<{
      id: number;
      version: number;
      snapshot_json: ResourceRecord;
      created_at: string;
      username: string;
    }>
  >([]);
  const { message, modal } = App.useApp();
  const dirty = JSON.stringify(values) !== JSON.stringify(record.values);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const change = (key: string, value: JsonValue) =>
    setValues((old) => {
      const next = structuredClone(old);
      setValue(next, key, value);
      return next;
    });
  const close = () => {
    if (dirty)
      modal.confirm({
        title: "当前修改尚未发布",
        content: "离开将丢弃未保存的输入。",
        okText: "放弃修改",
        cancelText: "继续编辑",
        onOk: onClose,
      });
    else onClose();
  };
  const save = async () => {
    setBusy(true);
    try {
      const changes: Values = {};
      for (const field of record.fields)
        if (
          !field.readonly &&
          JSON.stringify(getValue(record.values, field.key)) !==
            JSON.stringify(getValue(values, field.key))
        )
          changes[field.key] = getValue(values, field.key) ?? null;
      const updated = await api<ResourceRecord>(
        `/resources/${record.type}/${record.id}`,
        "PATCH",
        { version: record.version, operationId: crypto.randomUUID(), changes },
      );
      setValues(structuredClone(updated.values));
      onSaved(updated);
      message.success("内容已保存并发布，刷新公开页面即可查看。");
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const upload = async (file: File): Promise<ResourceRecord | null> => {
    setBusy(true);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("operationId", crypto.randomUUID());
      const uploaded = await api<ResourceRecord>(
        "/media/uploads",
        "POST",
        body,
      );
      onMediaUploaded(uploaded);
      message.success("图片已上传，可在当前字段中使用。");
      return uploaded;
    } catch (error) {
      message.error((error as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  };
  const loadHistory = async (page = 1) => {
    setHistoryLoading(true);
    try {
      const rows = await api<typeof revisions>(
        `/revisions/${record.type}/${record.id}?page=${page}`,
      );
      setRevisions((old) => (page === 1 ? rows : [...old, ...rows]));
      setHistoryPage(page);
      setHistoryMore(rows.length === REVISION_PAGE_SIZE);
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setHistoryLoading(false);
    }
  };
  const restore = (revision: (typeof revisions)[number]) =>
    modal.confirm({
      title: `恢复版本 ${revision.version} 并立即发布`,
      content: (
        <div>
          <p>只恢复当前对象，生成新的发布版本。</p>
          <div className="revision-diff">
            {record.fields
              .filter(
                (f) =>
                  !f.readonly &&
                  JSON.stringify(getValue(record.values, f.key)) !==
                    JSON.stringify(
                      getValue(revision.snapshot_json.values, f.key),
                    ),
              )
              .map((field) => (
                <div className="preview-change" key={field.key}>
                  <strong>{field.label}</strong>
                  <del>{displayValue(getValue(record.values, field.key))}</del>
                  <p>
                    {displayValue(
                      getValue(revision.snapshot_json.values, field.key),
                    )}
                  </p>
                </div>
              ))}
          </div>
          {record.references.length > 0 && (
            <p>影响位置：{record.references.map((r) => r.title).join("、")}</p>
          )}
        </div>
      ),
      width: 650,
      okText: "恢复并发布",
      cancelText: "取消",
      onOk: async () => {
        try {
          const updated = await api<ResourceRecord>(
            `/revisions/${record.type}/${record.id}/restore`,
            "POST",
            {
              version: record.version,
              revisionId: revision.id,
              operationId: crypto.randomUUID(),
            },
          );
          setValues(updated.values);
          onSaved(updated);
          await loadHistory();
          message.success("历史版本已恢复并发布。");
        } catch (error) {
          message.error((error as Error).message);
          throw error;
        }
      },
    });
  const options = media
    .filter((m) => !m.deleted)
    .map((m) => ({ value: m.id, label: m.title }));
  const renderField = (field: FieldDefinition) => {
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
          <Select
            {...common}
            allowClear
            showSearch
            optionFilterProp="label"
            value={value || undefined}
            options={options}
            onChange={(v) => change(field.key, v ?? "")}
          />
          <Upload
            accept=".png,.jpg,.jpeg,.webp"
            showUploadList={false}
            beforeUpload={(file) => {
              void upload(file).then((uploaded) => {
                if (uploaded) change(field.key, uploaded.id);
              });
              return false;
            }}
          >
            <Button disabled={busy}>上传图片</Button>
          </Upload>
          {value && (
            <NextImage
              unoptimized
              width={160}
              height={100}
              className="field-image"
              src={`/media/${media.find((m) => m.id === value)?.values.file_name ?? ""}`}
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
              ...options.map((o) => ({
                value: "media:" + o.value,
                label: "图片 / " + o.label,
              })),
            ]}
            onChange={(v) => change(field.key, v)}
          />
          <Upload
            accept=".png,.jpg,.jpeg,.webp"
            showUploadList={false}
            beforeUpload={(file) => {
              void upload(file).then((uploaded) => {
                if (uploaded) change(field.key, `media:${uploaded.id}`);
              });
              return false;
            }}
          >
            <Button disabled={busy}>上传图标</Button>
          </Upload>
          <IconPreview name={String(value ?? "")} />
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
                  const uploaded = await upload(file);
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
  };
  const groups = [
    {
      key: "content",
      label: "文字与内容",
      test: (f: FieldDefinition) =>
        !["image", "icon", "color"].includes(f.kind) &&
        !/(style|imageFit|imagePosition|font|decoration)$/u.test(f.key),
    },
    {
      key: "media",
      label: "图片与图标",
      test: (f: FieldDefinition) => ["image", "icon"].includes(f.kind),
    },
    {
      key: "display",
      label: "展示设置",
      test: (f: FieldDefinition) =>
        f.kind === "color" ||
        /(style|imageFit|imagePosition|font|decoration)$/u.test(f.key),
    },
  ];
  return (
    <div className="editor">
      <div className="editor-toolbar">
        <div>
          <span className="eyebrow">资源编辑</span>
          <h2>{record.title}</h2>
          <p>
            {RESOURCE_NAMES[record.type]} / {record.id}
          </p>
        </div>
        <Space>
          <Tag color="green">已发布 v{record.version}</Tag>
          <Button onClick={close}>返回列表</Button>
          <Button
            type="primary"
            loading={busy}
            disabled={!dirty}
            onClick={save}
          >
            保存并发布
          </Button>
        </Space>
      </div>
      <Alert
        type="info"
        showIcon
        title="保存后立即更新公开网站"
        description={
          record.references.length
            ? `共享资源，影响 ${record.references.length} 个位置。${record.references.map((r) => r.title).join("、")}`
            : "当前编辑针对这一条资源，历史记录可用于恢复。"
        }
      />
      <div className="editor-columns">
        <div className="editor-form">
          <Tabs
            onChange={(key) => {
              if (key === "history") void loadHistory();
            }}
            items={[
              ...groups
                .filter((g) => record.fields.some(g.test))
                .map((group) => ({
                  key: group.key,
                  label: group.label,
                  children: (
                    <Form layout="vertical">
                      {record.fields.filter(group.test).map((field) => (
                        <Form.Item
                          key={field.key}
                          label={
                            <span>
                              {field.label}
                              {field.readonly && <Tag>固定标识</Tag>}
                            </span>
                          }
                          required={field.required}
                          extra={
                            !field.readonly && field.kind === "text"
                              ? `最多 ${field.max ?? 240} 个字符`
                              : undefined
                          }
                        >
                          {renderField(field)}
                        </Form.Item>
                      ))}
                    </Form>
                  ),
                })),
              {
                key: "history",
                label: "历史与恢复",
                children: (
                  <div>
                    {revisions.length ? (
                      revisions.map((revision) => (
                        <div className="revision-row" key={revision.id}>
                          <div>
                            <strong>版本 {revision.version}</strong>
                            <p>
                              {new Date(revision.created_at).toLocaleString(
                                "zh-CN",
                              )}{" "}
                              / {revision.username ?? "初始化"}
                            </p>
                          </div>
                          <Button
                            disabled={busy}
                            onClick={() => restore(revision)}
                          >
                            比较并恢复
                          </Button>
                        </div>
                      ))
                    ) : (
                      <Empty description="尚无历史修改" />
                    )}
                    {historyMore && (
                      <Button
                        loading={historyLoading}
                        onClick={() => void loadHistory(historyPage + 1)}
                      >
                        加载更早的历史
                      </Button>
                    )}
                  </div>
                ),
              },
            ]}
          />
        </div>
        <aside className="editor-preview">
          <span className="eyebrow">当前内容与修改预览</span>
          <h3>{record.title}</h3>
          {record.fields
            .filter(
              (f) =>
                !f.readonly &&
                JSON.stringify(getValue(record.values, f.key)) !==
                  JSON.stringify(getValue(values, f.key)),
            )
            .map((field) => (
              <div className="preview-change" key={field.key}>
                <strong>{field.label}</strong>
                <del>{String(getValue(record.values, field.key) ?? "空")}</del>
                <p>
                  {Array.isArray(getValue(values, field.key))
                    ? JSON.stringify(getValue(values, field.key))
                    : String(getValue(values, field.key) ?? "空")}
                </p>
              </div>
            ))}
          {!dirty && <p>修改表单后，这里显示与已发布版本的差异。</p>}
          <div className="preview-guide">
            <strong>操作说明</strong>
            <p>
              保存会立即发布。替换共享媒体前，请核对受影响位置。历史恢复也会立即发布。
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
function displayValue(value: JsonValue | undefined): string {
  if (value === null || value === undefined || value === "") return "空";
  if (Array.isArray(value))
    return value
      .map((item) =>
        typeof item === "object" && item && !Array.isArray(item)
          ? String(item.text ?? "")
          : String(item),
      )
      .join("；");
  return typeof value === "boolean" ? (value ? "是" : "否") : String(value);
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
  options?: Array<{ value: string; label: string }>;
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
                    : crypto.randomUUID(),
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
              <Select
                aria-label={`${field.label}第${index + 1}项`}
                value={String(item)}
                options={options}
                onChange={(v) => update(index, v)}
              />
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
            options ? "" : { id: crypto.randomUUID(), text: "" },
          ])
        }
      >
        添加一项
      </Button>
    </div>
  );
}
