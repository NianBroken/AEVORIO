import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

// 文档语言、主题说明与页面级标题均为简体中文内容。
export const metadata: Metadata = {
  applicationName: 'AEVORIO',
  description: '企业硬件、电路板研发制作与工程方法展示。',
  robots: { follow: true, index: true },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
