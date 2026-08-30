"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Bars, Head, fmt, stamp, words } from "../ui";
import type { ExportCommand, ExportCommandsResponse } from "@/lib/types";

const ACTIONS = ["MINIMAL", "ENRICH", "STALL", "SURFACE_BAIT", "FAKE_SUCCESS"];

export function Commands() {
  const [rows, setRows] = useState<ExportCommand[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [baitOnly, setBaitOnly] = useState(false);
  const [action, setAction] = useState<string | null>(null);
  const [selected, setSelected] = useState<ExportCommand | null>(null);

  const query = useMemo(() => {
    const p = new URLSearchParams({ limit: "200" });
    if (search.trim()) p.set("q", search.trim());
    if (baitOnly) p.set("bait", "true");
    if (action) p.set("action", action);
    return p.toString();
  }, [search, baitOnly, action]);

  const load = useCallback(
    async (after?: string) => {
      setLoading(true);
      setError(null);
      try {
        const url = after ? `/api/console/commands?${query}&after=${encodeURIComponent(after)}` : `/api/console/commands?${query}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const page = (await res.json()) as ExportCommandsResponse;
        setRows((prev) => (after ? [...prev, ...page.commands] : page.commands));
        setCursor(page.next_cursor);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [query],
  );

  const first = useRef(true);

  useEffect(() => {
    const timer = setTimeout(
      () => {
        void load();
      },
      first.current ? 0 : 200,
    );
    first.current = false;
    return () => clearTimeout(timer);
  }, [load]);

  const verbs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of rows) counts.set(c.parsed_command, (counts.get(c.parsed_command) ?? 0) + 1);
    return [...counts.entries()]
      .map(([name, n]) => ({ name, n }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 10);
  }, [rows]);

  const baitCount = rows.filter((c) => c.bait_hit).length;

  return (
    <>
      <section className="hero short">
        <div className="eyebrow">Command corpus</div>
        <h2>Everything anyone typed.</h2>
        <p>
          Every captured command and the response it got, with the session context inlined. This is
          the corpus the dataset release publishes as <span className="mono">commands.jsonl</span>.
        </p>
      </section>

      <div className="filters">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="command, address, class"
          aria-label="Search commands"
        />

        <span className="sep" />

        <button type="button" className="chip" aria-pressed={baitOnly} onClick={() => setBaitOnly(!baitOnly)}>
          Bait hits {baitCount > 0 && <span className="chip-n">{baitCount}</span>}
        </button>

        <span className="sep" />

        {ACTIONS.map((a) => (
          <button
            key={a}
            type="button"
            className="chip"
            aria-pressed={action === a}
            onClick={() => setAction(action === a ? null : a)}
          >
            {a}
          </button>
        ))}

        <span className="count">{loading ? "reading…" : `${fmt(rows.length)} shown`}</span>
      </div>

      {error && <p className="note">Could not read the command export — {error}</p>}

      <div
        className="split split-2 sessions-layout"
        style={{ gap: 40, gridTemplateColumns: "minmax(0,1fr) 380px" }}
      >
        <div>
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>Command</th>
                  <th>Address</th>
                  <th>Class</th>
                  <th>Action</th>
                  <th className="num">Gap</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={6} className="empty">
                      Nothing matches.
                    </td>
                  </tr>
                ) : (
                  rows.map((c) => (
                    <tr
                      key={c.event_id}
                      className="row"
                      tabIndex={0}
                      aria-selected={selected?.event_id === c.event_id}
                      onClick={() => setSelected(c)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelected(c);
                        }
                      }}
                    >
                      <td className="k mono">
                        {c.bait_hit && <span className="bait-dot" aria-label="bait" />}
                        {c.raw_command}
                      </td>
                      <td className="mono" style={{ fontSize: 11.5 }}>
                        {c.client_ip}
                      </td>
                      <td>{c.attacker_class ? words(c.attacker_class) : "—"}</td>
                      <td className="mono" style={{ fontSize: 11 }}>
                        {c.deception_action ?? "—"}
                      </td>
                      <td className="num">
                        {c.inter_command_delay_ms === null
                          ? "—"
                          : c.inter_command_delay_ms < 1000
                            ? `${c.inter_command_delay_ms}ms`
                            : `${(c.inter_command_delay_ms / 1000).toFixed(1)}s`}
                      </td>
                      <td className="mono" style={{ fontSize: 11.5 }}>
                        {stamp(c.timestamp_ms)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="pager">
            <button
              type="button"
              className="chip"
              disabled={!cursor || loading}
              onClick={() => cursor && void load(cursor)}
            >
              {loading ? "loading…" : cursor ? "load more →" : "end of corpus"}
            </button>
          </div>
        </div>

        <div className="detail">
          {selected ? (
            <>
              <Head title="Command" tight aside={selected.response_source} />
              <div className="term" style={{ maxHeight: 220 }}>
                <div className="c">{selected.raw_command}</div>
                {selected.response ? <div className="o">{selected.response}</div> : null}
                {selected.bait_hit ? (
                  <div className="b">{words(selected.bait_type ?? "bait")} · triggered</div>
                ) : null}
              </div>

              <hr className="rule" />
              <dl className="kv">
                <dt>Session</dt>
                <dd>{selected.session_id}</dd>
                <dt>Address</dt>
                <dd>{selected.client_ip}</dd>
                <dt>Banner</dt>
                <dd style={{ fontSize: 11 }}>{selected.ssh_client_banner}</dd>
                <dt>Working dir</dt>
                <dd>{selected.working_directory}</dd>
                <dt>Sequence</dt>
                <dd>#{selected.sequence_number}</dd>
                <dt>Policy action</dt>
                <dd>{selected.deception_action ?? "none"}</dd>
                <dt>Exit code</dt>
                <dd>{selected.exit_code ?? "—"}</dd>
              </dl>

              {selected.mitre_techniques && selected.mitre_techniques.length > 0 && (
                <>
                  <hr className="rule" />
                  <Head title="ATT&CK" tight />
                  <div className="tags">
                    {selected.mitre_techniques.map((m) => (
                      <span className="tag" key={m}>
                        {m}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <Head title="Most typed" tight aside="in the loaded page" />
              {verbs.length > 0 ? <Bars items={verbs} /> : <div className="empty">Nothing loaded.</div>}
              <p className="note" style={{ marginTop: 22 }}>
                Select a command to see its response, its session, and the policy action it drew.
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
