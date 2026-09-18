"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { resolve } from "@/lib/anatomy/engine.ts";
import { WorldRenderer } from "@/lib/anatomy/render.ts";
import { ssh } from "@/lib/anatomy/scenes/ssh.ts";
import type { Rung } from "@/lib/anatomy/scenes/index.ts";

// The sensor scene from /anatomy, playing itself on the public page: one
// session arriving, being let in, looked at, and written down. Same scene
// data, same renderer; the only thing added is a clock that advances the
// path instead of a reader.
const TOUR = ["idle", "arrive", "stuff", "accepted", "shell", "bait", "captured", "pipeline"];
const STEP_MS = 3400;
const REST_MS = 5200;
const RUNGS: Rung[] = [{ scene: ssh, offset: [0, 0, 0] }];

export function SensorSketch() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  const rendererRef = useRef<WorldRenderer | null>(null);
  const reduced = useRef(false);

  if (!rendererRef.current) rendererRef.current = new WorldRenderer(RUNGS, [resolve(ssh, ["idle"])]);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cv = canvasRef.current;
    const wrap = wrapRef.current;
    const stage = stageRef.current;
    if (!cv || !wrap || !stage) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const renderer = rendererRef.current!;

    let W = 0, H = 0, DPR = 1;
    const size = () => {
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = stage.clientWidth;
      H = stage.clientHeight;
      cv.width = Math.round(W * DPR);
      cv.height = Math.round(H * DPR);
      cv.style.width = `${W}px`;
      cv.style.height = `${H}px`;
    };
    size();
    const monoVar = getComputedStyle(document.documentElement).getPropertyValue("--font-dm-mono").trim();
    const fonts = { mono: monoVar ? `${monoVar}, ui-monospace, monospace` : "ui-monospace, monospace" };

    // Under reduced motion the sketch holds one telling frame rather than
    // cycling: the session inside the shell, being recorded.
    let step = reduced.current ? 4 : 0;
    const show = (k: number) => {
      renderer.setVisual(0, resolve(ssh, TOUR.slice(0, k + 1)), performance.now());
      setAt(k);
    };
    show(step);

    let raf = 0;
    let visible = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const draw = (t: number) => {
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      renderer.frame(ctx, W, H, t, 0, reduced.current, fonts);
    };
    const loop = (t: number) => {
      draw(t);
      raf = visible && !reduced.current ? requestAnimationFrame(loop) : 0;
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };
    const advance = () => {
      step = (step + 1) % TOUR.length;
      show(step);
      timer = setTimeout(advance, step === TOUR.length - 1 || step === 0 ? REST_MS : STEP_MS);
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) {
        kick();
        if (!reduced.current && !timer) timer = setTimeout(advance, STEP_MS);
      } else if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    });
    io.observe(wrap);
    let resizeTimer: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { size(); kick(); }, 120);
    };
    window.addEventListener("resize", onResize);
    document.fonts?.ready.then(kick);
    kick();
    return () => {
      cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
      clearTimeout(resizeTimer);
      io.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const step = ssh.steps[TOUR[at]];
  return (
    <div className="sketch" ref={wrapRef}>
      <div className="sketch-stage" ref={stageRef}>
        <canvas ref={canvasRef} className="sketch-canvas" aria-hidden="true" />
      </div>
      <div className="sketch-cap" aria-live="polite">
        <div className="sketch-dots" aria-hidden="true">
          {TOUR.map((id, i) => (
            <i key={id} data-on={i <= at} />
          ))}
        </div>
        <div className="sketch-title">{step.title}</div>
        <p className="sketch-line">{step.caption}</p>
        <Link href="/anatomy" className="sketch-link mono">
          walk through it yourself →
        </Link>
      </div>
    </div>
  );
}
