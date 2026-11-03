'use client';

import Image from 'next/image';
import { useState } from 'react';
import type { SiteMedia } from '../lib/site-types';

interface ScaledImageProps {
  className?: string;
  media: SiteMedia;
  priority?: boolean;
  sizes?: string;
}

// 本地图像通过前端同源代理访问，明确保留比例并在文件请求失败时显示真实替代状态。
export function ScaledImage({ className, media, priority = false, sizes = '100vw' }: ScaledImageProps) {
  const [hasFailed, setHasFailed] = useState(false);

  if (hasFailed) {
    return (
      <span className={`${className ?? ''} media-fallback`} role="img" aria-label={media.altText}>
        <span aria-hidden="true">图像不可读取</span>
        <span>{media.fileName}</span>
      </span>
    );
  }

  return (
    <Image
      alt={media.altText}
      className={className}
      fetchPriority={priority ? 'high' : 'auto'}
      fill
      loading={priority ? 'eager' : 'lazy'}
      onError={() => setHasFailed(true)}
      sizes={sizes}
      src={media.url}
      unoptimized
    />
  );
}
