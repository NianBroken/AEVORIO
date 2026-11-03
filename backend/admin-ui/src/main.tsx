import { lazy, Suspense, useEffect, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  App,
  Button,
  ConfigProvider,
  Form,
  Input,
  Modal,
  Empty,
  Space,
  Spin,
  Tag,
} from "antd";
import zhCN from "antd/locale/zh_CN";
import {
  ArrowUpRight,
  CircuitBoard,
  FileText,
  Image,
  Layers,
  LogOut,
  Package,
  Settings,
  ShieldCheck,
  Search,
  Activity,
} from "lucide-react";
import {
  RESOURCE_NAMES,
  ACTION_NAMES,
  SECTION_NAMES,
  type ResourceRecord,
  type ResourceType,
  type Values,
} from "../../contracts/content";
import {
  DESIGN_WIDTH,
  useScaledCanvas,
} from "../../../frontend/lib/use-scaled-canvas";
const Alert = lazy(
  () => import("antd/es/alert"),
) as unknown as (typeof import("antd"))["Alert"];
const Upload = lazy(
  () => import("antd/es/upload"),
) as unknown as (typeof import("antd"))["Upload"];
import { api, ApiError, loadResources } from "./api";
const Select = lazy(
  () => import("antd/es/select"),
) as unknown as (typeof import("antd"))["Select"];
const Editor = lazy(() =>
  import("./Editor").then((module) => ({ default: module.Editor })),
);
const Table = lazy(
  () => import("antd/es/table"),
) as unknown as (typeof import("antd"))["Table"];
import "./styles.css";

