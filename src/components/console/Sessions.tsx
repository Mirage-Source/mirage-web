"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { DelayPlot } from "../charts";
import { Head, Sev, duration, fmt, stamp, useToast, words } from "../ui";
import { countryName } from "@/lib/centroids";
import type { Facets, SessionEnvelope, SessionRow, SessionSort, SessionsPage } from "@/lib/types";

const SORTS: { id: SessionSort; label: string }[] = [
  { id: "recent", label: "Newest" },
  { id: "severity", label: "Severity" },
  { id: "commands", label: "Commands" },
  { id: "bait", label: "Bait" },
  { id: "duration", label: "Duration" },
];

const PAGE = 50;

export function Sessions({
  initial,
  facets,
  geoAvailable,
  cluster,
  onClearCluster,
}: {
  initial: SessionsPage;
  facets: Facets;
  geoAvailable: boolean;
  cluster: string | null;
  onClearCluster: () => void;
}) {
  const [page, setPage] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [classes, setClasses] = useState<string[]>([]);
  const [severities, setSeverities] = useState<string[]>([]);
  const [outcomes, setOutcomes] = useState<string[]>([]);
  const [baitOnly, setBaitOnly] = useState(false);
  const [shellOnly, setShellOnly] = useState(false);
  const [sort, setSort] = useState<SessionSort>("recent");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (search.trim()) p.set("q", search.trim());
    for (const c of classes) p.append("class", c);
    for (const s of severities) p.append("severity", s);
    for (const o of outcomes) p.append("outcome", o);
    if (baitOnly) p.set("bait", "true");
    if (shellOnly) p.set("shell", "true");
    if (cluster) p.set("cluster", cluster);
    p.set("sort", sort);
    p.set("limit", String(PAGE));
    p.set("offset", String(offset));
    return p.toString();
  }, [search, classes, severities, outcomes, baitOnly, shellOnly, cluster, sort, offset]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);

      fetch(`/api/console/sessions?${query}`)
        .then(async (r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return (await r.json()) as SessionsPage;
        })
        .then((p) => {
          if (!cancelled) setPage(p);
        })
        .catch((e: Error) => {
          if (!cancelled) setError(e.message);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const toggle = (list: string[], set: (v: string[]) => void, value: string) => {
    setOffset(0);
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  };

  const active =
    classes.length + severities.length + outcomes.length > 0 ||
    baitOnly ||
    shellOnly ||
    search.trim() !== "" ||
    cluster !== null;

  const clearAll = () => {
    setSearch("");
    setClasses([]);
    setSeverities([]);
    setOutcomes([]);
    setBaitOnly(false);
    setShellOnly(false);
    setOffset(0);
    onClearCluster();
  };

  const rows = page.rows;
  const lastPage = offset + PAGE >= page.total;

  const move = (delta: number) => {
    if (rows.length === 0) return;
    const index = rows.findIndex((r) => r.session_id === selected);
    const next = Math.min(Math.max(index + delta, 0), rows.length - 1);
    setSelected(rows[next < 0 ? 0 : next].session_id);
  };

  return (
    <>
      <section className="hero short">
        <div className="eyebrow">Session explorer</div>
        <h2>{fmt(page.corpus_total)} arrivals, one at a time.</h2>
      </section>

      <div className="filters">
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setOffset(0);
            setSearch(e.target.value);
          }}
          placeholder="address, session, banner, username"
          aria-label="Search sessions"
        />

        <span className="sep" />

        {facets.classes.map((c) => (
          <button
            key={c.name}
            type="button"
            className="chip"
            aria-pressed={classes.includes(c.name)}
            onClick={() => toggle(classes, setClasses, c.name)}
          >
            {words(c.name)} <span className="chip-n">{fmt(c.count)}</span>
          </button>
        ))}

        <span className="sep" />

        {facets.severities.map((s) => (
          <button
            key={s.name}
            type="button"
            className="chip"
            aria-pressed={severities.includes(s.name)}
            onClick={() => toggle(severities, setSeverities, s.name)}
          >
            {s.name}
          </button>
        ))}

        <span className="count">
          {loading ? "reading…" : `${fmt(page.total)} match · ${fmt(page.corpus_total)} total`}
        </span>
      </div>

      <div className="filters second">
        {facets.outcomes.map((o) => (
          <button
            key={o.name}
            type="button"
            className="chip"
            aria-pressed={outcomes.includes(o.name)}
            onClick={() => toggle(outcomes, setOutcomes, o.name)}
          >
            {words(o.name)}
          </button>
        ))}

        <span className="sep" />

        <button
          type="button"
          className="chip"
          aria-pressed={baitOnly}
          onClick={() => {
            setOffset(0);
            setBaitOnly(!baitOnly);
          }}
        >
          Took the bait
        </button>
        <button
          type="button"
          className="chip"
          aria-pressed={shellOnly}
          onClick={() => {
            setOffset(0);
            setShellOnly(!shellOnly);
          }}
        >
          Reached the shell
        </button>

        <span className="sep" />

        <label className="sort">
          sort
          <select
            value={sort}
            onChange={(e) => {
              setOffset(0);
              setSort(e.target.value as SessionSort);
            }}
          >
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        {cluster && (
          <button type="button" className="chip" aria-pressed onClick={onClearCluster}>
            cluster {cluster} ✕
          </button>
        )}

        {active && (
          <button type="button" className="chip clear" onClick={clearAll}>
            clear all
          </button>
        )}
      </div>

      {error && <p className="note">Could not read the corpus — {error}</p>}

      <div
        className="split split-2 sessions-layout"
        style={{ gap: 40, gridTemplateColumns: "minmax(0,1fr) 430px" }}
      >
        <div>
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>Address</th>
                  {geoAvailable && <th>Origin</th>}
                  <th>Class</th>
                  <th>Severity</th>
                  <th className="num">Cmds</th>
                  <th className="num">Bait</th>
                  <th className="num">Duration</th>
                  <th>Started</th>
                </tr>
              </thead>
              <tbody
                onKeyDown={(e) => {
                  if (e.key === "j" || e.key === "ArrowDown") {
                    e.preventDefault();
                    move(1);
                  }
                  if (e.key === "k" || e.key === "ArrowUp") {
                    e.preventDefault();
                    move(-1);
                  }
                }}
              >
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={geoAvailable ? 8 : 7} className="empty">
                      Nothing matches. Clear a filter or widen the search.
                    </td>
                  </tr>
                ) : (
                  rows.map((s) => (
                    <Row
                      key={s.session_id}
                      s={s}
                      geo={geoAvailable}
                      selected={selected === s.session_id}
                      onSelect={setSelected}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="pager">
            <button
              type="button"
              className="chip"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(offset - PAGE, 0))}
            >
              ← newer
            </button>
            <span className="count">
              {page.total === 0
                ? "0"
                : `${fmt(offset + 1)}–${fmt(Math.min(offset + PAGE, page.total))}`}{" "}
              of {fmt(page.total)}
            </span>
            <button
              type="button"
              className="chip"
              disabled={lastPage}
              onClick={() => setOffset(offset + PAGE)}
            >
              older →
            </button>
          </div>
        </div>

        <div className="detail">
          <Detail id={selected} />
        </div>
      </div>
    </>
  );
}

