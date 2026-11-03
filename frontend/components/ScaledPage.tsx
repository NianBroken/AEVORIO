"use client";
import type { ReactNode } from "react";
import { DESIGN_WIDTH, useScaledCanvas } from "../lib/use-scaled-canvas";
export function ScaledPage({
  children,
  pageName,
}: {
  children: ReactNode;
  pageName: string;
}) {
  const { stageRef, scale, height } = useScaledCanvas();
  return (
    <div
      className="scaled-page-shell"
      data-page={pageName}
      data-scaled-layout={DESIGN_WIDTH}
      data-scale-factor={scale.toFixed(5)}
      style={{ height: Math.ceil(height * scale) }}
    >
      <div
        ref={stageRef}
        className="design-stage"
        style={{ width: DESIGN_WIDTH, transform: `scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  );
}
