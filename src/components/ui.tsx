"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export const fmt = (n: number) => n.toLocaleString("en-US");

export const words = (s: string) => s.replace(/_/g, " ");

export function duration(ms: number | null): string {
  if (ms === null) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `0m ${String(s).padStart(2, "0")}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

export function stamp(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(
    d.getUTCMinutes(),
  )}:${p(d.getUTCSeconds())}`;
}

const LEVEL: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };

export function Sev({ level, label = true }: { level: string | null; label?: boolean }) {
  const n = LEVEL[level ?? ""] ?? 0;
  return (
    <>
      <span className="sev" role="img" aria-label={`severity ${level ?? "unknown"}`}>
        {[1, 2, 3, 4].map((i) => (
          <i key={i} data-off={i > n} />
        ))}
      </span>
      {label && <span className="sev-label">{level ?? "unrated"}</span>}
    </>
  );
}

export interface BarItem {
  name: string;
  n: number;
  note?: string;
}

export function Bars({ items, unit }: { items: BarItem[]; unit?: "pct" }) {
  const max = Math.max(...items.map((i) => i.n), 1);
  return (
    <div className="bars">
      {items.map((i) => (
        <div className="bar-row" key={i.name}>
          <span className="l" title={i.name}>
            {i.name}
            {i.note ? <em> {i.note}</em> : null}
          </span>
          <span className="n">{unit === "pct" ? `${i.n.toFixed(1)}%` : fmt(i.n)}</span>
          <span className="t">
            <i style={{ width: `${((i.n / max) * 100).toFixed(1)}%` }} />
          </span>
        </div>
      ))}
    </div>
  );
}

export interface FigureSpec {
  k: string;
  v: string;
  n?: string;
  small?: boolean;
}

export function Figures({ items }: { items: FigureSpec[] }) {
  return (
    <div className="figures">
      {items.map((f) => (
        <div className="figure" key={f.k}>
          <div className="k">{f.k}</div>
          <div className={f.small ? "v small" : "v"}>{f.v}</div>
          {f.n ? <div className="n">{f.n}</div> : null}
        </div>
      ))}
    </div>
  );
}

export function Head({
  title,
  aside,
  tight,
}: {
  title: string;
  aside?: React.ReactNode;
  tight?: boolean;
}) {
  return (
    <div className={tight ? "block-head tight" : "block-head"}>
      <h3>{title}</h3>
      {aside ? <span className="aside">{aside}</span> : null}
    </div>
  );
}

const ToastCtx = createContext<(msg: string) => void>(() => {});

export const useToast = () => useContext(ToastCtx);

export function ToastHost({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState("");
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const push = useCallback((m: string) => {
    setMsg(m);
    setShow(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setShow(false), 2600);
  }, []);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast" data-show={show} role="status" aria-live="polite">
        {msg}
      </div>
    </ToastCtx.Provider>
  );
}

export function Clock() {
  const [now, setNow] = useState<string>("--:--:--");

  useEffect(() => {
    const tick = () => setNow(new Date().toISOString().slice(11, 19) + "Z");
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return <>{now}</>;
}
