"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { HourlyChart, RateChart, WorldMap, type MapPoint } from "./charts";
import { Bars, Figures, Head, fmt, stamp } from "./ui";
import { CENTROIDS } from "@/lib/centroids";
import type { PublicGeo, PublicStats, PublicValidity } from "@/lib/sanitise";

export function PublicView({
  stats,
  validity,
  live,
}: {
  stats: PublicStats;
  validity: PublicValidity;
  live: boolean;
}) {
  const [geo, setGeo] = useState<PublicGeo | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/geo")
      .then((r) => (r.ok ? r.json() : null))
      .then((g: PublicGeo | null) => {
        if (!cancelled && g && g.countries.length > 0) setGeo(g);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const bannerTotal = stats.ssh_banners.reduce((n, b) => n + b.count, 0) || 1;
  const drop = validity.aggregate_all.zero_command_pct - validity.aggregate_excluding.zero_command_pct;

  return (
    <>
      <header className="top">
        <span className="wordmark">MIRAGE</span>
        <nav className="tabs" aria-label="Sections">
          <a href="#findings">Findings</a>
          <a href="#origins">Origins</a>
          <a href="#validity">Validity</a>
          <a href="#dataset">Dataset</a>
        </nav>
        <span className="status">
          <span className="beacon" data-live={live} />
          {live ? "live sensor" : "published snapshot"}
        </span>
      </header>

      <main>
        <section className="hero">
          <div className="eyebrow">SSH honeypot · threat intelligence · {validity.sensor}</div>
          <h1>An SSH server that isn&rsquo;t there, watched closely.</h1>
          <p>
            MIRAGE runs a convincing fake SSH server on infrastructure we own, and records what
            arrives: every credential attempt, every keystroke that follows a successful one, and
            every reach for a file that was left out to be reached for.
          </p>
        </section>

        <Figures
          items={[
            {
              k: "Sessions captured",
              v: fmt(stats.total_sessions),
              n: `+${fmt(stats.sessions_last_24h)} / 24h`,
            },
            {
              k: "Source addresses",
              v: fmt(stats.unique_ips),
              n: `${fmt(stats.sessions_last_7d)} sessions / 7d`,
            },
            {
              k: "Reached the shell",
              v: stats.shell_reached === null ? "—" : fmt(stats.shell_reached),
              n:
                stats.accept_rate === null
                  ? "no accept-rate series yet"
                  : `${(stats.accept_rate * 100).toFixed(2)}% of sessions`,
            },
            {
              k: "Coordinated windows",
              v: String(stats.coordinated_total),
              n: "distinct campaigns",
            },
          ]}
        />

        <section className="block" id="findings">
          <Head title="Arrival rhythm" aside="sessions per hour, UTC" />
          <HourlyChart data={stats.hourly_distribution} />
          <p className="note" style={{ marginTop: 20 }}>
            Automated traffic does not sleep, but it does breathe. Where the arrival count moves
            with the clock it is a property of the botnets&rsquo; own scheduling rather than of
            anyone&rsquo;s office hours — the sensor is reachable from everywhere at every hour,
            so a flat distribution and a peaked one are both findings.
          </p>
        </section>

        <section className="block split split-2">
          <div>
            <Head title="Usernames tried" aside="attempts" />
            <Bars
              items={stats.top_usernames.map((u) => ({ name: u.username, n: u.count }))}
            />
            <p className="note" style={{ marginTop: 20 }}>
              Passwords are recorded but not published here. They are in the dataset release,
              where they belong to a corpus rather than to a live target.
            </p>
          </div>
          <div>
            <Head title="Clients announced" aside="share of sessions" />
            <Bars
              unit="pct"
              items={stats.ssh_banners.map((b) => ({
                name: b.banner,
                n: (b.count / bannerTotal) * 100,
              }))}
            />
            <p className="note" style={{ marginTop: 20 }}>
              A banner is self-reported and trivially forged, which is exactly what makes a
              shared one across many addresses in one window worth noticing.
            </p>
          </div>
        </section>

        <section className="block">
          <Head
            title="Coordinated windows"
            aside="one credential, one banner, five minutes, many addresses"
          />
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>Username</th>
                  <th className="num">Addresses</th>
                  <th>Prefixes</th>
                  <th>Window opened</th>
                </tr>
              </thead>
              <tbody>
                {stats.coordinated.map((g) => (
                  <tr key={`${g.username}-${g.window_start_ms}`}>
                    <td className="k mono">{g.username}</td>
                    <td className="num">{g.addresses}</td>
                    <td className="mono" style={{ fontSize: 11.5 }}>
                      {g.prefixes.slice(0, 3).join("  ")}
                      {g.prefixes.length > 3 ? " …" : ""}
                    </td>
                    <td className="mono" style={{ fontSize: 11.5 }}>
                      {stamp(g.window_start_ms)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note" style={{ marginTop: 20 }}>
            Distinct addresses presenting the same credential and the same client banner inside a
            five-minute window. Source addresses are shown as prefixes only.
          </p>
        </section>


        {geo && (
          <section className="block" id="origins">
            <Head title="Where it comes from" aside="country attribution, aggregate only" />
            <WorldMap
              points={
                geo.countries
                  .filter((c) => CENTROIDS[c.code])
                  .map((c) => ({
                    code: c.code,
                    name: c.name,
                    sessions: c.sessions,
                    ips: c.ips,
                    lat: CENTROIDS[c.code][0],
                    lon: CENTROIDS[c.code][1],
                  })) as MapPoint[]
              }
            />
            <div className="split split-2" style={{ marginTop: 34 }}>
              <div>
                <Head title="Countries" aside="sessions" />
                <Bars
                  items={geo.countries.slice(0, 8).map((c) => ({ name: c.name, n: c.sessions }))}
                />
              </div>
              <div>
                <Head title="Networks" aside="autonomous systems" />
                <Bars
                  items={geo.asns.map((a) => ({
                    name: a.name ?? `AS${a.asn}`,
                    n: a.sessions,
                    note: `AS${a.asn}`,
                  }))}
                />
                <p className="note" style={{ marginTop: 20 }}>
                  Attribution is to the network an address is routed through, not to whoever is
                  sitting behind it. Individual addresses are never published here.
                </p>
              </div>
            </div>
          </section>
        )}

        <section className="block" id="validity">
          <Head title="Why believe any of this" aside="four standing checks" />
          <p className="note">
            Honeypot corpora fail quietly. A sensor goes down and reads as an absence of
            attackers; one campaign floods the corpus and its shape is reported as everyone&rsquo;s
            behaviour. MIRAGE runs the audit from the preprint continuously, against itself.
          </p>

          <Figures
            items={[
              {
                k: "Accept-rate drift",
                v: String(validity.flagged_days),
                n: `flagged / ${validity.accept_rate.length} days`,
              },
              {
                k: "Fields still varying",
                v: `${validity.fields_varying}/${validity.fields_total}`,
                n: "no silent collapse",
              },
              {
                k: "Campaign sessions",
                v: fmt(validity.campaign_sessions),
                n: "reported separately",
              },
              {
                k: "Heartbeat gaps",
                v: String(validity.heartbeat_gaps),
                n: "downtime, not silence",
              },
            ]}
          />

          <div style={{ marginTop: 34 }}>
            <Head title="Accept-rate band drift" aside="daily rate against its trailing band" />
            <RateChart data={validity.accept_rate} />
          </div>

          <div className="split split-2" style={{ marginTop: 34 }}>
            <div>
              <Head title="Campaign against aggregate" />
              <div className="scroll-x">
                <table>
                  <thead>
                    <tr>
                      <th />
                      <th className="num">Sessions</th>
                      <th className="num">Zero-command %</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="k">All sessions</td>
                      <td className="num">{fmt(validity.aggregate_all.total_sessions)}</td>
                      <td className="num">
                        {validity.aggregate_all.zero_command_pct.toFixed(2)}
                      </td>
                    </tr>
                    <tr>
                      <td className="k">Campaign excluded</td>
                      <td className="num">{fmt(validity.aggregate_excluding.total_sessions)}</td>
                      <td className="num">
                        {validity.aggregate_excluding.zero_command_pct.toFixed(2)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <Head title="What that means" />
              <p className="note">
                A single campaign accounts for{" "}
                <b>{fmt(validity.campaign_sessions)} sessions</b>. Removing it moves the headline
                zero-command figure by {Math.abs(drop).toFixed(2)}pp. Neither number is wrong;
                reporting only one of them would be, so every release carries both.
              </p>
            </div>
          </div>
        </section>

        <section className="block" id="dataset">
          <Head title="Dataset" aside="published weekly, CC BY 4.0" />
          <p className="note">
            Session exports with ASN and country attribution, every captured command and response
            as JSONL with client addresses anonymised, aggregate statistics, and a findings
            narrative. Cite the preprint if you use it.
          </p>
          <div className="tags">
            <a
              className="tag"
              href="https://github.com/Mirage-Source/mirage-core/blob/gh-pages/dataset/latest/REPORT.md"
              target="_blank"
              rel="noreferrer"
            >
              latest report
            </a>
            <a
              className="tag"
              href="https://mirage-source.github.io/mirage-core/dataset/latest/sessions.csv"
              target="_blank"
              rel="noreferrer"
            >
              sessions.csv
            </a>
            <a
              className="tag"
              href="https://mirage-source.github.io/mirage-core/dataset/latest/commands.jsonl"
              target="_blank"
              rel="noreferrer"
            >
              commands.jsonl
            </a>
            <a
              className="tag"
              href="https://doi.org/10.17605/OSF.IO/JM4E7"
              target="_blank"
              rel="noreferrer"
            >
              OSF preprint
            </a>
          </div>
        </section>

        <div className="foot">
          <span>
            {fmt(stats.total_sessions)} sessions · {fmt(stats.unique_ips)} addresses
          </span>
          <span>deployed only on infrastructure we own</span>
          <a href="https://github.com/Mirage-Source/mirage-core" target="_blank" rel="noreferrer">
            mirage-core
          </a>
          <Link href="/console">operator console</Link>
        </div>
      </main>
    </>
  );
}
