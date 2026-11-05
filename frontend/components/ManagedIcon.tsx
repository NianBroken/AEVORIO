"use client";
import { ICON_REGISTRY } from "../lib/icon-registry";
import Image from "next/image";
import { useSiteContent } from "./ContentProvider";
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
  const Icon = ICON_REGISTRY[name as keyof typeof ICON_REGISTRY];
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