type User = { id: string; username: string; mustChange: boolean };
type View = "overview" | "coverage" | ResourceType;
const MENU: Array<{ key: View; label: string; icon: typeof CircuitBoard }> = [
  { key: "overview", label: "工作概览", icon: Activity },
  { key: "sections", label: "页面内容", icon: FileText },
  { key: "products", label: "产品管理", icon: Package },
  { key: "categories", label: "产品类别", icon: Layers },
  { key: "media", label: "媒体资源", icon: Image },
  { key: "settings", label: "公共内容", icon: Settings },
  { key: "pages", label: "页面与分享", icon: FileText },
  { key: "coverage", label: "资源覆盖", icon: ShieldCheck },
];
function Application() {
  const refreshTicket = useRef(0);
  const [frontendOrigin, setFrontendOrigin] = useState("");
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("overview");
  const [items, setItems] = useState<ResourceRecord[]>([]);
  const [media, setMedia] = useState<ResourceRecord[]>([]);
  const [categories, setCategories] = useState<ResourceRecord[]>([]);
  const [pages, setPages] = useState<ResourceRecord[]>([]);
  const [record, setRecord] = useState<ResourceRecord | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");
  const [deleted, setDeleted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [overview, setOverview] = useState<{
    counts: Record<string, number>;
    recent: Array<{
      id: number;
      action: string;
      resource_type: string;
      resource_id: string;
      created_at: string;
      username: string;
    }>;
  } | null>(null);
  const [coverage, setCoverage] = useState<{
    total: number;
    resources: Array<{
      key: string;
      label: string;
      type: ResourceType;
      verified: boolean;
      id: string;
      adminPath: string;
    }>;
    exclusions: string[];
  } | null>(null);
  const [creating, setCreating] = useState(false);
  const { message, modal } = App.useApp();
  const { stageRef, scale, height } = useScaledCanvas();
  useEffect(() => {
    void api<{ user: User | null; frontendOrigin: string }>("/auth/session")
      .then((data) => {
        setUser(data.user);
        setFrontendOrigin(data.frontendOrigin);
      })
      .catch((e) => setError(e.message))
      .finally(() => setReady(true));
  }, []);
  // 资源清单中的稳定入口在登录后定位到对应对象，字段值仍由管理接口读取。
  useEffect(() => {
    if (!user || user.mustChange) return;
    const match =
      /^#\/(settings|pages|sections|products|categories|media)\/([^/]+)$/u.exec(
        window.location.hash,
      );
    if (!match) return;
    let active = true;
    const type = match[1] as ResourceType;
    setView(type);
    void api<ResourceRecord>(
      `/resources/${type}/${encodeURIComponent(decodeURIComponent(match[2]!))}`,
    )
      .then((item) => {
        if (active) setRecord(item);
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      });
    return () => {
      active = false;
    };
  }, [user?.id, user?.mustChange]);
  const handleError = (e: unknown) => {
    if (e instanceof ApiError && e.status === 401) setUser(null);
    setError((e as Error).message);
  };
  const refresh = async (target: View = view) => {
    const ticket = ++refreshTicket.current;
    setBusy(true);
    setError("");
    try {
      const refs = await Promise.all(
        ["media", "categories", "pages"].map((type) =>
          loadResources(type as ResourceType),
        ),
      );
      if (ticket !== refreshTicket.current) return;
      setMedia(refs[0]);
      setCategories(refs[1]);
      setPages(refs[2]);
      if (target === "overview") {
        const data = await api<NonNullable<typeof overview>>("/overview");
        if (ticket === refreshTicket.current) setOverview(data);
      } else if (target === "coverage") {
        const data = await api<NonNullable<typeof coverage>>("/coverage");
        if (ticket === refreshTicket.current) setCoverage(data);
      } else {
        const data = await loadResources(target, deleted);
        if (ticket === refreshTicket.current) setItems(data);
      }
    } catch (e) {
      if (ticket === refreshTicket.current) handleError(e);
    } finally {
      if (ticket === refreshTicket.current) setBusy(false);
    }
  };
  useEffect(() => {
    if (user && !user.mustChange) void refresh();
  }, [view, user?.id, user?.mustChange, deleted]);
  const open = async (type: ResourceType, id: string) => {
    try {
      setRecord(await api(`/resources/${type}/${encodeURIComponent(id)}`));
    } catch (e) {
      handleError(e);
    }
  };
  const navigate = (target: View) => {
    const go = () => {
      setRecord(null);
      setQuery("");
      setFilter("");
      setView(target);
    };
    if (record)
      modal.confirm({
        title: "离开当前编辑区域",
        content: "未保存的输入将被丢弃，请确认已完成保存。",
        okText: "离开编辑",
        cancelText: "继续编辑",
        onOk: go,
      });
    else go();
  };
  const logout = async () => {
    try {
      await api("/auth/logout", "POST");
      setUser(null);
      setRecord(null);
      await api("/auth/session");
    } catch (e) {
      handleError(e);
    }
  };
  const upload = async (file: File) => {
    setBusy(true);
    try {
      const data = new FormData();
      data.set("file", file);
      data.set("operationId", crypto.randomUUID());
      await api("/media/uploads", "POST", data);
      message.success("图片已保存到媒体库。");
      await refresh();
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
    return false;
  };
  const remove = (item: ResourceRecord) =>
    modal.confirm({
      title: "将对象移入可恢复记录",
      content:
        "此操作立即影响公开网站。存在引用或板块数量不足时，服务端会拒绝操作。",
      okText: "删除并发布",
      cancelText: "取消",
      onOk: async () => {
        try {
          await api(`/resources/${item.type}/${item.id}`, "DELETE", {
            version: item.version,
            operationId: crypto.randomUUID(),
          });
          await refresh();
          message.success("对象已移入可恢复记录。");
        } catch (e) {
          handleError(e);
        }
      },
    });
  const exactId = items.some(
    (item) => item.type === view && item.id === query.trim(),
  );
  const filtered = items.filter(
    (item) =>
      item.type === view &&
      (!query ||
        (exactId
          ? item.id === query.trim()
          : (item.id + " " + JSON.stringify(item.values))
              .toLocaleLowerCase()
              .includes(query.toLocaleLowerCase()))) &&
      (!filter ||
        String(item.values.category_id ?? item.values.page_id) === filter),
  );
  return (
    <div className="admin-shell" style={{ height: Math.ceil(height * scale) }}>
      <div
        ref={stageRef}
        className="admin-stage"
        style={{ width: DESIGN_WIDTH, transform: `scale(${scale})` }}
      >
        {!ready ? (
          <div className="loading-page">
            <Spin size="large" />
          </div>
        ) : !user ? (
          <Login onLogin={setUser} error={error} />
        ) : user.mustChange ? (
          <PasswordChange onChanged={setUser} />
        ) : (
          <>
            <aside className="sidebar">
              <div className="admin-brand">
                <span>
                  <CircuitBoard size={24} />
                </span>
                <div>
                  <strong>AEVORIO</strong>
                  <small>内容管理工作台</small>
                </div>
              </div>
              <p className="sidebar-caption">网站管理</p>
              <nav>
                {MENU.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.key}
                      className={view === item.key ? "active" : ""}
                      onClick={() => navigate(item.key)}
                    >
                      <Icon size={18} />
                      <span>{item.label}</span>
                      {item.key === "overview" && <i />}
                    </button>
                  );
                })}
              </nav>
              <div className="sidebar-bottom">
                <ShieldCheck size={18} />
                <span>
                  受保护的管理空间<small>所有保存立即发布</small>
                </span>
              </div>
            </aside>
            <div className="admin-workspace">
              <header className="admin-header">
                <div>
                  <span className="status-dot" />
                  内容服务已连接<span className="header-divider">/</span>
                  <span>正式内容管理</span>
                </div>
                <Space size={22}>
                  <a href={frontendOrigin} target="_blank" rel="noreferrer">
                    查看网站 <ArrowUpRight size={15} />
                  </a>
                  <span className="account-avatar">
                    {user.username.slice(0, 1).toUpperCase()}
                  </span>
                  <Button type="text" onClick={() => setPasswordOpen(true)}>
                    {user.username}
                  </Button>
                  <Button
                    type="text"
                    aria-label="退出登录"
                    icon={<LogOut size={17} />}
                    onClick={logout}
                  />
                </Space>
              </header>
              <main className="admin-main">
                {error && (
                  <Alert
                    type="error"
                    showIcon
                    closable
                    title={error}
                    onClose={() => setError("")}
                  />
                )}
                {record ? (
                  <Editor
                    key={`${record.type}-${record.id}`}
                    record={record}
                    media={media}
                    categories={categories}
                    pages={pages}
                    onSaved={(updated) => {
                      setRecord({ ...updated, references: record.references });
                      void refresh();
                    }}
                    onClose={() => {
                      setRecord(null);
                      void refresh();
                    }}
                  />
                ) : (
                  <>
                    <div className="page-heading">
                      <div>
                        <p className="eyebrow">AEVORIO / CONTENT STUDIO</p>
                        <h1>{MENU.find((item) => item.key === view)?.label}</h1>
                        <p>
                          {view === "overview"
                            ? "从一处维护网站内容，让每一项修改准确呈现。"
                            : "编辑真实发布内容，图片、文字与展示位置保持明确对应。"}
                        </p>
                      </div>
                      <Button onClick={() => void refresh()} loading={busy}>
                        刷新数据
                      </Button>
                    </div>
                    {view === "overview" && overview ? (
                      <>
                        <div className="overview-banner">
                          <div>
                            <span className="eyebrow">
                              内容与工程，有序连接
                            </span>
                            <h2>
                              让每个页面保持准确。
                              <br />
                              让每次更新都有依据。
                            </h2>
                            <p>
                              三个公开页面，共享同一份内容来源。所有修改均保存历史，支持比较与恢复。
                            </p>
                            <Button onClick={() => navigate("sections")}>
                              管理页面内容 <ArrowUpRight size={15} />
                            </Button>
                          </div>
                          <div className="banner-art">
                            <CircuitBoard size={140} strokeWidth={0.7} />
                            <span>AE / MANAGEMENT</span>
                          </div>
                        </div>
                        <div className="stat-grid">
                          {(
                            [
                              "pages",
                              "sections",
                              "products",
                              "media",
                            ] as ResourceType[]
                          ).map((type) => (
                            <button key={type} onClick={() => navigate(type)}>
                              <span>{RESOURCE_NAMES[type]}</span>
                              <strong>{overview.counts[type]}</strong>
                              <small>
                                数据库当前记录 <ArrowUpRight size={14} />
                              </small>
                            </button>
                          ))}
                        </div>
                        <div className="overview-bottom">
                          <section className="panel">
                            <div className="panel-heading">
                              <h3>近期更新</h3>
                              <Tag color="green">即时发布</Tag>
                            </div>
                            {overview.recent.length ? (
                              <Table
                                size="small"
                                rowKey="id"
                                pagination={false}
                                dataSource={overview.recent}
                                columns={[
                                  {
                                    title: "操作对象",
                                    dataIndex: "resource_type",
                                    render: (v) =>
                                      RESOURCE_NAMES[v as ResourceType] ?? v,
                                  },
                                  {
                                    title: "操作",
                                    dataIndex: "action",
                                    render: (v) => ACTION_NAMES[v] ?? v,
                                  },
                                  { title: "管理员", dataIndex: "username" },
                                  {
                                    title: "时间",
                                    dataIndex: "created_at",
                                    render: (v) =>
                                      new Date(v).toLocaleString("zh-CN"),
                                  },
                                ]}
                              />
                            ) : (
                              <Empty description="尚无内容修改，原始内容已完整保留" />
                            )}
                          </section>
                          <section className="panel quick-links">
                            <h3>维护入口</h3>
                            {(
                              [
                                "products",
                                "media",
                                "settings",
                              ] as ResourceType[]
                            ).map((type) => (
                              <button key={type} onClick={() => navigate(type)}>
                                <span>
                                  {RESOURCE_NAMES[type]}
                                  <small>
                                    {type === "media"
                                      ? "查看图片与引用位置"
                                      : type === "settings"
                                        ? "导航、页脚、主题与共享图标"
                                        : "产品说明、规格与主图"}
                                  </small>
                                </span>
                                <ArrowUpRight size={19} />
                              </button>
                            ))}
                          </section>
                        </div>
                      </>
                    ) : view === "coverage" && coverage ? (
                      <section className="panel">
                        <div className="coverage-summary">
                          <ShieldCheck size={32} />
                          <div>
                            <h2>{coverage.total} 项可维护字段与列表条目</h2>
                            <p>
                              最近一次验收通过{" "}
                              {
                                coverage.resources.filter((r) => r.verified)
                                  .length
                              }{" "}
                              项。内容变更后以最新验收记录为准。
                            </p>
                          </div>
                          <Tag color="green">编辑映射已建立</Tag>
                        </div>
                        <Table
                          rowKey="key"
                          dataSource={coverage.resources}
                          pagination={{ pageSize: 12 }}
                          columns={[
                            { title: "资源", dataIndex: "label" },
                            {
                              title: "最近验收",
                              dataIndex: "verified",
                              render: (v) => (
                                <Tag color={v ? "green" : "default"}>
                                  {v ? "已验证" : "待验证当前内容"}
                                </Tag>
                              ),
                            },
                            {
                              title: "稳定标识",
                              dataIndex: "key",
                              render: (v) => <code>{v}</code>,
                            },
                            {
                              title: "管理入口",
                              render: (_, r) => (
                                <Button
                                  onClick={() => {
                                    setView(r.type);
                                    void open(r.type, r.id);
                                  }}
                                >
                                  打开编辑
                                </Button>
                              ),
                            },
                          ]}
                        />
                        <p>程序规则排除项：{coverage.exclusions.join("、")}</p>
                      </section>
                    ) : view !== "overview" && view !== "coverage" ? (
                      <section className="panel">
                        <div className="list-toolbar">
                          <Space>
                            <Input
                              aria-label="搜索资源"
                              placeholder="搜索名称、内容或资源标识"
                              prefix={<Search size={17} />}
                              value={query}
                              onChange={(e) => setQuery(e.target.value)}
                              allowClear
                            />
                            {view === "products" && (
                              <Select
                                aria-label="筛选产品类别"
                                placeholder="全部类别"
                                allowClear
                                style={{ width: 210 }}
                                value={filter || undefined}
                                onChange={(v) => setFilter(v ?? "")}
                                options={categories.map((c) => ({
                                  value: c.id,
                                  label: c.title,
                                }))}
                              />
                            )}{" "}
                            {view === "sections" && (
                              <Select
                                aria-label="筛选页面"
                                placeholder="全部页面"
                                allowClear
                                style={{ width: 180 }}
                                value={filter || undefined}
                                onChange={(v) => setFilter(v ?? "")}
                                options={pages.map((p) => ({
                                  value: p.id,
                                  label: p.title,
                                }))}
                              />
                            )}
                          </Space>
                          <Space>
                            {view === "media" && (
                              <Button
                                onClick={() =>
                                  modal.confirm({
                                    title: "清理未引用文件",
                                    content:
                                      "保留当前资源与全部历史文件，只清理上传失败等操作留下的无引用文件。",
                                    okText: "执行清理",
                                    cancelText: "取消",
                                    onOk: async () => {
                                      try {
                                        const result = await api<{
                                          removed: string[];
                                        }>("/media/cleanup", "POST");
                                        message.success(
                                          `已清理 ${result.removed.length} 个未引用文件。`,
                                        );
                                      } catch (e) {
                                        handleError(e);
                                      }
                                    },
                                  })
                                }
                              >
                                安全清理
                              </Button>
                            )}
                            <Button onClick={() => setDeleted(!deleted)}>
                              {deleted ? "查看正常记录" : "查看可恢复记录"}
                            </Button>
                            {view === "media" ? (
                              <Upload
                                accept=".png,.jpg,.jpeg,.webp"
                                showUploadList={false}
                                beforeUpload={upload}
                              >
                                <Button type="primary">上传图片</Button>
                              </Upload>
                            ) : ["products", "categories", "sections"].includes(
                                view,
                              ) ? (
                              <Button
                                type="primary"
                                onClick={() => setCreating(true)}
                              >
                                创建{RESOURCE_NAMES[view]}
                              </Button>
                            ) : null}
                          </Space>
                        </div>
                        <Table
                          rowKey="id"
                          loading={busy}
                          dataSource={filtered}
                          pagination={{
                            pageSize: 12,
                            showSizeChanger: true,
                            showTotal: (total) => `共 ${total} 条`,
                          }}
                          columns={[
                            {
                              title: "资源名称",
                              render: (_, item) => (
                                <div className="resource-name">
                                  {view === "media" && (
                                    <img
                                      src={`/media/${item.values.file_name}?v=${item.version}`}
                                      alt={String(item.values.alt_text)}
                                    />
                                  )}
                                  <div>
                                    <strong>{item.title}</strong>
                                    <small>{item.id}</small>
                                  </div>
                                </div>
                              ),
                            },
                            {
                              title: "状态",
                              width: 125,
                              render: (_, item) => (
                                <Tag
                                  color={
                                    item.deleted
                                      ? "red"
                                      : item.values.is_visible === false
                                        ? "default"
                                        : "green"
                                  }
                                >
                                  {item.deleted
                                    ? "已删除"
                                    : item.values.is_visible === false
                                      ? "已隐藏"
                                      : "已发布"}
                                </Tag>
                              ),
                            },
                            {
                              title: "版本",
                              width: 80,
                              render: (_, item) => `v${item.version}`,
                            },
                            {
                              title: "操作",
                              width: 195,
                              render: (_, item) => (
                                <Space>
                                  <Button
                                    onClick={() =>
                                      void open(item.type, item.id)
                                    }
                                  >
                                    编辑
                                  </Button>
                                  {!["settings", "pages"].includes(view) &&
                                    !item.deleted && (
                                      <Button
                                        type="text"
                                        danger
                                        onClick={() => remove(item)}
                                      >
                                        删除
                                      </Button>
                                    )}
                                </Space>
                              ),
                            },
                          ]}
                        />
                      </section>
                    ) : null}
                  </>
                )}
              </main>
              <footer className="admin-footer">
                AEVORIO / NianBroken{" "}
                <span>内容保存在本机配置的 MySQL 与项目媒体目录</span>
              </footer>
            </div>
          </>
        )}
        <Modal
          title="修改管理密码"
          open={passwordOpen}
          footer={null}
          onCancel={() => setPasswordOpen(false)}
          destroyOnHidden
        >
          {passwordOpen && (
            <PasswordChange
              onChanged={(changed) => {
                setUser(changed);
                setPasswordOpen(false);
              }}
            />
          )}
        </Modal>
        {creating && (
          <CreateDialog
            type={view as ResourceType}
            categories={categories}
            media={media}
            pages={pages}
            onClose={() => setCreating(false)}
            onCreated={(item) => {
              setCreating(false);
              void refresh();
              setRecord(item);
              void open(item.type, item.id);
            }}
          />
        )}
      </div>
    </div>
  );
}
function Login({
  onLogin,
  error,
}: {
  onLogin: (user: User) => void;
  error: string;
}) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(error);
  return (
    <div className="login-page">
      <div className="login-story">
        <CircuitBoard size={36} />
        <span>AEVORIO / CONTENT STUDIO</span>
        <h1>
          内容准确。
          <br />
          更新有序。
        </h1>
        <p>
          管理页面、产品和媒体资源。
          <br />
          每一次发布，都能追溯和恢复。
        </p>
        <small>AEVORIO / NianBroken</small>
      </div>
      <section className="login-form">
        <span className="eyebrow">管理工作台</span>
        <h2>登录内容管理</h2>
        <p>使用本地管理员账户访问受保护的管理空间。</p>
        {failure && <Alert type="error" title={failure} />}
        <Form
          layout="vertical"
          onFinish={async (values) => {
            setBusy(true);
            try {
              const result = await api<{ user: User }>(
                "/auth/login",
                "POST",
                values,
              );
              onLogin(result.user);
            } catch (e) {
              setFailure((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Form.Item
            label="用户名"
            name="username"
            rules={[{ required: true, message: "请输入用户名" }]}
          >
            <Input autoComplete="username" size="large" />
          </Form.Item>
          <Form.Item
            label="密码"
            name="password"
            rules={[{ required: true, message: "请输入密码" }]}
          >
            <Input.Password autoComplete="current-password" size="large" />
          </Form.Item>
          <Button
            block
            htmlType="submit"
            type="primary"
            size="large"
            loading={busy}
          >
            登录后台
          </Button>
        </Form>
        <p className="login-note">
          <ShieldCheck size={16} />
          受服务器端会话与权限验证保护
        </p>
      </section>
    </div>
  );
}
function PasswordChange({ onChanged }: { onChanged: (user: User) => void }) {
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  return (
    <div className="password-page">
      <section className="panel">
        <h1>设置管理密码</h1>
        <p>首次使用必须更换临时密码，新密码至少十二个字符。</p>
        <Form
          layout="vertical"
          onFinish={async (values) => {
            setBusy(true);
            try {
              const result = await api<{ user: User }>(
                "/auth/password",
                "PATCH",
                values,
              );
              onChanged(result.user);
            } catch (e) {
              message.error((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Form.Item
            name="currentPassword"
            label="当前临时密码"
            rules={[{ required: true }]}
          >
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[{ required: true, min: 12, max: 128 }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={busy}>
            设置密码并进入后台
          </Button>
        </Form>
      </section>
    </div>
  );
}
function CreateDialog({
  type,
  categories,
  media,
  pages,
  onClose,
  onCreated,
}: {
  type: ResourceType;
  categories: ResourceRecord[];
  media: ResourceRecord[];
  pages: ResourceRecord[];
  onClose: () => void;
  onCreated: (record: ResourceRecord) => void;
}) {
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const { message } = App.useApp();
  return (
    <Modal
      open
      title={`创建${RESOURCE_NAMES[type]}`}
      onCancel={onClose}
      confirmLoading={busy}
      okText="创建并发布"
      cancelText="取消"
      getContainer={false}
      onOk={async () => {
        try {
          const input = await form.validateFields();
          setBusy(true);
          const values: Values =
            type === "products"
              ? {
                  slug: crypto.randomUUID(),
                  name: input.name,
                  category_id: input.category,
                  primary_media_id: input.media,
                  subtitle: input.subtitle ?? "",
                  description: input.description,
                  model: "",
                  features_json: [],
                  specifications_json: [],
                  tags_json: [],
                  gallery_json: [],
                  icon: "CircuitBoard",
                  sort_order: 1,
                  is_visible: true,
                  is_demo: true,
                }
              : type === "categories"
                ? {
                    slug: crypto.randomUUID(),
                    name: input.name,
                    description: input.description,
                    icon: "CircuitBoard",
                    sort_order: categories.length + 1,
                    is_visible: true,
                    media_id: input.media ?? null,
                  }
                : {
                    page_id: Number(input.page),
                    section_key: "section-" + crypto.randomUUID(),
                    section_type: input.sectionType,
                    title: input.name,
                    subtitle: input.subtitle ?? "",
                    description: input.description,
                    content_json: {},
                    media_id: input.media ?? null,
                    category_id: input.category ?? null,
                    sort_order: 99,
                    is_visible: true,
                  };
          const record = await api<ResourceRecord>(
            `/resources/${type}`,
            "POST",
            { operationId: crypto.randomUUID(), values },
          );
          onCreated(record);
        } catch (e) {
          if (e instanceof Error) message.error(e.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="名称或标题" rules={[{ required: true }]}>
          <Input maxLength={120} />
        </Form.Item>
        <Form.Item
          name="description"
          label="内容说明"
          rules={[{ required: true }]}
        >
          <Input.TextArea maxLength={1000} rows={3} />
        </Form.Item>
        {type === "products" && (
          <Form.Item
            name="category"
            label="产品类别"
            rules={[{ required: true }]}
          >
            <Select
              options={categories.map((c) => ({ value: c.id, label: c.title }))}
            />
          </Form.Item>
        )}
        {type === "sections" && (
          <>
            <Form.Item
              name="page"
              label="所属页面"
              rules={[{ required: true }]}
            >
              <Select
                options={pages.map((p) => ({ value: p.id, label: p.title }))}
              />
            </Form.Item>
            <Form.Item
              name="sectionType"
              label="板块结构"
              initialValue="editorial"
            >
              <Select
                options={Object.entries(SECTION_NAMES)
                  .filter(
                    ([key]) =>
                      ![
                        "hero",
                        "closing",
                        "product-matrix",
                        "category-overview",
                      ].includes(key),
                  )
                  .map(([value, label]) => ({ value, label }))}
              />
            </Form.Item>
          </>
        )}
        <Form.Item
          name="media"
          label="图片"
          rules={[{ required: type === "products" }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            allowClear
            options={media.map((m) => ({ value: m.id, label: m.title }))}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
createRoot(document.getElementById("root")!).render(
  <ConfigProvider
    button={{ autoInsertSpace: false }}
    locale={zhCN}
    getPopupContainer={(trigger) =>
      trigger?.parentElement ??
      document.querySelector<HTMLElement>(".admin-stage") ??
      document.body
    }
    theme={{
      token: {
        colorPrimary: "#376d58",
        colorInfo: "#376d58",
        colorBgLayout: "#f3f5f1",
        colorText: "#26352f",
        colorTextSecondary: "#718075",
        borderRadius: 6,
        fontFamily: '"Microsoft YaHei UI", "Segoe UI", sans-serif',
        controlHeight: 38,
      },
      components: {
        Table: { headerBg: "#f5f7f3", cellPaddingBlock: 16 },
        Button: { primaryShadow: "none" },
      },
    }}
  >
    <App>
      <Suspense
        fallback={
          <div className="loading-page">
            <Spin />
          </div>
        }
      >
        <Application />
      </Suspense>
    </App>
  </ConfigProvider>,
);
