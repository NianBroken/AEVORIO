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
  const { stageRef, scale } = useScaledCanvas();
  return (
    <div
      className="scaled-page-shell"
      data-page={pageName}
      data-scaled-layout={DESIGN_WIDTH}
      data-scale-factor={scale.toFixed(5)}
    >
      <div
        ref={stageRef}
        className="design-stage"
        style={{ width: DESIGN_WIDTH }}
      >
        {children}
      </div>
    </div>
  );
}
