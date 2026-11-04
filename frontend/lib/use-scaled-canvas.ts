import { useLayoutEffect, useRef, useState } from 'react';
export const DESIGN_WIDTH = 1440;
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
      const width = stage.parentElement?.clientWidth ?? document.documentElement.clientWidth;
      if (width <= 0) return;
      const scale = width / DESIGN_WIDTH;
      stage.style.setProperty('--canvas-scale', String(scale));
      stage.style.setProperty(
        '--scaled-viewport-height',
        `${window.innerHeight / scale}px`,
      );
      stage.style.setProperty(
        '--scaled-scroll-top',
        `${window.scrollY / scale}px`,
      );
      const height = Math.max(stage.scrollHeight, window.innerHeight / scale);
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
    void document.fonts.ready.then(update);
    measure();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, []);
  return { stageRef, ...metrics };
}
