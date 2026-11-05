"use client";
import { createId } from "../../lib/create-id";
import { PASSWORD_PATTERN, PASSWORD_MESSAGE } from "../../../shared/password";
import { lazy, Suspense, useEffect, useState, useRef, useEffectEvent } from "react";
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
} from "../../../shared/content";
import {
  CANVAS_STYLE,
  useScaledCanvas,
} from "../../lib/use-scaled-canvas";
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
const GlobalSettings = lazy(() =>
  import("./GlobalSettings").then((module) => ({ default: module.GlobalSettings })),
);
const Table = lazy(
  () => import("antd/es/table"),
) as unknown as (typeof import("antd"))["Table"];
import "./styles.css";

type User = { id: string; username: string; mustChange: boolean };
type View = "overview" | "global" | "home" | "products" | "about" | "personal";
const PAGE_SLUGS: Partial<Record<View, string>> = {
  home: "home",
  products: "products",
  about: "about",
};
const VIEW_RESOURCES: Partial<Record<View, ResourceType[]>> = {
  global: ["settings"],
  home: ["sections", "pages"],
  products: ["sections", "products", "categories", "pages"],
  about: ["sections", "pages"],
};
const DEFAULT_RESOURCE: Partial<Record<View, ResourceType>> = {
  global: "settings",
  home: "sections",
  products: "sections",
  about: "sections",
};
const RESOURCE_TAB_NAMES: Partial<Record<ResourceType, string>> = {
  settings: "公共内容",
  sections: "页面模块",
  products: "产品资料",
  categories: "产品类别",
  pages: "页面信息",
};
const MENU: Array<{ key: View; label: string; icon: typeof CircuitBoard }> = [
  { key: "overview", label: "概览", icon: Activity },
  { key: "global", label: "全局内容设置", icon: Settings },
  { key: "home", label: "公司首页设置", icon: FileText },
  { key: "products", label: "产品介绍设置", icon: Package },
  { key: "about", label: "关于我们设置", icon: Layers },
  { key: "personal", label: "个人设置", icon: ShieldCheck },
];
function Application() {
  const refreshTicket = useRef(0);
  const addressTicket = useRef(0);
  const [routeError, setRouteError] = useState("");
  const [frontendOrigin, setFrontendOrigin] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("overview");
  const [resourceView, setResourceView] = useState<ResourceType>("settings");
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
  const [creating, setCreating] = useState(false);
  const [globalDirty, setGlobalDirty] = useState(false);
  const [globalReload, setGlobalReload] = useState(0);
  const [listPage, setListPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const { message, modal } = App.useApp();
  const { stageRef } = useScaledCanvas();
  useEffect(() => {
    void api<{ user: User | null; frontendOrigin: string }>("/auth/session")
      .then((data) => {
        setUser(data.user);
        setFrontendOrigin(data.frontendOrigin);
      })
      .catch((e) => setError(e.message))
      .finally(() => setReady(true));
  }, []);
  // 地址承载页面、对象和列表条件，刷新与历史导航恢复相同工作区域。
  const writeAddress = (target: View = view, resource: ResourceType = resourceView, id = "", replace = false) => {
    const search = new URLSearchParams();
    if (target === view) {
      if (query) search.set("q", query);
      if (filter) search.set("filter", filter);
      if (deleted) search.set("deleted", "1");
      if (listPage > 1) search.set("page", String(listPage));
      if (pageSize !== 12) search.set("size", String(pageSize));
    }
    const base = `/admin/${target}` + (DEFAULT_RESOURCE[target] ? `/${resource}` : "");
    const url = base + (id ? `/${encodeURIComponent(id)}` : "") + (search.size ? `?${search}` : "");
    ++addressTicket.current;
    setRouteError("");
    window.history[replace ? "replaceState" : "pushState"](null, "", url);
  };
  const restoreAddress = useEffectEvent(async () => {
    if (!user || user.mustChange) return;
    const ticket = ++addressTicket.current;
    const address = window.location.href;
    const current = () => ticket === addressTicket.current && address === window.location.href;
    setRouteError("");
    const parts = window.location.pathname.split("/").filter(Boolean);
    const legacy = /^#\/(settings|pages|sections|products|categories)\/([^/]+)$/u.exec(window.location.hash);
    const target = (parts[1] || "overview") as View;
    if (!MENU.some((entry) => entry.key === target)) {
      setRouteError("后台页面不存在，请从左侧菜单选择页面。");
      return;
    }
    const resource = (parts[2] || DEFAULT_RESOURCE[target] || "settings") as ResourceType;
    if (parts.length > 4 || (parts[2] && !VIEW_RESOURCES[target]?.includes(resource))) {
      setRouteError("后台内容路径无效，请从左侧菜单返回所属页面。");
      return;
    }
    const params = new URLSearchParams(window.location.search);
    if (target === "global" || legacy?.[1] === "settings") {
      if (parts[3] && !["company_name", "public_content"].includes(parts[3])) {
        setRouteError("全局内容路径无效，请从左侧菜单返回全局内容设置。");
        return;
      }
      setView("global");
      setResourceView("settings");
      setRecord(null);
      setCreating(false);
      const anchor = parts[3] === "company_name" || legacy?.[2] === "company_name" ? "#global-name" : window.location.hash.startsWith("#global-") ? window.location.hash : "";
      window.history.replaceState(null, "", "/admin/global/settings" + anchor);
      return;
    }
    setView(target);
    setResourceView(resource);
    setQuery(params.get("q") || "");
    setFilter(params.get("filter") || "");
    setDeleted(params.get("deleted") === "1");
    setListPage(Math.max(1, Number(params.get("page")) || 1));
    setPageSize(Math.min(100, Math.max(1, Number(params.get("size")) || 12)));
    setRecord(null);
    setCreating(false);
    if (parts[3] === "new") {
      if (!["sections", "products", "categories"].includes(resource)) {
        setRouteError("此内容类型不支持创建，请返回所属列表。");
        return;
      }
      try {
        const [categoryRows, pageRows] = await Promise.all([loadResources("categories"), loadResources("pages")]);
        if (!current()) return;
        setCategories(categoryRows);
        setPages(pageRows);
        setCreating(true);
      } catch (e) { if (current()) setRouteError((e as Error).message); }
    } else if (parts[3] || legacy) {
      try {
        const type = legacy ? legacy[1] as ResourceType : resource;
        const id = decodeURIComponent(legacy ? legacy[2]! : parts[3]!);
        const item = await api<ResourceRecord>(`/resources/${type}/${encodeURIComponent(id)}`);
        if (!current()) return;
        setRecord(item);
        if (legacy) {
          const pageRows = await loadResources("pages");
          if (!current()) return;
          const slug = type === "pages" ? item.values.slug : pageRows.find((page) => page.id === String(item.values.page_id))?.values.slug;
          const owner: View = type === "settings" ? "global" : type === "products" || type === "categories" ? "products" : slug === "about" ? "about" : slug === "products" ? "products" : "home";
          setView(owner);
          setResourceView(type);
          window.history.replaceState(null, "", `/admin/${owner}/${type}/${encodeURIComponent(id)}`);
        }
      } catch (e) { if (current()) setRouteError((e as Error).message); }
    }
    if (parts.length === 1 && !legacy) window.history.replaceState(null, "", "/admin/overview");
  });
  const handleHistory = useEffectEvent(() => {
    if ((document.querySelector(".editor") || globalDirty) && !window.confirm("返回其他页面将离开当前编辑区域，请确认未保存的输入可以丢弃。")) {
      writeAddress(view, resourceView, record?.id || "", true);
      return;
    }
    void restoreAddress();
  });
  useEffect(() => {
    queueMicrotask(() => { void restoreAddress(); });
    const pop = () => handleHistory();
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, [user?.id, user?.mustChange]);
  const handleError = (e: unknown) => {
    if (e instanceof ApiError && e.status === 401) setUser(null);
    setError((e as Error).message);
  };
  const refresh = async (
    target: View = view,
    targetResource: ResourceType = resourceView,
  ) => {
    const ticket = ++refreshTicket.current;
    setBusy(true);
    setError("");
    try {
      if (target === "global") {
        setGlobalReload((value) => value + 1);
      } else if (target === "overview") {
        const data = await api<NonNullable<typeof overview>>("/overview");
        if (ticket === refreshTicket.current) setOverview(data);
      } else if (target !== "personal") {
        const [mediaRows, categoryRows, pageRows] = await Promise.all([
          Promise.resolve([] as ResourceRecord[]),
          loadResources("categories"),
          loadResources("pages"),
        ]);
        if (ticket !== refreshTicket.current) return;
        setMedia(mediaRows);
        setCategories(categoryRows);
        setPages(pageRows);
        const data = await loadResources(targetResource, deleted);
        if (ticket === refreshTicket.current) setItems(data);
      }
    } catch (e) {
      if (ticket === refreshTicket.current) handleError(e);
    } finally {
      if (ticket === refreshTicket.current) setBusy(false);
    }
  };
  const beginCreate = async () => {
    const ticket = ++refreshTicket.current;
    setBusy(true);
    setError("");
    try {
      const [mediaRows, categoryRows, pageRows] = await Promise.all([
        Promise.resolve([] as ResourceRecord[]),
        loadResources("categories"),
        loadResources("pages"),
      ]);
      if (ticket !== refreshTicket.current) return;
      setMedia(mediaRows);
      setCategories(categoryRows);
      setPages(pageRows);
      setCreating(true);
      writeAddress(view, resourceView, "new");
    } catch (e) {
      if (ticket === refreshTicket.current) handleError(e);
    } finally {
      if (ticket === refreshTicket.current) setBusy(false);
    }
  };
  const refreshView = useEffectEvent(() => { if (user && !user.mustChange) void refresh(); });
  useEffect(() => {
    queueMicrotask(() => refreshView());
  }, [view, resourceView, user?.id, user?.mustChange, deleted]);
  const open = async (type: ResourceType, id: string) => {
    const ticket = ++addressTicket.current;
    try {
      const item = await api<ResourceRecord>(`/resources/${type}/${encodeURIComponent(id)}`);
      const pageRows = pages.length ? pages : await loadResources("pages");
      const slug = type === "pages" ? item.values.slug : pageRows.find((page) => page.id === String(item.values.page_id))?.values.slug;
      if (ticket !== addressTicket.current) return;
      const target: View = type === "settings" ? "global" : type === "products" || type === "categories" ? "products" : slug === "about" ? "about" : slug === "products" ? "products" : "home";
      setRecord(item);
      setResourceView(type);
      setView(target);
      writeAddress(target, type, id);
    } catch (e) {
      handleError(e);
    }
  };
  const navigate = (target: View) => {
    const go = () => {
      setRecord(null);
      setQuery("");
      setFilter("");
      if (DEFAULT_RESOURCE[target]) setResourceView(DEFAULT_RESOURCE[target]!);
      setView(target);
      setCreating(false);
      setDeleted(false);
      setListPage(1);
      writeAddress(target, DEFAULT_RESOURCE[target] || "settings");
    };
    if (record || globalDirty)
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
  const chooseResource = (target: ResourceType) => {
    setRecord(null);
    setQuery("");
    setFilter("");
    setDeleted(false);
    setResourceView(target);
    ++addressTicket.current;
    setRouteError("");
    setListPage(1);
    window.history.pushState(null, "", `/admin/${view}/${target}`);
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
            operationId: createId(),
          });
          await refresh();
          message.success("对象已移入可恢复记录。");
        } catch (e) {
          handleError(e);
        }
      },
    });
  const syncListAddress = useEffectEvent(() => {
    if (user && !record && !creating && window.location.pathname.split("/").filter(Boolean).length <= 3)
      writeAddress(view, resourceView, "", true);
  });
  useEffect(() => { queueMicrotask(() => syncListAddress()); }, [query, filter, deleted, listPage, pageSize]);
  const exactId = items.some(
    (item) => item.type === resourceView && item.id === query.trim(),
  );
  const pageSlug = PAGE_SLUGS[view];
  const scopedPage = pages.find((page) => page.values.slug === pageSlug);
  const filtered = items.filter(
    (item) =>
      item.type === resourceView &&
      (resourceView !== "sections" ||
        !scopedPage ||
        String(item.values.page_id) === scopedPage.id) &&
      (resourceView !== "pages" || !pageSlug || item.values.slug === pageSlug) &&
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
    <div className="admin-shell scaled-canvas-shell">
      <div
        ref={stageRef}
        className="admin-stage scaled-canvas-stage"
        style={CANVAS_STYLE}
      >
        {!ready ? (
          <LoadingState />
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
                  <Button type="text" onClick={() => navigate("personal")}>
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
                {(error || routeError) && (
                  <Alert
                    type="error"
                    showIcon
                    closable
                    title={routeError || error}
                    onClose={() => { setError(""); setRouteError(""); }}
                  />
                )}
                {record ? (
                  <Editor
                    key={`${record.type}-${record.id}`}
                    record={record}
                    media={media}
                    categories={categories}
                    pages={pages}
                    onMediaUploaded={(uploaded) =>
                      setMedia((current) => [
                        uploaded,
                        ...current.filter((item) => item.id !== uploaded.id),
                      ])
                    }
                    onSaved={(updated) => {
                      setRecord({ ...updated, references: record.references });
                      void refresh();
                    }}
                    onClose={() => {
                      setRecord(null);
                      writeAddress();
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
                      <Button aria-label="刷新数据" onClick={() => {
                        if (globalDirty) modal.confirm({ title: "刷新全局内容", content: "刷新将丢弃尚未保存的输入。", okText: "丢弃并刷新", cancelText: "继续编辑", onOk: () => refresh() });
                        else void refresh();
                      }} loading={busy}>
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
                            <Button onClick={() => navigate("home")}>
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
                            <button
                              key={type}
                              onClick={() =>
                                navigate(
                                  type === "pages" || type === "sections"
                                    ? "home"
                                    : type === "products"
                                      ? "products"
                                      : "global",
                                )
                              }
                            >
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
                            {([
                              { key: "products", label: "产品介绍设置", note: "产品说明、规格与主图" },
                              { key: "home", label: "公司首页设置", note: "首页模块与页面信息" },
                              { key: "global", label: "全局内容设置", note: "导航、页脚、主题与共享图标" },
                            ] as const).map((item) => (
                              <button
                                key={item.key}
                                onClick={() => navigate(item.key)}
                              >
                                <span>
                                  {item.label}
                                  <small>{item.note}</small>
                                </span>
                                <ArrowUpRight size={19} />
                              </button>
                            ))}
                          </section>
                        </div>
                      </>
                    ) : view === "personal" && user ? (
                      <PersonalSettings user={user} onChanged={setUser} />
                    ) : view === "global" ? (
                      <Suspense fallback={<Spin />}>
                        <GlobalSettings key={globalReload} reloadToken={globalReload} onDirtyChange={setGlobalDirty} />
                      </Suspense>
                    ) : view !== "overview" ? (
                      <section className="panel">
                        {(VIEW_RESOURCES[view]?.length ?? 0) > 1 && (
                          <nav className="resource-tabs" aria-label="页面管理内容">
                            {VIEW_RESOURCES[view]!.map((type) => (
                              <button
                                key={type}
                                className={resourceView === type ? "active" : ""}
                                onClick={() => chooseResource(type)}
                              >
                                {RESOURCE_TAB_NAMES[type]}
                              </button>
                            ))}
                          </nav>
                        )}
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
                            {resourceView === "products" && (
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
                          </Space>
                          <Space>
                            <Button onClick={() => setDeleted(!deleted)}>
                              {deleted ? "查看正常记录" : "查看可恢复记录"}
                            </Button>
                            {["products", "categories", "sections"].includes(
                              resourceView,
                            ) ? (
                              <Button
                                type="primary"
                                loading={busy}
                                disabled={busy}
                                onClick={() => void beginCreate()}
                              >
                                创建{RESOURCE_NAMES[resourceView]}
                              </Button>
                            ) : null}
                          </Space>
                        </div>
                        <Table
                          rowKey="id"
                          loading={busy}
                          dataSource={filtered}
                          pagination={{
                            current: listPage,
                            pageSize,
                            onChange: (page, size) => { setListPage(page); setPageSize(size); },
                            showSizeChanger: true,
                            showTotal: (total) => `共 ${total} 条`,
                          }}
                          columns={[
                            {
                              title: "资源名称",
                              render: (_, item) => (
                                <div className="resource-name">
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
                                  {!["settings", "pages"].includes(resourceView) &&
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
        {creating && (
          <CreateDialog
            type={resourceView}
            categories={categories}
            media={media}
            pages={pages}
            pageId={scopedPage?.id}
            onMediaUploaded={(uploaded) =>
              setMedia((current) => [
                uploaded,
                ...current.filter((item) => item.id !== uploaded.id),
              ])
            }
            onClose={() => { setCreating(false); writeAddress(); }}
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
          管理全站内容、页面模块与管理员账户。
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
function PersonalSettings({
  user,
  onChanged,
}: {
  user: User;
  onChanged: (user: User) => void;
}) {
  const [accountForm] = Form.useForm();
  const [passwordForm] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const { message } = App.useApp();
  return (
    <div className="personal-settings">
      <section className="panel">
        <div className="panel-heading">
          <h2>管理员账号</h2>
        </div>
        <Form
          form={accountForm}
          layout="vertical"
          initialValues={{ username: user.username }}
          onFinish={async (values) => {
            setBusy(true);
            try {
              const result = await api<{ user: User }>(
                "/auth/account",
                "PATCH",
                values,
              );
              onChanged(result.user);
              accountForm.resetFields(["currentPassword"]);
              message.success("管理员账号已更新。");
            } catch (error) {
              message.error((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Form.Item
            name="username"
            label="管理员账号"
            rules={[{ required: true, whitespace: true, max: 80 }]}
          >
            <Input autoComplete="username" maxLength={80} />
          </Form.Item>
          <Form.Item
            name="currentPassword"
            label="当前密码"
            rules={[{ required: true }]}
          >
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={busy}>
            保存账号
          </Button>
        </Form>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>账号安全</h2>
        </div>
        <Form
          form={passwordForm}
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
              passwordForm.resetFields();
              message.success("管理密码已更新，其他旧会话已失效。");
            } catch (error) {
              message.error((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Form.Item
            name="currentPassword"
            label="当前密码"
            rules={[{ required: true }]}
          >
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[
              {
                required: true,
                pattern: PASSWORD_PATTERN,
                message: PASSWORD_MESSAGE,
              },
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={busy}>
            更新密码
          </Button>
        </Form>
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
        <p>首次使用必须更换临时密码。新密码为 8 至 32 个 ASCII 可见字符，不含空格。</p>
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
            rules={[{ required: true, pattern: PASSWORD_PATTERN, message: PASSWORD_MESSAGE }]}
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
  pages,
  pageId,
  onMediaUploaded,
  onClose,
  onCreated,
}: {
  type: ResourceType;
  categories: ResourceRecord[];
  media: ResourceRecord[];
  pages: ResourceRecord[];
  pageId?: string;
  onMediaUploaded: (record: ResourceRecord) => void;
  onClose: () => void;
  onCreated: (record: ResourceRecord) => void;
}) {
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const uploadedMedia = Form.useWatch("media", form);
  const [customSectionType, setCustomSectionType] = useState(false);
  const { message } = App.useApp();
  const uploadImage = (file: File) => {
    void (async () => {
      setBusy(true);
      try {
        const body = new FormData();
        body.set("file", file);
        body.set("ownerType", type);
        body.set("fieldKey", type === "products" ? "primary_media_id" : "media_id");
        body.set("operationId", createId());
        const uploaded = await api<ResourceRecord>(
          "/media/uploads",
          "POST",
          body,
        );
        onMediaUploaded(uploaded);
        form.setFieldValue("media", uploaded.id);
        message.success("图片已上传并关联到当前表单。");
      } catch (error) {
        message.error((error as Error).message);
      } finally {
        setBusy(false);
      }
    })();
  };
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
                  slug: createId(),
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
                    slug: createId(),
                    name: input.name,
                    description: input.description,
                    icon: "CircuitBoard",
                    sort_order: categories.length + 1,
                    is_visible: true,
                    media_id: input.media ?? null,
                  }
                : {
                    page_id: Number(input.page),
                    section_key: "section-" + createId(),
                    section_type:
                      input.sectionType === "custom"
                        ? String(input.customSectionType).trim()
                        : input.sectionType,
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
            { operationId: createId(), values },
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
              showSearch
              optionFilterProp="label"
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
              initialValue={pageId}
            >
              <Select
                disabled={Boolean(pageId)}
                options={pages
                  .filter((page) => !pageId || page.id === pageId)
                  .map((p) => ({ value: p.id, label: p.title }))}
              />
            </Form.Item>
            <Form.Item
              name="sectionType"
              label="模块类型"
              initialValue="editorial"
              rules={[{ required: true }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                onChange={(value) => setCustomSectionType(value === "custom")}
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
                  .map(([value, label]) => ({ value, label }))
                  .concat([{ value: "custom", label: "自定义类型" }])}
              />
            </Form.Item>
            {customSectionType && (
              <Form.Item
                name="customSectionType"
                label="自定义类型名称"
                rules={[
                  { required: true, whitespace: true, max: 48 },
                  {
                    validator: async (_, value) => {
                      if (String(value ?? "").trim().length <= 48) return;
                      throw new Error("模块类型最多 48 个字符。");
                    },
                  },
                ]}
              >
                <Input maxLength={48} />
              </Form.Item>
            )}
          </>
        )}
        <Form.Item
          label="图片"
          required={type === "products"}
        >
          <Space>
            <Form.Item
              name="media"
              noStyle
              rules={[{ required: type === "products" }]}
            >
              <Input aria-label="图片" readOnly style={{ display: "none" }} />
            </Form.Item>
            <span>{uploadedMedia ? "已上传当前图片" : "请在此上传图片"}</span>
            <Upload
              accept=".png,.jpg,.jpeg,.webp"
              showUploadList={false}
              beforeUpload={(file) => {
                uploadImage(file);
                return false;
              }}
            >
              <Button disabled={busy}>上传并使用</Button>
            </Upload>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
}
export default function AdminApplication() { return (
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
          <LoadingState standalone />
        }
      >
        <Application />
      </Suspense>
    </App>
  </ConfigProvider>
); }

function LoadingState({ standalone = false }: { standalone?: boolean }) {
  return (
    <div className={standalone ? "loading-page loading-standalone" : "loading-page"} role="status" aria-live="polite">
      <div className="loading-card">
        <span className="eyebrow">AEVORIO / 内容管理</span>
        <Spin size="large" />
        <strong>正在准备管理工作台</strong>
        <p>页面内容加载中，请稍候。</p>
        <div className="loading-lines" aria-hidden="true"><i /><i /><i /></div>
      </div>
    </div>
  );
}
