"use client";

import { useEffect, useState } from "react";

import { Figures, Head, fmt, stamp, words } from "../ui";
import type { ClusterSummary } from "@/lib/types";

export function Clusters({ onOpen }: { onOpen: (id: string) => void }) {
  const [rows, setRows] = useState<ClusterSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/console/clusters")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as { clusters: ClusterSummary[] };
      })
      .then((d) => {
        if (!cancelled) setRows(d.clusters);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <>
        <section className="hero short">
          <div className="eyebrow">Clusters</div>
          <h2>Could not group the corpus.</h2>
        </section>
        <p className="note">{error}</p>
      </>
    );
  }

  if (!rows) {
    return (
      <section className="hero short">
        <div className="eyebrow">Clusters</div>
        <h2>Grouping…</h2>
      </section>
    );
  }

  const sessions = rows.reduce((n, c) => n + c.sessions, 0);
  const addresses = rows.reduce((n, c) => n + c.unique_ips, 0);
  const multi = rows.filter((c) => c.unique_ips > 1);

  return (
    <>
      <section className="hero short">
        <div className="eyebrow">Clusters</div>
        <h2>The same hand, behind many addresses.</h2>
        <p>
          Sessions grouped by the cluster the enrichment pipeline assigned them. A cluster spanning
          many addresses is one operator or one botnet, not many attackers.
        </p>
      </section>

      <Figures
        items={[
          { k: "Clusters", v: String(rows.length), n: `${multi.length} span >1 address` },
          { k: "Sessions clustered", v: fmt(sessions), n: "of the corpus" },
          { k: "Addresses", v: fmt(addresses), n: "across all clusters" },
          {
            k: "Largest",
            v: rows[0]?.cluster_id ?? "—",
            n: rows[0] ? `${fmt(rows[0].sessions)} sessions` : "",
            small: true,
          },
        ]}
      />

      <section className="block">
        <Head title="All clusters" aside="select one to filter the session explorer" />
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th>Cluster</th>
                <th className="num">Sessions</th>
                <th className="num">Addresses</th>
                <th>Dominant class</th>
                <th>Banner</th>
                <th>Top username</th>
                <th className="num">Cmds</th>
                <th className="num">Bait</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr
                  key={c.cluster_id}
                  className="row"
                  tabIndex={0}
                  onClick={() => onOpen(c.cluster_id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onOpen(c.cluster_id);
                    }
                  }}
                >
                  <td className="k mono">{c.cluster_id}</td>
                  <td className="num">{fmt(c.sessions)}</td>
                  <td className="num">{fmt(c.unique_ips)}</td>
                  <td>{c.dominant_class ? words(c.dominant_class) : "—"}</td>
                  <td className="mono" style={{ fontSize: 11.5 }}>
                    {c.dominant_banner?.replace(/^SSH-2\.0-/, "") ?? "—"}
                  </td>
                  <td className="mono">{c.top_username ?? "—"}</td>
                  <td className="num">{fmt(c.commands)}</td>
                  <td className="num" style={c.bait_hits ? undefined : { color: "var(--ink-4)" }}>
                    {c.bait_hits}
                  </td>
                  <td className="mono" style={{ fontSize: 11.5 }}>
                    {stamp(c.last_seen_ms)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="block">
        <Head title="Address spread" aside="prefixes per multi-address cluster" />
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th>Cluster</th>
                <th className="num">Addresses</th>
                <th>Prefixes</th>
              </tr>
            </thead>
            <tbody>
              {multi.slice(0, 12).map((c) => (
                <tr key={c.cluster_id}>
                  <td className="k mono">{c.cluster_id}</td>
                  <td className="num">{c.unique_ips}</td>
                  <td className="mono" style={{ fontSize: 11.5 }}>
                    {c.prefixes.join("  ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note" style={{ marginTop: 20 }}>
          Cluster identity comes from the sensor&rsquo;s enrichment pipeline. The re-identification
          model in <span className="mono">ml/mirage/reid/</span> can do considerably better than
          this, but exposes nothing over HTTP yet — see{" "}
          <span className="mono">docs/API-GAPS.md §6</span>.
        </p>
      </section>
    </>
  );
}
