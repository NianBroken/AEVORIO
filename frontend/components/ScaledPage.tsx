"use client";
import type { ReactNode } from "react";
import { CANVAS_STYLE, DESIGN_WIDTH, useScaledCanvas } from "../lib/use-scaled-canvas";
export function ScaledPage({
  children,
  pageName,
}: {
  children: ReactNode;
  pageName: string;
}) {
  const { stageRef, scale } = useScaledCanvas();
  return (
    <div
      className="scaled-page-shell scaled-canvas-shell"
      data-page={pageName}
      data-scaled-layout={DESIGN_WIDTH}
      data-scale-factor={scale.toFixed(5)}
    >
      <div
        ref={stageRef}
        className="design-stage scaled-canvas-stage"
        style={CANVAS_STYLE}
      >
        {children}
      </div>
    </div>
  );
}
