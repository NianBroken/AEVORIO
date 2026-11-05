import "../../components/admin/loading.css";
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'AEVORIO 后台管理', robots: { index: false, follow: false } };
export default function ManagementLayout({ children }: { children: ReactNode }) { return <html lang="zh-CN"><body>{children}</body></html>; }
