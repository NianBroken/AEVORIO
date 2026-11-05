"use client";
import { LoadingState } from "../../../components/admin/LoadingState";
import dynamic from "next/dynamic";
const AdminApplication = dynamic(() => import("../../../components/admin/main"), {
  ssr: false,
  loading: () => <LoadingState standalone />,
});
export default function AdminPage() { return <AdminApplication />; }
