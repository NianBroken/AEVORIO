import { fontFamily, decorationStyle } from "../lib/visual-options";
import Link from "next/link";
import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import type { PageSlug, SiteSettings } from "../lib/site-types";
import { ContentProvider } from "./ContentProvider";
import { ManagedIcon } from "./ManagedIcon";

// 公共展示只读取已发布配置，三个正式地址属于程序路由规则。
export function PageLayout({
  children,
  companyName,
  currentPage,
  settings,
}: {
  children: ReactNode;
  companyName: string;
  currentPage: PageSlug;
  settings: SiteSettings;
}) {
  const value = (key: string) => String(settings.content?.[key] ?? "");
  const navigation = [
    { href: "/", slug: "home", label: value("navHome") },
    { href: "/products", slug: "products", label: value("navProducts") },
    { href: "/about", slug: "about", label: value("navAbout") },
  ];
  const logo = settings.media?.find((m) => m.id === value("logo"));
  const variables = Object.fromEntries(
    [
      "paper",
      "paperSoft",
      "paperWhite",
      "ink",
      "inkMuted",
      "line",
      "forest",
      "forestDeep",
      "clay",
      "copper",
      "sky",
      "sage",
    ].map((k) => [
      "--" + k.replace(/[A-Z]/gu, (c) => "-" + c.toLowerCase()),
      value(k),
    ]),
  );
  const font = fontFamily(value("font"));
  return (
    <ContentProvider settings={settings}>
      <div
        className="managed-site"
        data-decoration={value("decoration")}
        style={{ ...variables, ...decorationStyle(value("decoration")), fontFamily: font } as CSSProperties}
      >
        <a className="skip-link" href="#main-content">
          {value("skipLink")}
        </a>
        <header className="site-header">
          <Link
            aria-label={companyName + value("homeSuffix")}
            className="wordmark"
            href="/"
          >
            <span className="wordmark-symbol" aria-hidden="true">
              {logo ? (
                <Image
                  alt={logo.altText}
                  src={logo.url}
                  width={28}
                  height={28}
                  unoptimized
                />
              ) : (
                <ManagedIcon name={value("logoIcon")} size={21} />
              )}
            </span>
            <span className="wordmark-copy">
              <span className="wordmark-name">{companyName}</span>
              <span className="wordmark-meta">{value("brandTagline")}</span>
            </span>
          </Link>
          <nav aria-label={value("navLabel")} className="primary-nav">
            {navigation.map((item) => (
              <Link
                aria-current={currentPage === item.slug ? "page" : undefined}
                className={`nav-link${currentPage === item.slug ? " nav-link-current" : ""}`}
                href={item.href}
                key={item.slug}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <a className="header-project-note" href="#page-end">
            <span>{value("headerNote")}</span>
            <ManagedIcon name={value("headerIcon")} size={16} aria-hidden />
          </a>
        </header>
        <main id="main-content">{children}</main>
        <footer className="site-footer" id="page-end">
          <div className="footer-topline" />
          <div className="footer-content">
            <div className="footer-company">
              <ManagedIcon name={value("footerIcon")} size={20} aria-hidden />
              <div>
                <p>{companyName}</p>
                <span>{value("footerSummary")}</span>
              </div>
            </div>
            <nav aria-label={value("footerNavLabel")} className="footer-nav">
              {navigation.map((item) => (
                <Link href={item.href} key={item.slug}>
                  {item.label}
                </Link>
              ))}
            </nav>
            {value("footerAttribution") && <span className="footer-attribution">{value("footerAttribution")}</span>}
          </div>
          <p className="footer-note">{value("footerNote")}</p>
          {value("copyright") && (
            <p className="footer-note">{value("copyright")}</p>
          )}
          {value("contact") && (
            <p className="footer-note">{value("contact")}</p>
          )}
        </footer>
      </div>
    </ContentProvider>
  );
}
