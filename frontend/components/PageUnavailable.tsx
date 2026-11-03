"use client";
import { useSiteContent } from "./ContentProvider";
interface PageUnavailableProps {
  error: string;
  title: "unavailableHome" | "unavailableProducts" | "unavailableAbout";
}

// 数据未读取时如实显示具体原因，不用静态示例数据伪装成功访问。
export function PageUnavailable({ error, title }: PageUnavailableProps) {
  const { copy } = useSiteContent();
  return (
    <section className="page-unavailable">
      <span>{copy("unavailableLabel")}</span>
      <h1>{copy(title)}</h1>
      <p>{copy("unavailableMessage")}</p>
      <p>{error}</p>
    </section>
  );
}
