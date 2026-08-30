"use client";

import { useEffect, useState } from "react";

import { WorldMap, type MapPoint } from "../charts";
import { Bars, Figures, Head, fmt } from "../ui";
import { CENTROIDS } from "@/lib/centroids";
import type { GeoSummary } from "@/lib/types";

export function Geography({ available }: { available: boolean }) {
  const [data, setData] = useState<GeoSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!available) return;

    let cancelled = false;
    fetch("/api/console/geo")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as GeoSummary;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });

    return () => {
      cancelled = true;
    };
  }, [available]);

  if (!available) {
    return (
      <>
        <section className="hero short">
          <div className="eyebrow">Geography</div>
          <h2>No attribution data on this host.</h2>
        </section>
        <p className="note">
          Country and network attribution comes from the pinned DB-IP Lite snapshots that ship with
          mirage-core at <span className="mono">data/geo/</span>. Point{" "}
          <span className="mono">MIRAGE_GEO_DIR</span> at that directory, or place the two CSVs
          beside this app, and this view fills in. The sensor itself stores no geo — see{" "}
          <span className="mono">docs/API-GAPS.md §3</span>.
        </p>
      </>
    );
  }

  if (error) {
    return (
      <>
        <section className="hero short">
          <div className="eyebrow">Geography</div>
          <h2>Attribution failed.</h2>
        </section>
        <p className="note">{error}</p>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <section className="hero short">
          <div className="eyebrow">Geography</div>
          <h2>Resolving addresses…</h2>
          <p>Streaming the DB-IP tables. This takes a moment on a cold cache.</p>
        </section>
      </>
    );
  }

  const points: MapPoint[] = data.countries
    .filter((c) => CENTROIDS[c.code])
    .map((c) => ({
      code: c.code,
      name: c.name,
      sessions: c.sessions,
      ips: c.ips,
      lat: CENTROIDS[c.code][0],
      lon: CENTROIDS[c.code][1],
    }));

  const totalSessions = data.countries.reduce((n, c) => n + c.sessions, 0);

  return (
    <>
      <section className="hero short">
        <div className="eyebrow">Geography</div>
        <h2>Where it comes from.</h2>
        <p>
          Country and network attribution for the addresses this sensor has seen, resolved against
          the pinned DB-IP Lite snapshots.
        </p>
      </section>

      <Figures
        items={[
          { k: "Countries", v: String(data.countries.length), n: "with at least one address" },
          { k: "Networks", v: String(data.asns.length), n: "top autonomous systems" },
          { k: "Addresses resolved", v: fmt(data.resolved), n: `${fmt(data.unresolved)} unresolved` },
          {
            k: "Top origin",
            v: data.countries[0]?.code ?? "—",
            n: data.countries[0]
              ? `${((data.countries[0].sessions / Math.max(totalSessions, 1)) * 100).toFixed(1)}% of sessions`
              : "",
          },
        ]}
      />

      <section className="block">
        <Head title="Origins" aside="area is sessions, per country centroid" />
        <WorldMap points={points} />
      </section>

      <section className="block split split-2">
        <div>
          <Head title="Countries" aside="sessions" />
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>Country</th>
                  <th className="num">Sessions</th>
                  <th className="num">Addresses</th>
                  <th className="num">Share</th>
                </tr>
              </thead>
              <tbody>
                {data.countries.slice(0, 15).map((c) => (
                  <tr key={c.code}>
                    <td className="k">
                      {c.name} <span className="mono" style={{ color: "var(--ink-4)" }}>{c.code}</span>
                    </td>
                    <td className="num">{fmt(c.sessions)}</td>
                    <td className="num">{fmt(c.ips)}</td>
                    <td className="num">
                      {((c.sessions / Math.max(totalSessions, 1)) * 100).toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <Head title="Networks" aside="sessions per autonomous system" />
          <Bars
            items={data.asns.slice(0, 10).map((a) => ({
              name: a.name ? `${a.name}` : `AS${a.asn}`,
              n: a.sessions,
              note: `AS${a.asn}`,
            }))}
          />
          <p className="note" style={{ marginTop: 20 }}>
            Hosting and transit networks dominate here rather than consumer ISPs, which is what a
            rented-infrastructure campaign looks like from the receiving end.
          </p>
        </div>
      </section>
    </>
  );
}
