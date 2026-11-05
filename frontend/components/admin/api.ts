import { beginRequest } from "./request-activity";
import { CONTENT_PUBLISHED_EVENT } from "../../lib/visual-options";
import type { ApiEnvelope } from "../../../shared/site";
import type { ResourceRecord, ResourceType } from "../../../shared/content";
const PAGE_LIMIT = 500;
let csrf = "";
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
// 根据服务端总数读取后续分页，选择器和列表不限制业务记录数量。
export async function loadResources(
  type: ResourceType,
  deleted = false,
): Promise<ResourceRecord[]> {
  const base = `/resources/${type}?limit=${PAGE_LIMIT}&deleted=${deleted ? "1" : "0"}`;
  const first = await api<{ items: ResourceRecord[]; total: number }>(base);
  const remaining = await Promise.all(
    Array.from(
      { length: Math.max(0, Math.ceil(first.total / PAGE_LIMIT) - 1) },
      (_, index) =>
        api<{ items: ResourceRecord[] }>(base + "&page=" + (index + 2)),
    ),
  );
  return [first.items, ...remaining.map((page) => page.items)].flat();
}
// 会话令牌只保存在内存，登录 Cookie 由浏览器以 HttpOnly 方式维护。
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const finish = beginRequest();
  try {
    const response = await fetch("/api/v1/admin" + path, {
      method,
      credentials: "same-origin",
      headers: {
        ...(body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        ...(method === "GET" ? {} : { "X-CSRF-Token": csrf }),
      },
      body:
        body === undefined
          ? undefined
          : body instanceof FormData
            ? body
            : JSON.stringify(body),
    });
    const envelope = (await response.json()) as ApiEnvelope<T>;
    if (!response.ok || envelope.Code !== 0)
      throw new ApiError(
        envelope.Messages || "管理请求未完成。",
        response.status,
      );
    const data = envelope.Data;
    if (data && typeof data === "object" && "csrfToken" in data)
      csrf = String(data.csrfToken);
    if (method !== "GET" && /^\/resources\//u.test(path))
      window.dispatchEvent(new Event(CONTENT_PUBLISHED_EVENT));
    return data as T;
  } finally {
    finish();
  }
}
