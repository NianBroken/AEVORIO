interface PageUnavailableProps {
  error: string;
  title: string;
}

// 数据未读取时如实显示具体原因，不用静态示例数据伪装成功访问。
export function PageUnavailable({ error, title }: PageUnavailableProps) {
  return (
    <section className="page-unavailable">
      <span>AE / CONTENT READINESS</span>
      <h1>{title}</h1>
      <p>{error}</p>
    </section>
  );
}
