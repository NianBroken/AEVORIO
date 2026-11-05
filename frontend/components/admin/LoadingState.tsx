"use client";
import { useSyncExternalStore } from "react";
import { getPendingRequests, subscribeRequests } from "./request-activity";
import type { CSSProperties } from "react";

// 后台所有等待状态共用四点加载图形，尺寸随所在按钮或区域变化。
export function LoadingIndicator({ style }: { style?: CSSProperties }) {
  return <span className="admin-loading-indicator" style={style} aria-hidden="true"><i /><i /><i /><i /></span>;
}

// 页面沿用等比例画布，区域模式只占据当前内容区域。
export function LoadingState({ standalone = false, variant = "page", title = "正在准备管理工作台", description = "页面内容加载中，请稍候。" }: { standalone?: boolean; variant?: "page" | "region" | "compact"; title?: string; description?: string }) {
  if (variant === "compact") return <span className="admin-loading-compact" role="status" aria-label={title}><LoadingIndicator /></span>;
  return <div className={standalone ? "loading-page loading-standalone" : variant === "region" ? "loading-region" : "loading-page"} role="status" aria-live="polite">
    <div className="loading-card"><span className="eyebrow">AEVORIO / 内容管理</span><LoadingIndicator /><strong>{title}</strong><p>{description}</p><div className="loading-lines" aria-hidden="true"><i /><i /><i /></div></div>
  </div>;
}

// 跨页面请求共享计数，不替换表单或改变页面布局。
export function LoadingActivity() {
  const pending = useSyncExternalStore(subscribeRequests, getPendingRequests, () => 0);
  return pending > 0 ? <LoadingState variant="compact" title="正在处理，请稍候" /> : null;
}
