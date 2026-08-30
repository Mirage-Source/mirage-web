"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const WORD = "MIRAGE";
const OVER = 24;
const ROW = 2;
const AMBIENT = 3.2;
const AUTO_ENTER_MS = 3600;
const ENTER_MS = 2100;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const easeIn = (x: number) => x * x * x;

export function Mirage({ children }: { children: ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [entered, setEntered] = useState(false);
  const [ready, setReady] = useState(false);

  const enterAtRef = useRef<number | null>(null);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const bg = document.createElement("canvas");
    const framebuf = document.createElement("canvas");
    const bgx = bg.getContext("2d")!;
    const fx = framebuf.getContext("2d")!;

    let W = 0;
    let H = 0;
    let DPR = 1;
    let HZ = 0;
    let raf = 0;
    let done = false;
    let t0 = performance.now();

    function paintLandscape(c: CanvasRenderingContext2D, w: number, h: number, hz: number) {
      c.clearRect(0, 0, w, h);

      const sky = c.createLinearGradient(0, 0, 0, hz);
      sky.addColorStop(0.0, "#93a6b2");
      sky.addColorStop(0.42, "#b3c0c4");
      sky.addColorStop(0.78, "#cbd0c9");
      sky.addColorStop(1.0, "#dcd6c6");
      c.fillStyle = sky;
      c.fillRect(0, 0, w, hz + 2);

      for (let i = 0; i < 22; i++) {
        const y = hz - 10 + Math.random() * 26;
        const x = Math.random() * w;
        const len = 40 + Math.random() * 300;
        const a = 0.1 + Math.random() * 0.3;
        c.fillStyle = `rgba(196,210,214,${a.toFixed(3)})`;
        c.fillRect(x, y, len, 1 + Math.random() * 2);
      }

      const humps: [number, number, number][] = [
        [0.06, 26, 10], [0.13, 44, 15], [0.19, 18, 7], [0.29, 34, 12],
        [0.42, 52, 17], [0.55, 22, 9], [0.63, 30, 11], [0.74, 16, 6],
        [0.86, 48, 16], [0.94, 28, 10],
      ];
      for (const [px, halfW, hgt] of humps) {
        const x = px * w;
        const y = hz + 1;

        c.beginPath();
        c.moveTo(x - halfW, y);
        c.bezierCurveTo(x - halfW * 0.45, y - hgt, x + halfW * 0.45, y - hgt, x + halfW, y);
        c.closePath();
        c.fillStyle = "rgba(88,74,60,0.82)";
        c.fill();

        c.save();
        c.globalAlpha = 0.2;
        c.beginPath();
        c.moveTo(x - halfW, y);
        c.bezierCurveTo(
          x - halfW * 0.45, y + hgt * 0.55,
          x + halfW * 0.45, y + hgt * 0.55,
          x + halfW, y,
        );
        c.closePath();
        c.fillStyle = "#58483a";
        c.fill();
        c.restore();
      }

      const shelf = c.createLinearGradient(0, hz, 0, hz + h * 0.1);
      shelf.addColorStop(0, "#d3c19a");
      shelf.addColorStop(1, "#d9b47e");
      c.fillStyle = shelf;
      c.fillRect(0, hz + 1, w, h * 0.1);

      const sand = c.createLinearGradient(0, hz + h * 0.08, 0, h);
      sand.addColorStop(0.0, "#dcb27a");
      sand.addColorStop(0.3, "#d8a468");
      sand.addColorStop(0.68, "#cd9459");
      sand.addColorStop(1.0, "#bf8449");
      c.fillStyle = sand;
      c.fillRect(0, hz + h * 0.08, w, h);

      for (let i = 0; i < 150; i++) {
        const t = Math.random();
        const y = hz + h * 0.1 + Math.pow(t, 1.6) * (h - hz - h * 0.1);
        const depth = (y - hz) / (h - hz);
        const len = 60 + Math.random() * (240 + depth * 700);
        const x = Math.random() * w - len * 0.3;
        const sag = 2 + depth * 12;
        c.beginPath();
        c.moveTo(x, y);
        c.quadraticCurveTo(x + len / 2, y + sag, x + len, y);
        c.strokeStyle = `rgba(150,105,58,${(0.05 + Math.random() * 0.1).toFixed(3)})`;
        c.lineWidth = 1 + depth * 1.6;
        c.stroke();
      }

      const tile = grainTile();
      const pattern = c.createPattern(tile, "repeat");
      if (pattern) {
        c.save();
        c.fillStyle = pattern;
        c.fillRect(0, hz, w, h - hz);
        c.restore();
      }
    }

    let grainCache: HTMLCanvasElement | null = null;
    function grainTile(): HTMLCanvasElement {
      if (grainCache) return grainCache;

      const size = 128;
      const tile = document.createElement("canvas");
      tile.width = size;
      tile.height = size;
      const tc = tile.getContext("2d")!;

      const img = tc.createImageData(size, size);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = Math.random();
        if (v > 0.88) {
          d[i] = 255; d[i + 1] = 240; d[i + 2] = 210; d[i + 3] = 18;
        } else if (v < 0.09) {
          d[i] = 90; d[i + 1] = 60; d[i + 2] = 30; d[i + 3] = 16;
        }
      }
      tc.putImageData(img, 0, 0);

      grainCache = tile;
      return tile;
    }

    function build() {
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth;
      H = window.innerHeight;
      HZ = Math.round(H * 0.455);

      cv!.width = Math.round(W * DPR);
      cv!.height = Math.round(H * DPR);
      cv!.style.width = `${W}px`;
      cv!.style.height = `${H}px`;
      ctx!.setTransform(DPR, 0, 0, DPR, 0, 0);

      const SW = W + OVER * 2;
      bg.width = Math.round(SW * DPR);
      bg.height = Math.round(H * DPR);
      framebuf.width = bg.width;
      framebuf.height = bg.height;
      bgx.setTransform(DPR, 0, 0, DPR, 0, 0);
      fx.setTransform(DPR, 0, 0, DPR, 0, 0);

      paintLandscape(bgx, SW, H, HZ);
    }

    const displayFamily = (() => {
      const v = getComputedStyle(document.documentElement)
        .getPropertyValue("--font-archivo")
        .trim();
      return v ? `${v}, system-ui, sans-serif` : "system-ui, sans-serif";
    })();

    const BASE_TRACKING = 0.26;

    function paintWord(c: CanvasRenderingContext2D, w: number, alpha: number, spread: number) {
      if (alpha <= 0.001) return;

      c.save();
      c.globalAlpha = alpha;
      c.fillStyle = "#ffffff";
      c.textBaseline = "middle";

      const glyphs = [...WORD];
      const measure = (size: number) => {
        c.font = `500 ${size}px ${displayFamily}`;
        const widths = glyphs.map((ch) => c.measureText(ch).width);
        const ink = widths.reduce((a, b) => a + b, 0);
        return { widths, ink };
      };

      let size = Math.min(W * 0.16, 190);
      let { widths, ink } = measure(size);
      const resting = ink + size * BASE_TRACKING * (glyphs.length - 1);
      const room = W * 0.82;
      if (resting > room) {
        size *= room / resting;
        ({ widths, ink } = measure(size));
      }

      const tracking = size * (BASE_TRACKING + spread * 0.5);
      const total = ink + tracking * (glyphs.length - 1);

      let x = w / 2 - total / 2;
      const y = HZ - size * 0.06;
      for (let i = 0; i < glyphs.length; i++) {
        c.fillText(glyphs[i], x, y);
        x += widths[i] + tracking;
      }
      c.restore();
    }

    function amplitudeAt(y: number, peak: number) {
      const falloff = Math.exp(-Math.abs(y - HZ) / (H * 0.26));
      return peak * falloff * (y > HZ ? 1 : 0.55);
    }

    function draw(t: number, wordAlpha: number, spread: number, peak: number) {
      const SW = W + OVER * 2;

      let src: HTMLCanvasElement = bg;
      if (wordAlpha > 0.001) {
        fx.clearRect(0, 0, SW, H);
        fx.drawImage(bg, 0, 0, SW, H);
        paintWord(fx, SW, wordAlpha, spread);
        src = framebuf;
      }

      const DW = cv!.width;
      const DH = cv!.height;
      const overDev = Math.round(OVER * DPR);
      const rowDev = Math.max(1, Math.round(ROW * DPR));

      ctx!.setTransform(1, 0, 0, 1, 0, 0);
      ctx!.clearRect(0, 0, DW, DH);

      const topDev = Math.max(0, Math.round((HZ - H * 0.42) * DPR));
      if (topDev > 0) {
        ctx!.drawImage(src, overDev, 0, DW, topDev, 0, 0, DW, topDev);
      }

      for (let y = topDev; y < DH; y += rowDev) {
        const h = Math.min(rowDev, DH - y);
        const cssY = y / DPR;
        const a = amplitudeAt(cssY, peak);
        const dx = Math.round(
          a *
            Math.sin(cssY * 0.055 + t * 0.0019 + Math.sin(t * 0.00051 + cssY * 0.004) * 1.9) *
            DPR,
        );
        ctx!.drawImage(src, overDev - dx, y, DW, h, 0, y, DW, h);
      }
    }

    function frame(now: number) {
      const t = now - t0;
      let wordAlpha = 0;
      let spread = 0;
      let peak = AMBIENT;

      if (!done) {
        const enterAt = enterAtRef.current;
        if (enterAt === null) {
          wordAlpha = clamp01((t - 250) / 900);
          peak = 1.0 + clamp01(t / 2600) * 1.4;
        } else {
          const e = clamp01((now - enterAt) / ENTER_MS);
          peak = 2.4 + easeIn(e) * 46;
          spread = easeIn(e) * 1.3;
          wordAlpha = 1 - clamp01(e * 1.35);
          if (e >= 1) {
            done = true;
            peak = AMBIENT;
          }
        }
      }

      draw(t, wordAlpha, spread, reduced ? 0.0001 : peak);
      raf = requestAnimationFrame(frame);
    }

    let resizeTimer: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(build, 140);
    };

    let autoTimer = setTimeout(enter, AUTO_ENTER_MS);

    const onVisibility = () => {
      if (document.visibilityState !== "visible" || enterAtRef.current !== null) return;
      t0 = performance.now();
      clearTimeout(autoTimer);
      autoTimer = setTimeout(enter, AUTO_ENTER_MS);
    };

    build();
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);
    raf = requestAnimationFrame(frame);

    const readyTimer = setTimeout(() => setReady(true), 900);
    if (reduced) enter();

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(resizeTimer);
      clearTimeout(readyTimer);
      clearTimeout(autoTimer);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  function enter() {
    if (enterAtRef.current !== null) return;
    enterAtRef.current = performance.now();
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(() => setEntered(true), reduced ? 120 : 1150);
  }

  useEffect(() => {
    if (entered) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " " || e.key === "Escape") {
        e.preventDefault();
        enter();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [entered]);

  const walkedIn = enterAtRef.current !== null;

  return (
    <>
      <canvas ref={canvasRef} className="scene" aria-hidden="true" />
      <div className="veil" />

      {!entered && (
        <button
          type="button"
          className="intro"
          data-ready={ready}
          onClick={enter}
          aria-label="Enter the console"
          style={walkedIn ? { pointerEvents: "none" } : undefined}
        >
          <span>click to enter</span>
        </button>
      )}

      <div className="shell" data-in={entered}>
        {children}
      </div>
    </>
  );
}
