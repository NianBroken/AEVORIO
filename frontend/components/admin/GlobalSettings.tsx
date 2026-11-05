import { adminContainer } from "./admin-container";
import { LoadingState } from "./LoadingState";
import { FieldValuePreview } from "./VisualPreview";
import { useEffect, useState } from "react";
import { Alert, App, Button, Form, Modal, Space } from "antd";
import { getValue, setValue, type ResourceRecord, type Values, type JsonValue } from "../../../shared/content";
import { GLOBAL_GROUPS, fieldsForGroup, type GlobalGroup } from "../../../shared/global-settings";
import { createId } from "../../lib/create-id";
import { api, ApiError } from "./api";
import { EditorField } from "./EditorField";
import { useMediaUpload } from "./useMediaUpload";

type Records = Record<string, ResourceRecord>;
type Conflict = { group: GlobalGroup; latest: ResourceRecord; values: Values };
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

// 分组共享发布基线，输入草稿独立合并，保存只提交当前分组的字段。
export function GlobalSettings({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
  const [records, setRecords] = useState<Records>({});
  const [drafts, setDrafts] = useState<Record<string, Values>>({});
  const [media, setMedia] = useState<ResourceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const { message } = App.useApp();
  useEffect(() => {
    let active = true;
    Promise.all(["company_name", "public_content"].map((id) => api<ResourceRecord>(`/resources/settings/${id}`)))
      .then((rows) => {
        if (!active) return;
        setRecords(Object.fromEntries(rows.map((row) => [row.id, row])));
        setDrafts(Object.fromEntries(rows.map((row) => [row.id, structuredClone(row.values)])));
        setMedia(rows.flatMap((row) => row.relatedMedia ?? []));
        setError("");
      })
      .catch((failure: Error) => { if (active) setError(failure.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);
  const dirty = Object.values(records).some((record) => !same(record.values, drafts[record.id]));
  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false); }, [dirty, onDirtyChange]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const upload = useMediaUpload({ type: "settings", id: "public_content" }, (uploaded) => {
    setMedia((current) => [uploaded, ...current.filter((item) => item.id !== uploaded.id)]);
  }, setBusy);
  const change = (id: string, key: string, value: JsonValue) => setDrafts((current) => {
    const next = structuredClone(current[id]!);
    setValue(next, key, value);
    return { ...current, [id]: next };
  });
  const mergeSaved = (updated: ResourceRecord, savedKeys: Set<string>) => {
    const previous = records[updated.id]!;
    setDrafts((current) => {
      const next = structuredClone(current[updated.id]!);
      for (const field of updated.fields) {
        if (savedKeys.has(field.key) || same(getValue(next, field.key), getValue(previous.values, field.key)))
          setValue(next, field.key, getValue(updated.values, field.key) ?? null);
      }
      return { ...current, [updated.id]: next };
    });
    setRecords((current) => ({ ...current, [updated.id]: updated }));
    setMedia((current) => [...current, ...(updated.relatedMedia ?? []).filter((item) => !current.some((existing) => existing.id === item.id))]);
  };
  const save = async (group: GlobalGroup, source = drafts[group.recordId]!, baseline = records[group.recordId]!) => {
    const changes: Values = {};
    for (const field of fieldsForGroup(group, baseline)) {
      const value = getValue(source, field.key);
      if (value !== undefined && !same(value, getValue(baseline.values, field.key))) changes[field.key] = value;
    }
    if (!Object.keys(changes).length) return;
    setBusy(true);
    setError("");
    try {
      const updated = await api<ResourceRecord>(`/resources/settings/${group.recordId}`, "PATCH", { version: baseline.version, operationId: createId(), changes });
      mergeSaved(updated, new Set(Object.keys(changes)));
      setConflict(null);
      message.success(`${group.label}已保存并发布。`);
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 409) {
        try {
          const latest = await api<ResourceRecord>(`/resources/settings/${group.recordId}`);
          setConflict({ group, latest, values: structuredClone(source) });
        } catch (refreshFailure) { setError((refreshFailure as Error).message); }
      } else setError((failure as Error).message);
    } finally { setBusy(false); }
  };
  if (loading) return <LoadingState variant="region" title="正在读取公共内容" />;
  if (!records.company_name || !records.public_content) return <Alert type="error" title={error || "公共内容读取失败"} action={<Button onClick={() => { setLoading(true); setAttempt((value) => value + 1); }}>重新读取</Button>} />;
  return <div className="global-settings">
    {error && <Alert type="error" showIcon title={error} closable onClose={() => setError("")} />}
    {GLOBAL_GROUPS.map((group) => {
      const record = records[group.recordId]!;
      const fields = fieldsForGroup(group, record);
      if (!fields.length) return null;
      const changed = fields.some((field) => !same(getValue(record.values, field.key), getValue(drafts[record.id]!, field.key)));
      return <section className="panel global-settings-group" id={`global-${group.key}`} data-global-group={group.key} key={group.key}>
        <div className="global-group-heading"><h2>{group.label}</h2><Space>
          <Button aria-label="保存并发布" type="primary" disabled={busy || !changed} loading={busy && changed} onClick={() => void save(group)}>保存并发布</Button>
        </Space></div>
        <Form layout="vertical" className="global-group-fields">
          {fields.map((field) => <Form.Item key={field.key} data-global-field={field.key} required={field.required} className={field.kind === "longtext" || field.kind === "image" || field.kind === "icon" ? "global-field-wide" : undefined} label={group.key === "name" ? "网站名称" : field.label}>
            <EditorField field={group.key === "name" ? { ...field, label: "网站名称" } : field} values={drafts[record.id]!} busy={busy} media={media} categories={[]} pages={[]} change={(key, value) => change(record.id, key, value)} upload={upload} />
          </Form.Item>)}
        </Form>
      </section>;
    })}
    <Modal getContainer={adminContainer} destroyOnHidden title="内容已由其他操作更新" open={Boolean(conflict)} onCancel={() => setConflict(null)} footer={conflict && <Space><Button disabled={busy} onClick={() => setConflict(null)}>保留输入继续编辑</Button><Button type="primary" loading={busy} onClick={() => void save(conflict.group, conflict.values, conflict.latest)}>以当前输入重新提交</Button></Space>}>
      <p>请比较最新发布内容与当前输入，确认后再提交当前分组。</p>
      {conflict && fieldsForGroup(conflict.group, conflict.latest).filter((field) => !same(getValue(conflict.latest.values, field.key), getValue(conflict.values, field.key))).map((field) => <div className="preview-change" key={field.key}><strong>{field.label}</strong><p>最新发布：<FieldValuePreview field={field} values={conflict.latest.values} media={[...media, ...(conflict.latest.relatedMedia ?? [])]} /></p><p>当前输入：<FieldValuePreview field={field} values={conflict.values} media={media} /></p></div>)}
    </Modal>
  </div>;
}
