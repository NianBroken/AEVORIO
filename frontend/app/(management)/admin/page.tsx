"use client";
import dynamic from "next/dynamic";
const AdminApplication = dynamic(() => import("../../../components/admin/main"), {
  ssr: false,
  loading: () => <div role="status" style={{ width: "100%", minHeight: "100dvh", display: "grid", placeItems: "center", background: "#f3f5f1", color: "#376d58" }}>正在加载管理工作台…</div>,
});
export default function AdminPage() { return <AdminApplication />; }
