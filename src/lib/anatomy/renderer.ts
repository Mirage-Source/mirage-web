// The contract both renderers satisfy. Anatomy.tsx and SensorSketch.tsx drive
// whichever one createRenderer() hands back and never know which it is.

import type { VisualState } from "./engine.ts";
import type { Rung } from "./scenes/index.ts";

export interface Fonts {
  mono: string;
}

export interface FrameOut {
  // Screen position of the current rung's CTA anchor, or null if off-screen.
  cta: { x: number; y: number } | null;
  // The hovered object's screen position and text, for the tooltip.
  hover: { x: number; y: number; label: string; blurb: string } | null;
}

export interface Renderer {
  // Puts its own canvas(es) inside `container`, which must be positioned.
  attach(container: HTMLElement): void;
  resize(w: number, h: number, dpr: number): void;
  frame(t: number, progress: number, reduced: boolean, fonts: Fonts): FrameOut;
  dispose(): void;

  setVisual(rung: number, v: VisualState, now: number): void;
  nudgeOrbit(dyaw: number, dpitch: number): void;
  setDragging(on: boolean): void;
  setHover(key: string | null): void;
  setFocus(key: string | null): void;
  getFocus(): string | null;
  setPreview(keys: Iterable<string>): void;
  hitTest(x: number, y: number): string | null;
  // How busy the world looks, 0..1: packets per flow, swarm density.
  setActivity(level: number): void;
}

export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

// The lit renderer is its own chunk: three.js is ~150KB compressed and the
// page's numbers should not wait for it. Without WebGL, the hairline
// renderer draws the same scenes on a 2D canvas.
export async function createRenderer(rungs: Rung[], visuals: VisualState[]): Promise<Renderer> {
  if (webglAvailable()) {
    try {
      const { WorldRenderer3D } = await import("./render3d.ts");
      return new WorldRenderer3D(rungs, visuals);
    } catch (err) {
      console.warn("[anatomy] 3D renderer unavailable, falling back to hairlines:", err);
    }
  }
  const { WorldRenderer } = await import("./render.ts");
  return new WorldRenderer(rungs, visuals);
}
