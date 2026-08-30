"use client";

import { useRef, useState } from "react";

import { fmt } from "./ui";

interface Tip {
  x: number;
  y: number;
  text: string;
}

function useTip() {
  const [tip, setTip] = useState<Tip | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  const move = (e: React.MouseEvent, text: string | null) => {
    if (!text || !wrap.current) return setTip(null);
    const box = wrap.current.getBoundingClientRect();
    setTip({ x: e.clientX - box.left, y: e.clientY - box.top, text });
  };

  return { tip, wrap, move, clear: () => setTip(null) };
}

function TipBox({ tip }: { tip: Tip | null }) {
  return (
    <div
      className="tip"
      data-show={tip !== null}
      style={tip ? { left: tip.x, top: tip.y } : undefined}
    >
      {tip?.text ?? ""}
    </div>
  );
}

export function HourlyChart({ data }: { data: { hour: number; count: number }[] }) {
  const { tip, wrap, move, clear } = useTip();

  const VW = 900;
  const VH = 140;
  const pad = { t: 6, r: 0, b: 20, l: 34 };
  const iw = VW - pad.l - pad.r;
  const ih = VH - pad.t - pad.b;
  const max = Math.max(...data.map((d) => d.count), 1) * 1.1;
  const bw = iw / Math.max(data.length, 1);

  return (
    <div className="chart-wrap" ref={wrap} onMouseLeave={clear}>
      <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none" style={{ height: 140 }}>
        {[0, 1, 2].map((i) => {
          const y = pad.t + ih * (i / 2);
          return (
            <g key={i}>
              <line className="gl" x1={pad.l} y1={y} x2={VW} y2={y} />
              <text className="tk" x={pad.l - 8} y={y + 3} textAnchor="end">
                {((max * (1 - i / 2)) / 1000).toFixed(1)}k
              </text>
            </g>
          );
        })}

        {data.map((d, i) => {
          const h = (d.count / max) * ih;
          const w = Math.max(bw * 0.42, 2);
          return (
            <rect
              key={d.hour}
              className="bar-m"
              x={pad.l + i * bw + (bw - w) / 2}
              y={pad.t + ih - h}
              width={w}
              height={h}
            />
          );
        })}

        {data.map((d, i) => (
          <rect
            key={`hit-${d.hour}`}
            x={pad.l + i * bw}
            y={pad.t}
            width={bw}
            height={ih}
            fill="transparent"
            onMouseMove={(e) =>
              move(e, `${String(d.hour).padStart(2, "0")}:00 · ${fmt(d.count)}`)
            }
          />
        ))}

        <line className="al" x1={pad.l} y1={pad.t + ih} x2={VW} y2={pad.t + ih} />

        {[0, 6, 12, 18, 23].map((i) => (
          <text
            key={i}
            className="tk"
            x={pad.l + i * bw + bw / 2}
            y={VH - 5}
            textAnchor="middle"
          >
            {String(i).padStart(2, "0")}
          </text>
        ))}
      </svg>
      <TipBox tip={tip} />
    </div>
  );
}

export interface RatePoint {
  date: string;
  rate: number;
  flagged: boolean;
  n?: number;
}

export function RateChart({ data }: { data: RatePoint[] }) {
  const { tip, wrap, move, clear } = useTip();

  if (data.length < 2) {
    return <div className="empty">Not enough days yet to draw a band.</div>;
  }

  const VW = 900;
  const VH = 180;
  const pad = { t: 12, r: 10, b: 24, l: 40 };
  const iw = VW - pad.l - pad.r;
  const ih = VH - pad.t - pad.b;

  const peak = Math.max(...data.map((d) => d.rate));
  const max = Math.max(peak * 1.15, 0.04);

  const X = (i: number) => pad.l + (i / (data.length - 1)) * iw;
  const Y = (v: number) => pad.t + ih - (v / max) * ih;

  const calm = data.filter((d) => !d.flagged).map((d) => d.rate);
  const mean = calm.reduce((a, b) => a + b, 0) / Math.max(calm.length, 1);
  const sd = Math.sqrt(
    calm.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(calm.length - 1, 1),
  );

  const bandTop = Y(mean + 3 * sd);
  const bandBottom = Y(mean - 3 * sd);
  const flaggedIndex = data.findIndex((d) => d.flagged);
  const ticks = [0, Math.floor(data.length / 4), Math.floor(data.length / 2),
    Math.floor((data.length * 3) / 4), data.length - 1];

  return (
    <div className="chart-wrap" ref={wrap} onMouseLeave={clear}>
      <svg viewBox={`0 0 ${VW} ${VH}`} style={{ height: 180 }}>
        {[0, 1, 2].map((i) => {
          const y = pad.t + ih * (i / 2);
          return (
            <g key={i}>
              <line className="gl" x1={pad.l} y1={y} x2={VW - pad.r} y2={y} />
              <text className="tk" x={pad.l - 8} y={y + 3} textAnchor="end">
                {(max * (1 - i / 2) * 100).toFixed(1)}%
              </text>
            </g>
          );
        })}

        <rect
          className="bnd"
          x={pad.l}
          y={bandTop}
          width={iw}
          height={Math.max(bandBottom - bandTop, 1)}
        />
        <line
          className="gl"
          x1={pad.l}
          y1={Y(mean)}
          x2={VW - pad.r}
          y2={Y(mean)}
          strokeDasharray="2 4"
        />
        <text className="tk" x={VW - pad.r} y={bandTop - 6} textAnchor="end">
          trailing band · 3σ
        </text>

        <polyline
          className="ln"
          points={data.map((d, i) => `${X(i).toFixed(1)},${Y(d.rate).toFixed(1)}`).join(" ")}
        />

        {data.map((d, i) =>
          d.flagged ? (
            <circle key={d.date} className="pt" cx={X(i)} cy={Y(d.rate)} r={4} />
          ) : i === data.length - 1 ? (
            <circle key={d.date} className="pt hollow" cx={X(i)} cy={Y(d.rate)} r={3.5} />
          ) : null,
        )}

        {flaggedIndex >= 0 && (
          <text
            className="tk"
            x={X(flaggedIndex) + 9}
            y={Y(data[flaggedIndex].rate) + 3}
            fill="#fff"
          >
            {(data[flaggedIndex].rate * 100).toFixed(2)}% — outside the band
          </text>
        )}

        <line className="al" x1={pad.l} y1={pad.t + ih} x2={VW - pad.r} y2={pad.t + ih} />

        {ticks.map((i) => (
          <text key={i} className="tk" x={X(i)} y={VH - 5} textAnchor="middle">
            {data[i].date.slice(5)}
          </text>
        ))}

        {data.map((d, i) => (
          <rect
            key={`hit-${d.date}`}
            x={X(i) - iw / data.length / 2}
            y={pad.t}
            width={iw / data.length}
            height={ih}
            fill="transparent"
            onMouseMove={(e) =>
              move(
                e,
                `${d.date} · ${(d.rate * 100).toFixed(2)}%${d.n ? ` · n=${fmt(d.n)}` : ""}`,
              )
            }
          />
        ))}
      </svg>
      <TipBox tip={tip} />
    </div>
  );
}

