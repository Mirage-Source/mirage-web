"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fill, resolve, type VisualState } from "@/lib/anatomy/engine.ts";
import { WorldRenderer } from "@/lib/anatomy/render.ts";
import { RUNGS } from "@/lib/anatomy/scenes/index.ts";
import type { LiveFacts } from "@/lib/anatomy/types.ts";
import { SiteHeader } from "@/components/SiteHeader";
import { Figures, fmt } from "@/components/ui";

// Scroll distance, in stage heights, spent on each rung: the first 55% holds
// the camera still while the reader plays, the rest travels to the next rung.
const PER_RUNG = 1.8;
const TAIL = 0.6;

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mql.matches);
    on();
    mql.addEventListener("change", on);
    return () => mql.removeEventListener("change", on);
  }, []);
  return reduced;
}

export function Anatomy({ facts, live }: { facts: LiveFacts | null; live: boolean }) {
  const reduced = useReducedMotion();
  const n = RUNGS.length;

  // One path per rung, each starting at its scene's root.
  const [paths, setPaths] = useState<string[][]>(() => RUNGS.map((r) => [r.scene.root]));
  const [rung, setRung] = useState(0);
  const [travelling, setTravelling] = useState(false);

  const worldRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctaRef = useRef<HTMLButtonElement>(null);
  const progressRef = useRef(0);
  const rendererRef = useRef<WorldRenderer | null>(null);
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  const visuals = useMemo<VisualState[]>(() => RUNGS.map((r, i) => resolve(r.scene, paths[i])), [paths]);

  if (!rendererRef.current) rendererRef.current = new WorldRenderer(RUNGS, visuals);

  // Feed the renderer on every path change; it diffs asset placement itself.
  const lastVisuals = useRef(visuals);
  useEffect(() => {
    if (lastVisuals.current === visuals) return;
    const now = performance.now();
    visuals.forEach((v, i) => {
      if (v !== lastVisuals.current[i]) rendererRef.current!.setVisual(i, v, now);
    });
    lastVisuals.current = visuals;
  }, [visuals]);

  // ── scroll → progress, rung, travelling ──
  useEffect(() => {
    const world = worldRef.current;
    const stage = stageRef.current;
    if (!world || !stage) return;
    let lastRung = -1;
    let lastTravel = false;
    const onScroll = () => {
      const vh = stage.clientHeight || window.innerHeight;
      const scrolled = -world.getBoundingClientRect().top;
      const p = Math.max(0, Math.min(n - 1, scrolled / (vh * PER_RUNG)));
      progressRef.current = p;
      const i = Math.min(n - 1, Math.floor(p));
      const frac = p - i;
      const r = Math.min(n - 1, Math.floor(p + 0.225));
      // Travel ends a little before the boundary so a scroll that lands a
      // fraction short of the next rung never counts as still travelling.
      const t = i < n - 1 && frac >= 0.55 && frac < 0.97;
      if (r !== lastRung) { lastRung = r; setRung(r); }
      if (t !== lastTravel) { lastTravel = t; setTravelling(t); }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [n]);

  // ── the frame loop ──
  useEffect(() => {
    const cv = canvasRef.current;
    const stage = stageRef.current;
    if (!cv || !stage) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

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

    let raf = 0;
    let visible = true;
    const draw = (t: number) => {
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      const out = rendererRef.current!.frame(ctx, W, H, t, progressRef.current, reducedRef.current, fonts);
      const cta = ctaRef.current;
      if (cta) {
        if (out.cta) {
          cta.style.transform = `translate(${out.cta.x.toFixed(1)}px, ${(out.cta.y - 52).toFixed(1)}px)`;
          cta.dataset.on = "true";
        } else cta.dataset.on = "false";
      }
    };
    const loop = (t: number) => {
      draw(t);
      // Under reduced motion nothing moves on its own, so one frame per
      // change is enough; scroll and clicks request their own frames.
      if (!reducedRef.current && visible) raf = requestAnimationFrame(loop);
      else raf = 0;
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };

    // Only spend frames while the stage is on screen.
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) kick();
    });
    io.observe(stage);

    let resizeTimer: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { size(); kick(); }, 120);
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", kick, { passive: true });
    const mo = new MutationObserver(kick);
    mo.observe(stage, { subtree: true, childList: true, characterData: true, attributes: true });
    document.fonts?.ready.then(kick);
    kick();

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(resizeTimer);
      io.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", kick);
    };
  }, []);

  const choose = useCallback((to: string) => {
    setPaths((ps) => ps.map((p, i) => (i === rung ? [...p, to] : p)));
  }, [rung]);
  const back = useCallback(() => {
    setPaths((ps) => ps.map((p, i) => (i === rung && p.length > 1 ? p.slice(0, -1) : p)));
  }, [rung]);
  const reset = useCallback(() => {
    setPaths((ps) => ps.map((p, i) => (i === rung ? [p[0]] : p)));
  }, [rung]);
  const goTo = useCallback((target: number) => {
    const world = worldRef.current, stage = stageRef.current;
    if (!world || !stage) return;
    const vh = stage.clientHeight || window.innerHeight;
    const top = world.getBoundingClientRect().top + window.scrollY + target * vh * PER_RUNG;
    window.scrollTo({ top, behavior: reducedRef.current ? "auto" : "smooth" });
  }, []);

  const { scene } = RUNGS[rung];
  const path = paths[rung];
  const step = scene.steps[path[path.length - 1]];
  const atRoot = path.length === 1;
  const terminal = step.choices.length === 0;
  const liveLine = step.live ? fill(step.live, facts) : null;
  const detail = step.detail ? fill(step.detail, facts) : null;

  return (
    <>
      <SiteHeader current="anatomy" live={live} />

      <main className="anatomy">
        <section className="hero">
          <div className="eyebrow">Anatomy of a sensor</div>
          <h1>Three surfaces, watched closely.</h1>
          <p>
            Honeypots are usually explained in definitions. This page explains them by letting you
            drive one. Below, the three Mirage sensors are laid out as small worlds: a fake SSH
            server, a fake website, and a tool server for AI agents. Pick what arrives, choose what
            it does, and watch what each sensor records and what it refuses to guess. Every step is
            the sensor&rsquo;s own mechanism, drawn rather than described.
          </p>
          <p className="anatomy-hint mono">scroll to begin · {n} levels</p>
        </section>

        <div
          className="anatomy-world"
          ref={worldRef}
          style={{ height: `calc(100svh + ${((n - 1) * PER_RUNG + TAIL) * 100}svh)` }}
        >
          <div className="anatomy-stage" ref={stageRef} data-travel={travelling}>
            <canvas ref={canvasRef} className="anatomy-canvas" aria-hidden="true" />

            <button
              ref={ctaRef}
              type="button"
              className="anatomy-cta"
              data-on="false"
              data-show={atRoot && !travelling}
              onClick={() => choose(step.choices[0].to)}
              tabIndex={atRoot && !travelling ? 0 : -1}
            >
              {scene.cta}
            </button>

            <aside className="anatomy-panel" aria-live="polite">
              <div className="anatomy-eyebrow">
                <span>{scene.eyebrow}</span>
                <span className="mono">{rung + 1} / {n}</span>
              </div>
              {atRoot ? (
                <>
                  <h2>{scene.title}</h2>
                  <p className="anatomy-caption">{scene.intro}</p>
                  <p className="anatomy-detail mono">{step.caption}</p>
                </>
              ) : (
                <>
                  <h2>{step.title}</h2>
                  <p className="anatomy-caption">{step.caption}</p>
                  {detail && <p className="anatomy-detail mono">{detail}</p>}
                  {step.live && (
                    <p className="anatomy-live mono" data-missing={liveLine === null}>
                      {liveLine ?? "live sensor figures are not available right now, so none are shown here"}
                    </p>
                  )}
                  {terminal && <p className="anatomy-lesson">{step.lesson}</p>}
                </>
              )}

              <div className="anatomy-actions">
                {!atRoot &&
                  step.choices.map((c) => (
                    <button key={c.to} type="button" className="anatomy-choice" onClick={() => choose(c.to)}>
                      {c.label}
                    </button>
                  ))}
                {terminal && rung < n - 1 && (
                  <button type="button" className="anatomy-choice" onClick={() => goTo(rung + 1)}>
                    Next level ↓
                  </button>
                )}
              </div>
              {!atRoot && (
                <div className="anatomy-nav mono">
                  <button type="button" onClick={back}>← back</button>
                  <button type="button" onClick={reset}>start over</button>
                  <span>step {path.length - 1}</span>
                </div>
              )}
              {atRoot && (
                <p className="anatomy-nav mono">
                  <span>press the button on the sensor{rung < n - 1 ? ", or scroll to the next one" : ""}</span>
                </p>
              )}
            </aside>
          </div>
        </div>

        <section className="block" id="measured">
          <h2 className="anatomy-h2">The SSH sensor, measured</h2>
          <p className="note">
            Of the three, the SSH sensor is the one wired to this dashboard today. These are its live
            figures; the HTTP and MCP sensors keep their own logs until the fleet read path exists.
          </p>
          {facts ? (
            <Figures
              items={[
                { k: "Knocks, last 24h", v: fmt(facts.sessions_24h), n: "sessions" },
                { k: "Knocks, last 7d", v: fmt(facts.sessions_7d), n: "sessions" },
                { k: "Distinct addresses", v: fmt(facts.unique_ips), n: "all time" },
                {
                  k: "Reached a shell",
                  v: facts.shell_reached === null ? "—" : fmt(facts.shell_reached),
                  n: facts.shell_reached === null ? "no accept-rate series yet" : "of all sessions",
                },
              ]}
            />
          ) : (
            <p className="empty">The live sensor could not be reached, so no figures are shown.</p>
          )}
          <div className="tags" style={{ marginTop: 22 }}>
            <Link className="tag" href="/">all findings</Link>
            <Link className="tag" href="/#validity">why believe any of this</Link>
            <Link className="tag" href="/#dataset">the dataset</Link>
          </div>
        </section>

        <div className="foot">
          <span>every path above is drawn from public incident reporting; nothing here is a procedure</span>
          <span>deployed only on infrastructure we own</span>
          <a href="https://github.com/Mirage-Source/mirage-core" target="_blank" rel="noreferrer">mirage-core</a>
        </div>
      </main>
    </>
  );
}
