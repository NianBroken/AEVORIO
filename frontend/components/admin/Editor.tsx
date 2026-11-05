import { lazy, useEffect, useState } from "react";
import {
  Button,
  Form,
  Empty,
  Tabs,
  Tag,
  App,
  Space,
} from "antd";
import {
  getValue,
  setValue,
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

import { api } from "./api";

import { EditorField } from "./EditorField";
import { useMediaUpload } from "./useMediaUpload";
import { createId } from "../../lib/create-id";

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
        { version: record.version, operationId: createId(), changes },
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
  const upload = useMediaUpload(record, onMediaUploaded, setBusy);
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
              operationId: createId(),
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
            ? `当前内容关联 ${record.references.length} 个位置。${record.references.map((r) => r.title).join("、")}`
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
                          <EditorField field={field} values={values} busy={busy} change={change} media={[...media, ...(record.relatedMedia ?? [])]} categories={categories} pages={pages} upload={upload} />
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
              保存会立即发布。图片仅归属当前使用位置。历史恢复也会立即发布。
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