export interface MapPoint {
  code: string;
  name: string;
  sessions: number;
  ips: number;
  lat: number;
  lon: number;
}

export function WorldMap({ points }: { points: MapPoint[] }) {
  const { tip, wrap, move, clear } = useTip();

  const VW = 720;
  const VH = 360;
  const max = Math.max(...points.map((p) => p.sessions), 1);

  const X = (lon: number) => ((lon + 180) / 360) * VW;
  const Y = (lat: number) => ((90 - lat) / 180) * VH;
  const R = (n: number) => 2 + Math.sqrt(n / max) * 13;

  const meridians = [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150];
  const parallels = [-60, -30, 0, 30, 60];

  return (
    <div className="chart-wrap map" ref={wrap} onMouseLeave={clear}>
      <svg viewBox={`0 0 ${VW} ${VH}`} style={{ height: "auto", aspectRatio: "2 / 1" }}>
        <rect x="0" y="0" width={VW} height={VH} fill="rgba(255,255,255,0.02)" />

        {meridians.map((lon) => (
          <line key={`m${lon}`} className="gl" x1={X(lon)} y1={0} x2={X(lon)} y2={VH} />
        ))}
        {parallels.map((lat) => (
          <line key={`p${lat}`} className="gl" x1={0} y1={Y(lat)} x2={VW} y2={Y(lat)} />
        ))}
        <line className="al" x1={0} y1={Y(0)} x2={VW} y2={Y(0)} />

        {points.map((p) => (
          <circle
            key={p.code}
            className="dot"
            cx={X(p.lon)}
            cy={Y(p.lat)}
            r={R(p.sessions)}
            onMouseMove={(e) =>
              move(e, `${p.name} · ${fmt(p.sessions)} sessions · ${fmt(p.ips)} addresses`)
            }
          />
        ))}

        {points.slice(0, 6).map((p) => (
          <text
            key={`l${p.code}`}
            className="tk"
            x={X(p.lon) + R(p.sessions) + 4}
            y={Y(p.lat) + 3}
            fill="rgba(255,255,255,0.72)"
          >
            {p.code}
          </text>
        ))}
      </svg>
      <TipBox tip={tip} />
    </div>
  );
}

export function DelayPlot({ delays }: { delays: number[] }) {
  const { tip, wrap, move, clear } = useTip();

  if (delays.length === 0) {
    return <div className="empty">No inter-command timing — fewer than two commands.</div>;
  }

  const VW = 400;
  const VH = 90;
  const pad = { t: 8, r: 4, b: 16, l: 4 };
  const iw = VW - pad.l - pad.r;
  const ih = VH - pad.t - pad.b;

  const max = Math.max(...delays, 1);
  const scale = (v: number) => Math.log10(1 + v) / Math.log10(1 + max);
  const bw = iw / delays.length;

  const human = ih - scale(1000) * ih + pad.t;

  return (
    <div className="chart-wrap" ref={wrap} onMouseLeave={clear}>
      <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none" style={{ height: 90 }}>
        <line className="gl" x1={pad.l} y1={human} x2={VW - pad.r} y2={human} strokeDasharray="2 4" />
        <text className="tk" x={VW - pad.r} y={human - 4} textAnchor="end">
          1s
        </text>

        {delays.map((d, i) => {
          const h = scale(d) * ih;
          const w = Math.max(bw * 0.5, 1.5);
          return (
            <rect
              key={i}
              className="bar-m"
              x={pad.l + i * bw + (bw - w) / 2}
              y={pad.t + ih - h}
              width={w}
              height={Math.max(h, 1)}
            />
          );
        })}

        {delays.map((d, i) => (
          <rect
            key={`h${i}`}
            x={pad.l + i * bw}
            y={pad.t}
            width={bw}
            height={ih}
            fill="transparent"
            onMouseMove={(e) =>
              move(e, `#${i + 1} · ${d < 1000 ? `${d}ms` : `${(d / 1000).toFixed(1)}s`}`)
            }
          />
        ))}

        <line className="al" x1={pad.l} y1={pad.t + ih} x2={VW - pad.r} y2={pad.t + ih} />
      </svg>
      <TipBox tip={tip} />
    </div>
  );
}
