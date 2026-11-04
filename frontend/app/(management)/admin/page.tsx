'use client';
import dynamic from 'next/dynamic';
const AdminApplication = dynamic(() => import('../../../components/admin/main'), { ssr: false });
export default function AdminPage() { return <AdminApplication />; }
