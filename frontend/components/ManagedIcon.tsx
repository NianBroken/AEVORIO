"use client";
import {
  CircuitBoard,
  ArrowUpRight,
  ArrowDownRight,
  MoveRight,
  ChevronRight,
  X,
  Cpu,
  Radio,
  Layers,
  Zap,
  Code,
  Box,
  Globe,
  Check,
  Settings,
  Activity,
  Cable,
  Sparkles,
} from "lucide-react";
import Image from "next/image";
import { useSiteContent } from "./ContentProvider";
const ICONS = {
  CircuitBoard,
  ArrowUpRight,
  ArrowDownRight,
  MoveRight,
  ChevronRight,
  X,
  Cpu,
  Radio,
  Layers,
  Zap,
  Code,
  Box,
  Globe,
  Check,
  Settings,
  Activity,
  Cable,
  Sparkles,
};
// 只渲染允许名单中的图标或数据库媒体，内容不能动态导入程序代码。
export function ManagedIcon({
  name,
  size = 18,
  strokeWidth = 1.7,
  className,
  ...rest
}: {
  name: string;
  size?: number;
  strokeWidth?: number;
  className?: string;
  "aria-hidden"?: boolean;
}) {
  const { settings } = useSiteContent();
  if (name.startsWith("media:")) {
    const media = settings.media?.find((m) => m.id === name.slice(6));
    return media ? (
      <Image
        className={className}
        src={media.url}
        alt={media.altText}
        width={size}
        height={size}
        unoptimized
      />
    ) : null;
  }
  const Icon = ICONS[name as keyof typeof ICONS];
  return Icon ? (
    <Icon
      data-managed-icon={name}
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      {...rest}
    />
  ) : null;
}
