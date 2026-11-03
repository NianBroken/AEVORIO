"use client";

import Image from "next/image";
import { useState } from "react";
import type { SiteMedia } from "../lib/site-types";
import { useSiteContent } from "./ContentProvider";

interface ScaledImageProps {
  className?: string;
  media: SiteMedia;
  priority?: boolean;
  sizes?: string;
}

// 本地图像通过前端同源代理访问，明确保留比例并在文件请求失败时显示真实替代状态。
export function ScaledImage({
  className,
  media,
  priority = false,
  sizes = "100vw",
}: ScaledImageProps) {
  const [failedUrl, setFailedUrl] = useState("");
  const { copy } = useSiteContent();

  if (failedUrl === media.url) {
    return (
      <span
        className={`${className ?? ""} media-fallback`}
        role="img"
        aria-label={media.altText}
      >
        <span aria-hidden="true">{copy("imageUnavailable")}</span>
        <span>{media.fileName}</span>
      </span>
    );
  }

  return (
    <Image
      alt={media.altText}
      title={media.caption || undefined}
      className={className}
      fetchPriority={priority ? "high" : "auto"}
      fill
      loading={priority ? "eager" : "lazy"}
      onError={() => setFailedUrl(media.url)}
      sizes={sizes}
      src={media.url}
      unoptimized
    />
  );
}
