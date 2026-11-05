import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import './scaled-canvas.css';
export const DESIGN_WIDTH = 1440;
export const CANVAS_STYLE: CSSProperties & Record<'--canvas-width', string> = {
  width: DESIGN_WIDTH,
  '--canvas-width': `${DESIGN_WIDTH}px`,
};
// 前台和管理界面共用画布测量，使用同一缩放比例和真实文档高度。
export function useScaledCanvas() {
  const stageRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState({ scale: 1, height: 0 });
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let disposed = false;
    let frame = 0;
    const measure = () => {
      if (disposed) return;
      const containerWidth = stage.parentElement?.clientWidth ?? document.documentElement.clientWidth;
      const viewport = window.visualViewport;
      const width = Math.min(containerWidth, viewport?.width ?? containerWidth);
      if (width <= 0) return;
      const scale = width / DESIGN_WIDTH;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const horizontalOffset = Math.max(0, Math.min(viewport?.offsetLeft ?? 0, containerWidth - width));
      stage.style.setProperty('--canvas-scale', String(scale));
      stage.style.setProperty('--canvas-width', `${DESIGN_WIDTH}px`);
      stage.style.marginLeft = `${horizontalOffset / scale}px`;
      stage.style.setProperty(
        '--scaled-viewport-height',
        `${viewportHeight / scale}px`,
      );
      stage.style.setProperty(
        '--scaled-scroll-top',
        `${(window.scrollY + (viewport?.offsetTop ?? 0)) / scale}px`,
      );
      const height = Math.max(stage.scrollHeight, viewportHeight / scale);
      setMetrics((previous) =>
        previous.scale === scale && previous.height === height
          ? previous
          : { scale, height },
      );
    };
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    if (stage.parentElement) observer.observe(stage.parentElement);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, { passive: true });
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    void document.fonts.ready.then(update);
    measure();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
    };
  }, []);
  return { stageRef, ...metrics };
}
