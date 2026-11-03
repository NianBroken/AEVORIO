'use client';

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

const DESIGN_WIDTH = 1440;
const INITIAL_LAYOUT = { scale: 1, height: 0 };

interface ScaleMetrics {
  scale: number;
  height: number;
}

interface ScaledPageProps {
  children: ReactNode;
  pageName: string;
}

// ResizeObserver 只调整完整画布的整体比例，不改变板块顺序、网格列数或文字字号。
export function ScaledPage({ children, pageName }: ScaledPageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState<ScaleMetrics>(INITIAL_LAYOUT);
  const stageStyle = {
    '--stage-scale': metrics.scale,
    width: DESIGN_WIDTH,
    transform: `scale(${metrics.scale})`,
  } as CSSProperties;
  const shellStyle = { height: `${Math.ceil(metrics.height * metrics.scale)}px` };

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    let unmounted = false;
    const updateStage = (): void => {
      if (unmounted) return;
      const visibleWidth = document.documentElement.clientWidth;
      if (visibleWidth <= 0) return;

      const scale = visibleWidth / DESIGN_WIDTH;
      const height = stage.scrollHeight;
      setMetrics((previous) => previous.scale === scale && previous.height === height
        ? previous
        : { scale, height });
    };

    const observer = new ResizeObserver(updateStage);
    observer.observe(stage);
    window.addEventListener('resize', updateStage, { passive: true });
    window.visualViewport?.addEventListener('resize', updateStage, { passive: true });
    void document.fonts.ready.then(updateStage);
    updateStage();

    return () => {
      unmounted = true;
      observer.disconnect();
      window.removeEventListener('resize', updateStage);
      window.visualViewport?.removeEventListener('resize', updateStage);
    };
  }, []);

  return (
    <div
      className="scaled-page-shell"
      data-page={pageName}
      data-scaled-layout="1440"
      data-scale-factor={metrics.scale.toFixed(5)}
      style={shellStyle}
    >
      <div ref={stageRef} className="design-stage" style={stageStyle}>
        {children}
      </div>
    </div>
  );
}
