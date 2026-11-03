import { ArrowUpRight, CircuitBoard } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { PageSlug, SiteSettings } from '../lib/site-types';

const NAV_ITEMS: Array<{ href: string; label: string; slug: PageSlug }> = [
  { href: '/', label: '首页', slug: 'home' },
  { href: '/products', label: '产品介绍', slug: 'products' },
  { href: '/about', label: '关于我们', slug: 'about' },
];

interface PageLayoutProps {
  children: ReactNode;
  companyName: string;
  currentPage: PageSlug;
  settings: SiteSettings;
}

// 页眉、三个正式路由与页脚使用同一组数据库配置和名称。
export function PageLayout({ children, companyName, currentPage, settings }: PageLayoutProps) {
  return (
    <>
      <a className="skip-link" href="#main-content">跳至当前页面主要内容</a>
      <header className="site-header">
        <Link aria-label={`${companyName}首页`} className="wordmark" href="/">
          <span className="wordmark-symbol" aria-hidden="true"><CircuitBoard size={21} strokeWidth={1.7} /></span>
          <span className="wordmark-copy">
            <span className="wordmark-name">{companyName}</span>
            <span className="wordmark-meta">PCB / HARDWARE ENGINEERING</span>
          </span>
        </Link>

        <nav aria-label="网站主导航" className="primary-nav">
          {NAV_ITEMS.map((item) => (
            <Link
              aria-current={currentPage === item.slug ? 'page' : undefined}
              className={`nav-link${currentPage === item.slug ? ' nav-link-current' : ''}`}
              href={item.href}
              key={item.slug}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <a className="header-project-note" href="#page-end">
          <span>工程实践</span>
          <ArrowUpRight aria-hidden="true" size={16} strokeWidth={1.8} />
        </a>
      </header>

      <main id="main-content">{children}</main>

      <footer className="site-footer" id="page-end">
        <div className="footer-topline" />
        <div className="footer-content">
          <div className="footer-company">
            <CircuitBoard aria-hidden="true" size={20} strokeWidth={1.7} />
            <div>
              <p>{companyName}</p>
              <span>项目示例内容，可依照真实资料独立更新</span>
            </div>
          </div>
          <nav aria-label="页脚导航" className="footer-nav">
            {NAV_ITEMS.map((item) => <Link href={item.href} key={item.slug}>{item.label}</Link>)}
          </nav>
          <span className="footer-attribution">{settings.projectName} / {settings.author}</span>
        </div>
        <p className="footer-note">
          展示产品、服务和协作内容均为可编辑示例，不表示已量产、取得认证或存在实际合作承诺。
        </p>
      </footer>
    </>
  );
}