function Row({
  s,
  geo,
  selected,
  onSelect,
}: {
  s: SessionRow;
  geo: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <tr
      className="row"
      tabIndex={0}
      aria-selected={selected}
      onClick={() => onSelect(s.session_id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(s.session_id);
        }
      }}
    >
      <td className="k mono">{s.client_ip}</td>
      {geo && (
        <td className="mono" style={{ fontSize: 11.5 }}>
          {s.country ?? "—"}
        </td>
      )}
      <td>{s.attacker_class ? words(s.attacker_class) : "—"}</td>
      <td>
        <Sev level={s.severity} label={false} />
      </td>
      <td className="num" style={s.command_count ? undefined : { color: "var(--ink-4)" }}>
        {s.command_count}
      </td>
      <td className="num" style={s.bait_hit_count ? undefined : { color: "var(--ink-4)" }}>
        {s.bait_hit_count}
      </td>
      <td className="num">{duration(s.duration_ms)}</td>
      <td className="mono" style={{ fontSize: 11.5 }}>
        {stamp(s.start_ms)}
      </td>
    </tr>
  );
}

function Detail({ id }: { id: string | null }) {
  const toast = useToast();
  const [data, setData] = useState<SessionEnvelope | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id) {
      setData(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/console/sessions/${encodeURIComponent(id)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(res.status === 404 ? "No such session." : `HTTP ${res.status}`);
        return (await res.json()) as SessionEnvelope;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const download = useCallback((name: string, payload: unknown) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const copyStix = useCallback(async () => {
    if (!data?.detail.intelligence.stix_bundle) return;
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(data.detail.intelligence.stix_bundle, null, 2),
      );
      toast("STIX 2.1 bundle copied");
    } catch {
      toast("the browser would not give up the clipboard");
    }
  }, [data, toast]);

  if (!id) return <div className="empty">Select a session.</div>;
  if (loading && !data) return <div className="empty">Reading session…</div>;
  if (error) return <div className="empty">{error}</div>;
  if (!data) return <div className="empty">Select a session.</div>;

  const { detail, behaviour, geo } = data;
  const intel = detail.intelligence;
  const baitFor = new Map(detail.bait_events.map((b) => [b.triggered_by_command_event_id, b]));

  const gap =
    behaviour.median_delay_ms === null
      ? "—"
      : behaviour.median_delay_ms < 1000
        ? `${Math.round(behaviour.median_delay_ms)}ms`
        : `${(behaviour.median_delay_ms / 1000).toFixed(1)}s`;

  return (
    <>
      <div className="block-head tight">
        <h3>{detail.client_ip}</h3>
        <span className="aside">
          <Sev level={intel.severity} />
        </span>
      </div>

      <dl className="kv">
        <dt>Session</dt>
        <dd>{detail.session_id}</dd>
        {geo.country && (
          <>
            <dt>Origin</dt>
            <dd>
              {countryName(geo.country)} ({geo.country})
            </dd>
          </>
        )}
        {geo.asn && (
          <>
            <dt>Network</dt>
            <dd>
              AS{geo.asn}
              {geo.asn_name ? ` · ${geo.asn_name}` : ""}
            </dd>
          </>
        )}
        <dt>Banner</dt>
        <dd style={{ fontSize: 11 }}>{detail.ssh_client_banner}</dd>
        <dt>Outcome</dt>
        <dd>{detail.outcome}</dd>
        <dt>Class</dt>
        <dd>
          {intel.attacker_class ?? "unclassified"}
          {intel.classifier_confidence !== null
            ? ` · ${intel.classifier_confidence.toFixed(2)}`
            : ""}
        </dd>
        <dt>Cluster</dt>
        <dd>{intel.cluster_id ?? "—"}</dd>
        <dt>Started</dt>
        <dd>{stamp(detail.start_ms)}</dd>
        <dt>Duration</dt>
        <dd>{duration(detail.duration_ms)}</dd>
      </dl>

      <hr className="rule" />

      <div className="block-head tight">
        <h3>Behaviour</h3>
        <span className="aside">derived</span>
      </div>
      <dl className="kv">
        <dt>Cadence</dt>
        <dd>{behaviour.cadence}</dd>
        <dt>Tool signature</dt>
        <dd>{words(behaviour.tool_signature)}</dd>
        <dt>Median gap</dt>
        <dd>{gap}</dd>
        <dt>Gap variation</dt>
        <dd>{behaviour.delay_cv === null ? "—" : behaviour.delay_cv.toFixed(2)}</dd>
        <dt>Sub-250ms</dt>
        <dd>{(behaviour.frac_superhuman * 100).toFixed(0)}%</dd>
        <dt>Distinct cmds</dt>
        <dd>
          {behaviour.distinct_commands} of {behaviour.command_count}
        </dd>
        <dt>Auth attempts</dt>
        <dd>
          {behaviour.auth_attempts} · {behaviour.unique_usernames} usernames
        </dd>
      </dl>

      {behaviour.delays.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <DelayPlot delays={behaviour.delays} />
        </div>
      )}

      <hr className="rule" />

      <div className="block-head tight">
        <h3>Transcript</h3>
        <span className="aside">{detail.command_count} commands</span>
      </div>
      <div className="term">
        {detail.commands.length === 0 ? (
          <div className="o">No commands — it ended at the password prompt.</div>
        ) : (
          detail.commands.map((c) => {
            const bait = baitFor.get(c.event_id);
            const line = [c.parsed_command, ...c.parsed_args].join(" ");
            return (
              <div key={c.event_id}>
                <div className="c">{line}</div>
                {c.response ? <div className="o">{c.response}</div> : null}
                {bait ? (
                  <div className="b">
                    {words(bait.bait_type)} · {words(bait.access_type)}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {detail.auth_attempts.length > 0 && (
        <>
          <hr className="rule" />
          <Head title="Credentials tried" tight aside={String(detail.auth_attempts.length)} />
          <div className="scroll-x">
            <table>
              <tbody>
                {detail.auth_attempts.slice(0, 12).map((a, i) => (
                  <tr key={`${a.timestamp_ms}-${i}`}>
                    <td className="k mono">{a.username}</td>
                    <td className="mono">{a.credential}</td>
                    <td className="num">{a.success ? "in" : "refused"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {intel.mitre_techniques && intel.mitre_techniques.length > 0 && (
        <>
          <hr className="rule" />
          <Head title="ATT&CK" tight />
          <div className="tags">
            {intel.mitre_techniques.map((m) => (
              <span className="tag" key={m}>
                {m}
              </span>
            ))}
          </div>
        </>
      )}

      {(intel.session_summary || (intel.recommended_actions?.length ?? 0) > 0) && (
        <>
          <hr className="rule" />
          <Head title="Assessment" tight />
          {intel.session_summary && (
            <p style={{ margin: "0 0 12px", color: "var(--ink-2)", fontSize: 12.5 }}>
              {intel.session_summary}
            </p>
          )}
          {intel.recommended_actions && intel.recommended_actions.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 16, color: "var(--ink-3)", fontSize: 12.5 }}>
              {intel.recommended_actions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
        </>
      )}

      <hr className="rule" />
      <div className="actions">
        {intel.stix_bundle ? (
          <>
            <button type="button" className="chip" onClick={copyStix}>
              Copy STIX
            </button>
            <button
              type="button"
              className="chip"
              onClick={() => download(`${detail.session_id}-stix.json`, intel.stix_bundle)}
            >
              Download STIX
            </button>
          </>
        ) : null}
        <button
          type="button"
          className="chip"
          onClick={() => download(`${detail.session_id}.json`, data)}
        >
          Download session
        </button>
      </div>
    </>
  );
}
