"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fill, resolve, type VisualState } from "@/lib/anatomy/engine.ts";
import { createRenderer, type Renderer } from "@/lib/anatomy/renderer.ts";
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
  const viewRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(0);
  const rungRef = useRef(0);
  const visibleRef = useRef(false);
  const rendererRef = useRef<Renderer | null>(null);
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  const visuals = useMemo<VisualState[]>(() => RUNGS.map((r, i) => resolve(r.scene, paths[i])), [paths]);

  // Feed the renderer on every path change; it diffs asset placement itself.
  // The renderer arrives asynchronously (its chunk loads on demand), so the
  // latest visuals are kept where its creation can read them.
  const visualsRef = useRef(visuals);
  const lastVisuals = useRef(visuals);
  useEffect(() => {
    visualsRef.current = visuals;
    if (lastVisuals.current === visuals) return;
    const now = performance.now();
    const r = rendererRef.current;
    if (r) visuals.forEach((v, i) => { if (v !== lastVisuals.current[i]) r.setVisual(i, v, now); });
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
      if (r !== lastRung) {
        lastRung = r;
        rungRef.current = r;
        setRung(r);
        rendererRef.current?.setFocus(null);
      }
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
    const view = viewRef.current;
    const stage = stageRef.current;
    if (!view || !stage) return;

    const size = () => {
      rendererRef.current?.resize(stage.clientWidth, stage.clientHeight, window.devicePixelRatio || 1);
    };

    const monoVar = getComputedStyle(document.documentElement).getPropertyValue("--font-dm-mono").trim();
    const fonts = { mono: monoVar ? `${monoVar}, ui-monospace, monospace` : "ui-monospace, monospace" };

    let raf = 0;
    let visible = true;
    let disposed = false;
    const draw = (t: number) => {
      const r = rendererRef.current;
      if (!r) return;
      const out = r.frame(t, progressRef.current, reducedRef.current, fonts);
      const cta = ctaRef.current;
      if (cta) {
        if (out.cta) {
          cta.style.transform = `translate(${out.cta.x.toFixed(1)}px, ${(out.cta.y - 52).toFixed(1)}px)`;
          cta.dataset.on = "true";
        } else cta.dataset.on = "false";
      }
      const tip = tipRef.current;
      if (tip) {
        if (out.hover) {
          tip.style.transform = `translate(${out.hover.x.toFixed(1)}px, ${out.hover.y.toFixed(1)}px)`;
          tip.dataset.on = "true";
          const [l, b] = [tip.firstElementChild as HTMLElement, tip.lastElementChild as HTMLElement];
          if (l.textContent !== out.hover.label) l.textContent = out.hover.label;
          if (b.textContent !== out.hover.blurb) b.textContent = out.hover.blurb;
        } else tip.dataset.on = "false";
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

    createRenderer(RUNGS, visualsRef.current).then((r) => {
      if (disposed) { r.dispose(); return; }
      r.attach(view);
      rendererRef.current = r;
      lastVisuals.current = visualsRef.current;
      size();
      kick();
    });

    // Only spend frames while the stage is on screen.
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      visibleRef.current = visible;
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
      disposed = true;
      cancelAnimationFrame(raf);
      clearTimeout(resizeTimer);
      io.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", kick);
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, []);

  const choose = useCallback((to: string) => {
    rendererRef.current?.setFocus(null);
    rendererRef.current?.setPreview([]);
    setPaths((ps) => ps.map((p, i) => (i === rung ? [...p, to] : p)));
  }, [rung]);

  // Hovering a choice rings the objects that step would light up.
  const previewChoice = useCallback((to: string | null) => {
    const r = rendererRef.current;
    if (!r) return;
    if (!to) return r.setPreview([]);
    const { scene } = RUNGS[rung];
    const step = scene.steps[to];
    const keys = new Set<string>();
    for (const e of step.effects) {
      if (e.type === "state" && e.state === "hot") keys.add(`${rung}:${e.node}`);
      if (e.type === "flow") { keys.add(`${rung}:${e.from}`); keys.add(`${rung}:${e.to}`); }
      if (e.type === "camera") keys.add(`${rung}:${e.look}`);
    }
    r.setPreview(keys);
  }, [rung]);

  // ── pointer: drag to orbit, hover to name, click to turn toward ──
  const drag = useRef<{ x: number; y: number; moved: boolean; id: number } | null>(null);
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if ((e.target as HTMLElement).closest("button, a, aside")) return;
    drag.current = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId };
  }, []);
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const r = rendererRef.current;
    const stage = stageRef.current;
    if (!r || !stage) return;
    const box = stage.getBoundingClientRect();
    const d = drag.current;
    if (d && d.id === e.pointerId) {
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) > 4) {
        d.moved = true;
        r.setDragging(true);
        stage.setPointerCapture(e.pointerId);
        stage.dataset.dragging = "true";
      }
      if (d.moved) {
        r.nudgeOrbit(-dx * 0.0045, dy * 0.0035);
        d.x = e.clientX;
        d.y = e.clientY;
      }
      return;
    }
    if (e.pointerType !== "mouse") return;
    const key = r.hitTest(e.clientX - box.left, e.clientY - box.top);
    r.setHover(key);
    stage.dataset.hover = String(key !== null);
  }, []);
  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const r = rendererRef.current;
    const stage = stageRef.current;
    const d = drag.current;
    drag.current = null;
    if (!r || !stage) return;
    r.setDragging(false);
    stage.dataset.dragging = "false";
    if (d && !d.moved && e.type === "pointerup") {
      const box = stage.getBoundingClientRect();
      const key = r.hitTest(e.clientX - box.left, e.clientY - box.top);
      r.setFocus(key && key !== r.getFocus() ? key : null);
    }
  }, []);
  const onPointerLeave = useCallback(() => {
    rendererRef.current?.setHover(null);
    if (stageRef.current) stageRef.current.dataset.hover = "false";
  }, []);

  // ── keyboard: digits choose, Backspace goes back, Escape lets go ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!visibleRef.current) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "Escape") { rendererRef.current?.setFocus(null); return; }
      const stage = stageRef.current;
      if (!stage) return;
      if (e.key === "Backspace") {
        const b = stage.querySelector<HTMLButtonElement>(".anatomy-nav button");
        if (b) { e.preventDefault(); b.click(); }
        return;
      }
      if (/^[1-9]$/.test(e.key)) {
        const n = Number(e.key) - 1;
        const buttons = stage.querySelectorAll<HTMLButtonElement>(".anatomy-cta[data-show='true'], .anatomy-choice");
        const b = buttons[n];
        if (b) { e.preventDefault(); b.click(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
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
          <div
            className="anatomy-stage"
            ref={stageRef}
            data-travel={travelling}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onPointerLeave={onPointerLeave}
          >
            <div ref={viewRef} className="anatomy-view" aria-hidden="true" />
            <div className="anatomy-tip" ref={tipRef} data-on="false" aria-hidden="true">
              <span className="anatomy-tip-label" />
              <span className="anatomy-tip-blurb" />
            </div>

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
                    <button
                      key={c.to}
                      type="button"
                      className="anatomy-choice"
                      onClick={() => choose(c.to)}
                      onMouseEnter={() => previewChoice(c.to)}
                      onMouseLeave={() => previewChoice(null)}
                      onFocus={() => previewChoice(c.to)}
                      onBlur={() => previewChoice(null)}
                    >
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
                  <span>
                    press the button on the sensor · drag to look around · hover anything to learn what it is
                    {rung < n - 1 ? " · scroll for the next sensor" : ""}
                  </span>
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
