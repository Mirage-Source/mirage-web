"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { resolve } from "@/lib/anatomy/engine.ts";
import { createRenderer, type Renderer } from "@/lib/anatomy/renderer.ts";
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

// The world's busyness follows the live 24-hour count: a few hundred
// sessions is a quiet day, ten thousand is a loud one. Log-scaled so the
// difference between 200 and 2,000 is visible and 20,000 does not saturate.
export const activityOf = (sessions24h: number | null): number =>
  sessions24h === null || sessions24h <= 0 ? 0.35 : Math.max(0.15, Math.min(1, Math.log10(sessions24h) / 4.5));

export function SensorSketch({ sessions24h = null }: { sessions24h?: number | null }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  const rendererRef = useRef<Renderer | null>(null);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const wrap = wrapRef.current;
    const stage = stageRef.current;
    if (!wrap || !stage) return;

    const size = () => {
      rendererRef.current?.resize(stage.clientWidth, stage.clientHeight, window.devicePixelRatio || 1);
    };
    const monoVar = getComputedStyle(document.documentElement).getPropertyValue("--font-dm-mono").trim();
    const fonts = { mono: monoVar ? `${monoVar}, ui-monospace, monospace` : "ui-monospace, monospace" };

    // Under reduced motion the sketch holds one telling frame rather than
    // cycling: the session inside the shell, being recorded.
    let step = reduced.current ? 4 : 0;
    const show = (k: number) => {
      rendererRef.current?.setVisual(0, resolve(ssh, TOUR.slice(0, k + 1)), performance.now());
      setAt(k);
    };

    let raf = 0;
    let visible = false;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const draw = (t: number) => {
      rendererRef.current?.frame(t, 0, reduced.current, fonts);
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
    createRenderer(RUNGS, [resolve(ssh, TOUR.slice(0, step + 1))]).then((r) => {
      if (disposed) { r.dispose(); return; }
      r.attach(stage);
      rendererRef.current = r;
      r.setActivity(activityOf(sessions24h));
      size();
      show(step);
      document.fonts?.ready.then(kick);
      kick();
    });
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
      clearTimeout(resizeTimer);
      io.disconnect();
      window.removeEventListener("resize", onResize);
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    rendererRef.current?.setActivity(activityOf(sessions24h));
  }, [sessions24h]);

  const step = ssh.steps[TOUR[at]];
  return (
    <div className="sketch" ref={wrapRef}>
      <div className="sketch-stage" ref={stageRef} aria-hidden="true" />
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
