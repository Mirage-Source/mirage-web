"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { HourlyChart, RateChart } from "../charts";
import { Bars, Figures, Head, fmt, stamp, useToast, words } from "../ui";
import type { ConsoleData } from "./Console";
import type {
  LLMProviderListing,
  PolicySummary,
  RuntimeConfig,
  SessionsResponse,
  SessionSummary,
  ValiditySummary,
} from "@/lib/types";

export function Overview({
  data,
  validity,
}: {
  data: ConsoleData;
  validity: ValiditySummary;
}) {
  const { stats } = data;

  const bannerTotal = stats.ssh_banners.reduce((n, b) => n + b.count, 0) || 1;
  const latest = validity.accept_rate.at(-1);
  const acceptRate = latest ? latest.rate : 0;
  const reachedShell = Math.round(stats.total_sessions * acceptRate);

  const uptimeDays = (() => {
    const first = validity.accept_rate[0];
    return first
      ? Math.round((Date.now() - new Date(first.date).getTime()) / 86_400_000)
      : validity.accept_rate.length;
  })();

  return (
    <>
      <section className="hero">
        <div className="eyebrow">
          {validity.sensor} · {uptimeDays} days continuous
        </div>
        <h1>An SSH server that isn&rsquo;t there, watched closely.</h1>
        <p>
          Every credential attempt, every keystroke, every reach for a file that was left out to
          be reached for.
        </p>
      </section>

      <Figures
        items={[
          {
            k: "Sessions",
            v: fmt(stats.total_sessions),
            n: `+${fmt(stats.sessions_last_24h)} / 24h`,
          },
          {
            k: "Source addresses",
            v: fmt(stats.unique_ips),
            n: `${fmt(stats.sessions_last_7d)} sessions / 7d`,
          },
          {
            k: "Accept rate",
            v: `${(acceptRate * 100).toFixed(2)}%`,
            n: latest?.flagged ? "outside band" : "within band",
          },
          {
            k: "Reached the shell",
            v: fmt(reachedShell),
            n: `${(acceptRate * 100).toFixed(2)}% of sessions`,
          },
        ]}
      />

      <section className="block">
        <Head title="Arrival rhythm" aside="sessions per hour, UTC" />
        <HourlyChart data={stats.hourly_distribution} />
      </section>

      <LiveFeed />

      <section className="block split split-3">
        <div>
          <Head title="What they try" aside="credential pairs" />
          <div className="scroll-x">
            <table>
              <tbody>
                {stats.top_credentials.slice(0, 8).map((c) => (
                  <tr key={`${c.username}:${c.password}`}>
                    <td className="k mono">{c.username}</td>
                    <td className="mono">{c.password}</td>
                    <td className="num">{fmt(c.count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <Head title="What they announce" aside="client banner" />
          <Bars
            unit="pct"
            items={stats.ssh_banners.slice(0, 6).map((b) => ({
              name: b.banner,
              n: (b.count / bannerTotal) * 100,
            }))}
          />
        </div>

        <div>
          <Head title="Who returns" aside="sessions per address" />
          <Bars items={stats.top_ips.slice(0, 6).map((i) => ({ name: i.ip, n: i.count }))} />
        </div>
      </section>

      <section className="block">
        <Head
          title="Coordinated windows"
          aside="same credential and banner, one 5-minute window"
        />
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th>Credential</th>
                <th className="num">Addresses</th>
                <th>Window opened</th>
                <th>Banner</th>
              </tr>
            </thead>
            <tbody>
              {(stats.coordinated_ips ?? []).slice(0, 8).map((g) => (
                <tr key={`${g.username}-${g.window_start_ms}`}>
                  <td className="k mono">
                    {g.username} / {g.credential}
                  </td>
                  <td className="num">{g.count}</td>
                  <td className="mono">{stamp(g.window_start_ms)}</td>
                  <td className="mono">{g.ssh_client_banner.replace(/^SSH-2\.0-/, "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="foot">
        <span>
          {fmt(stats.total_sessions)} sessions · {fmt(stats.unique_ips)} addresses
        </span>
        <span>dataset CC BY 4.0</span>
        <a href="https://doi.org/10.17605/OSF.IO/JM4E7" target="_blank" rel="noreferrer">
          OSF 10.17605/OSF.IO/JM4E7
        </a>
      </div>
    </>
  );
}

export function Validity({ v }: { v: ValiditySummary }) {
  const varying = v.field_cardinality.filter((f) => !f.collapsed).length;
  const flagged = v.accept_rate.find((d) => d.flagged);
  const all = v.campaign.aggregate_all;
  const excl = v.campaign.aggregate_excluding_campaign;
  const share =
    all.total_sessions > 0
      ? (v.campaign.total_campaign_sessions / all.total_sessions) * 100
      : 0;

  return (
    <>
      <section className="hero short">
        <div className="eyebrow">Data validity</div>
        <h2>Four checks that assume the data is lying.</h2>
        <p>The audit from the preprint, running continuously instead of once.</p>
      </section>

      <Figures
        items={[
          {
            k: "Accept-rate drift",
            v: String(v.accept_rate_flagged_days),
            n: `flagged / ${v.accept_rate.length} days`,
          },
          {
            k: "Field cardinality",
            v: `${varying}/${v.field_cardinality.length}`,
            n: "still varying",
          },
          { k: "Campaign share", v: `${share.toFixed(1)}%`, n: "of the corpus" },
          {
            k: "Heartbeat gaps",
            v: String(v.heartbeat.gaps.length),
            n: v.heartbeat.last_heartbeat
              ? `last beat ${new Date(v.heartbeat.last_heartbeat).toISOString().slice(11, 19)}Z`
              : "no heartbeat seen",
          },
        ]}
      />

      <section className="block">
        <Head
          title="Accept-rate band drift"
          aside="daily rate against its own trailing band"
        />
        <RateChart data={v.accept_rate} />
        {flagged && (
          <p className="note" style={{ marginTop: 20 }}>
            <b>{flagged.date}</b> — accept rate {(flagged.rate * 100).toFixed(2)}% against a
            trailing mean of {((flagged.mean ?? 0) * 100).toFixed(2)}% (σ{" "}
            {((flagged.stddev ?? 0) * 100).toFixed(2)}). A day outside its own history is
            flagged for a look, not deleted.
          </p>
        )}
      </section>

      <section className="block split split-2">
        <div>
          <Head title="Field cardinality" aside="modal share now / baseline" />
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>Field</th>
                  <th className="num">Distinct</th>
                  <th>Modal value</th>
                  <th className="num">Now</th>
                  <th className="num">Base</th>
                </tr>
              </thead>
              <tbody>
                {v.field_cardinality.map((f) => (
                  <tr key={`${f.table}.${f.column}`}>
                    <td className="k mono">
                      {f.table}.{f.column}
                    </td>
                    <td className="num">{f.distinct_count}</td>
                    <td className="mono">{f.modal_value}</td>
                    <td className="num">{(f.modal_share * 100).toFixed(1)}</td>
                    <td className="num" style={{ color: "var(--ink-4)" }}>
                      {(f.baseline_modal_share * 100).toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <Head
            title="Campaign against aggregate"
            aside={`${v.campaign.members.length} addresses`}
          />
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th />
                  <th className="num">Sessions</th>
                  <th className="num">Zero-cmd</th>
                  <th className="num">%</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="k">All sessions</td>
                  <td className="num">{fmt(all.total_sessions)}</td>
                  <td className="num">{fmt(all.zero_command_sessions)}</td>
                  <td className="num">{all.zero_command_pct.toFixed(2)}</td>
                </tr>
                <tr>
                  <td className="k">Campaign excluded</td>
                  <td className="num">{fmt(excl.total_sessions)}</td>
                  <td className="num">{fmt(excl.zero_command_sessions)}</td>
                  <td className="num">{excl.zero_command_pct.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="note" style={{ marginTop: 20 }}>
            One campaign of <b>{fmt(v.campaign.total_campaign_sessions)} sessions</b> sharing a
            divisible wordlist and an identical credential set. Headline figures move{" "}
            {Math.abs(all.zero_command_pct - excl.zero_command_pct).toFixed(2)}pp when it is
            removed, so every release reports both.
          </p>
        </div>
      </section>

      {v.heartbeat.gaps.length > 0 && (
        <section className="block">
          <Head title="Downtime, not silence" aside="sensor heartbeat gaps" />
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>From</th>
                  <th>To</th>
                  <th className="num">Duration</th>
                </tr>
              </thead>
              <tbody>
                {v.heartbeat.gaps.map((g) => (
                  <tr key={g.start}>
                    <td className="k mono">{g.start.slice(0, 19).replace("T", " ")}</td>
                    <td className="mono">{g.end.slice(0, 19).replace("T", " ")}</td>
                    <td className="num">{(g.duration_seconds / 60).toFixed(0)}m</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

const ACTION_NOTE: Record<string, string> = {
  MINIMAL: "nothing changes",
  ENRICH: "a fuller answer",
  STALL: "made to wait",
  SURFACE_BAIT: "bait put in view",
  FAKE_SUCCESS: "a false yes",
};

export function Policy({
  policy,
  providers,
}: {
  policy: PolicySummary;
  providers: LLMProviderListing;
}) {
  const toast = useToast();
  const [listing, setListing] = useState(providers);
  const [busy, setBusy] = useState<string | null>(null);

  async function activate(name: string) {
    setBusy(name);
    try {
      const res = await fetch("/api/console/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({ error: "" }))) as { error?: string };
        toast(error || `could not switch to ${name}`);
        return;
      }
      setListing((await res.json()) as LLMProviderListing);
      toast(`active provider · ${name}`);
    } catch {
      toast("the switch did not reach the sensor");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <section className="hero short">
        <div className="eyebrow">Deception policy · PPO</div>
        <h2>Deciding, each command, how much to show.</h2>
        <p>
          {policy.shadow_mode
            ? "Running in shadow. Every decision is recorded; none of them reach the attacker yet."
            : "Applied live. Decisions are changing what the attacker sees, right now."}
        </p>
      </section>

      <Figures
        items={[
          {
            k: `Decisions / ${policy.window_days}d`,
            v: fmt(policy.total_decisions),
            n: policy.shadow_mode ? "shadow mode" : "applied live",
          },
          {
            k: "Latency p95",
            v: policy.latency_p95_ms === null ? "—" : `${policy.latency_p95_ms}ms`,
            n: "budget 200ms",
          },
          {
            k: "Timeouts",
            v: policy.timeouts === null ? "—" : String(policy.timeouts),
            n: "fails to MINIMAL",
          },
          {
            k: "Checkpoint",
            v: policy.checkpoint ?? "—",
            n: "25-step horizon",
            small: true,
          },
        ]}
      />

      <section className="block split split-2">
        <div>
          <Head title="Action distribution" aside={`last ${policy.window_days} days`} />
          {policy.total_decisions > 0 ? (
            <Bars
              items={policy.actions.map((a) => ({
                name: a.name,
                n: a.count,
                note: ACTION_NOTE[a.name],
              }))}
            />
          ) : (
            <p className="empty">
              No decisions recorded yet. The policy writes to commands.deception_action only once
              MIRAGE_DECEPTION_ENABLED is on.
            </p>
          )}
        </div>

        <div>
          <Head title="Recent decisions" aside={policy.shadow_mode ? "shadow" : "live"} />
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>Command</th>
                  <th>Class</th>
                  <th>Action</th>
                  <th className="num">Step</th>
                </tr>
              </thead>
              <tbody>
                {policy.recent.map((d, i) => (
                  <tr key={`${d.command}-${i}`}>
                    <td className="k mono">{d.command}</td>
                    <td>{d.category ? words(d.category) : "—"}</td>
                    <td className="mono">{d.action}</td>
                    <td className="num">{d.step}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="block">
        <Head
          title="Shell completion"
          aside={listing.configured ? "answers commands with no builtin" : "not configured"}
        />
        {listing.providers.length > 0 ? (
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Kind</th>
                  <th>Model</th>
                  <th className="num">Calls / 24h</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {listing.providers.map((p) => (
                  <tr key={p.name}>
                    <td className="k mono">{p.name}</td>
                    <td>{words(p.kind)}</td>
                    <td className="mono">{p.model ?? "—"}</td>
                    <td className="num">{p.calls_24h === undefined ? "—" : fmt(p.calls_24h)}</td>
                    <td style={{ textAlign: "right" }}>
                      {listing.active === p.name ? (
                        <span className="mark hot">active</span>
                      ) : (
                        <button
                          type="button"
                          className="chip"
                          disabled={busy !== null}
                          onClick={() => activate(p.name)}
                        >
                          {busy === p.name ? "switching…" : "make active"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">
            {listing.reachable
              ? "No providers declared. Set MIRAGE_LLM_SHELL_PROVIDERS_JSON on the deception service."
              : "The deception service is not reachable, so completion is off. The shell answers unknown commands the way it always has."}
          </p>
        )}
        <p className="note" style={{ marginTop: 20 }}>
          Never fires for a builtin, a compound line, or an egress-capable tool. That constraint
          is enforced by the no-egress test battery, not by the prompt.
        </p>
      </section>
    </>
  );
}

interface SettingSpec {
  key: keyof RuntimeConfig;
  name: string;
  desc: React.ReactNode;
  env: string;
  hot?: boolean;
  mark?: string;
}

const DECEPTION: SettingSpec[] = [
  {
    key: "deception_enabled",
    name: "Run the policy",
    desc: "Score every command with the trained policy. On its own this only records what it would have done.",
    env: "MIRAGE_DECEPTION_ENABLED",
  },
  {
    key: "deception_apply_actions",
    name: "Apply actions live",
    desc: "Leave shadow mode. Sessions begin reflecting decisions — stalls, surfaced bait, false successes.",
    env: "MIRAGE_DECEPTION_APPLY_ACTIONS",
    hot: true,
  },
  {
    key: "llm_shell_enabled",
    name: "Shell completion",
    desc: (
      <>
        Answer unknown commands with a generated response instead of{" "}
        <span className="mono">command not found</span>.
      </>
    ),
    env: "MIRAGE_LLM_SHELL_ENABLED",
    hot: true,
  },
];

const INTEL: SettingSpec[] = [
  {
    key: "stix_enabled",
    name: "STIX 2.1 bundles",
    desc: "One bundle per enriched session. Deterministic, no external cost.",
    env: "MIRAGE_STIX_ENABLED",
  },
  {
    key: "intel_use_llm",
    name: "Threat summaries",
    desc: "A written summary per session. One API call each.",
    env: "MIRAGE_INTEL_USE_LLM",
    mark: "billed",
  },
  {
    key: "public_view",
    name: "Public view",
    desc: "Serve the sanitised aggregate page at the public root. No credentials, no raw commands, no full addresses.",
    env: "PUBLIC_VIEW",
  },
];

export function Control({ config }: { config: RuntimeConfig }) {
  const toast = useToast();
  const [state, setState] = useState(config);

  async function set(key: keyof RuntimeConfig, value: boolean) {
    if (!state.writable) {
      toast("read-only — the sensor has no config endpoint yet");
      return;
    }

    const previous = state;
    setState({ ...state, [key]: value });

    try {
      const res = await fetch("/api/console/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setState((await res.json()) as RuntimeConfig);
      toast(`${key} · ${value ? "on" : "off"}`);
    } catch {
      setState(previous);
      toast("the change did not stick — reverted");
    }
  }

  const rows = (specs: SettingSpec[]) =>
    specs.map((s) => (
      <div className="setting" key={s.env}>
        <div>
          <div className="name">
            {s.name}
            {s.hot && <span className="mark hot">attacker sees this</span>}
            {s.mark && <span className="mark">{s.mark}</span>}
          </div>
          <p className="desc">{s.desc}</p>
          <div className="env">{s.env}</div>
        </div>
        <input
          type="checkbox"
          className="switch"
          checked={Boolean(state[s.key])}
          disabled={!state.writable}
          aria-label={s.name}
          onChange={(e) => set(s.key, e.target.checked)}
        />
      </div>
    ));

  return (
    <>
      <section className="hero short">
        <div className="eyebrow">Control</div>
        <h2>What the sensor does next.</h2>
        <p>
          {state.writable
            ? "Changes take effect on the next connection. No restart, no redeploy."
            : "Read-only. Every one of these is an environment variable the sensor reads once at start-up — there is no endpoint to write them yet."}
        </p>
      </section>

      {!state.writable && (
        <p className="note">
          <b>Nothing here is writable yet.</b> mirage-core reads all of this with{" "}
          <span className="mono">os.Getenv</span> at process start and serves exactly one mutating
          route, <span className="mono">POST /api/llm-shell/active</span>. The switches show the
          sensor&rsquo;s real state and stay disabled until a runtime-config endpoint exists — see{" "}
          <span className="mono">docs/API-GAPS.md</span>.
        </p>
      )}

      <section className="block split split-2">
        <div>
          <Head title="Deception" />
          {rows(DECEPTION)}
        </div>
        <div>
          <Head title="Intelligence" />
          {rows(INTEL)}
        </div>
      </section>

      <section className="block split split-2">
        <div>
          <Head title="Limits" aside="applied at the sensor" />
          <table>
            <tbody>
              <tr>
                <td className="k">Completions per session</td>
                <td className="num">{state.limits.completions_per_session}</td>
              </tr>
              <tr>
                <td className="k">Global rate limit</td>
                <td className="num">{state.limits.global_rate_limit} / hr</td>
              </tr>
              <tr>
                <td className="k">Policy timeout</td>
                <td className="num">{state.limits.policy_timeout_ms} ms</td>
              </tr>
              <tr>
                <td className="k">Completion timeout</td>
                <td className="num">{state.limits.completion_timeout_ms} ms</td>
              </tr>
              <tr>
                <td className="k">Commands per session</td>
                <td className="num">{state.limits.commands_per_session}</td>
              </tr>
              <tr>
                <td className="k">Auth delay</td>
                <td className="num">
                  {state.limits.auth_delay_ms[0]}–{state.limits.auth_delay_ms[1]} ms
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div>
          <Head title="Weak credentials" aside="accepted into the shell" />
          <p className="note" style={{ marginBottom: 16 }}>
            Anything on this list gets in. Everything else is refused exactly the way a hardened
            sshd refuses it. The list lives at{" "}
            <span className="mono">config/weak_credentials.txt</span> on the sensor.
          </p>
          <div className="term" style={{ maxHeight: 150 }}>
            <div className="o">
              {[
                "root:root",
                "root:123456",
                "admin:admin",
                "support:support",
                "ubuntu:ubuntu",
                "user:user",
                "test:test",
                "oracle:oracle",
                "pi:raspberry",
                "git:git",
              ].join("\n")}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

const POLL_MS = 15_000;

function ago(ms: number): string {
  const s = Math.max(Math.round((Date.now() - ms) / 1000), 0);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86_400)}d`;
}

export function LiveFeed() {
  const [rows, setRows] = useState<SessionSummary[]>([]);
  const [on, setOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const seen = useRef<Set<string>>(new Set());
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  const pull = useCallback(async () => {
    try {
      const res = await fetch("/api/console/feed?limit=12");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const page = (await res.json()) as SessionsResponse;

      const incoming = new Set<string>();
      for (const s of page.sessions) {
        if (!seen.current.has(s.session_id)) incoming.add(s.session_id);
        seen.current.add(s.session_id);
      }

      setRows(page.sessions);
      setFresh(incoming);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void pull();
  }, [pull]);

  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => void pull(), POLL_MS);
    return () => clearInterval(id);
  }, [on, pull]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  void tick;

  return (
    <section className="block">
      <Head
        title="Latest arrivals"
        aside={
          <button type="button" className="chip" aria-pressed={on} onClick={() => setOn(!on)}>
            {on ? `following · every ${POLL_MS / 1000}s` : "follow"}
          </button>
        }
      />

      {error ? (
        <p className="note">Feed unavailable — {error}</p>
      ) : rows.length === 0 ? (
        <div className="empty">Nothing yet.</div>
      ) : (
        <div className="scroll-x">
          <table>
            <tbody>
              {rows.map((s) => (
                <tr key={s.session_id} data-fresh={fresh.has(s.session_id)}>
                  <td className="k mono">{s.client_ip}</td>
                  <td>{words(s.outcome)}</td>
                  <td className="num" style={s.command_count ? undefined : { color: "var(--ink-4)" }}>
                    {s.command_count} cmd
                  </td>
                  <td className="mono" style={{ fontSize: 11.5 }}>
                    {s.ssh_banner.replace(/^SSH-2\.0-/, "")}
                  </td>
                  <td className="num" style={{ color: "var(--ink-3)" }}>
                    {ago(s.start_ms)} ago
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="note" style={{ marginTop: 18 }}>
        The sensor has no event stream, so following polls the session list. See{" "}
        <span className="mono">docs/API-GAPS.md §7</span>.
      </p>
    </section>
  );
}
