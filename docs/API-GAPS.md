# What the frontend needs from mirage-core

Written against `mirage-core-main` as it stands. Every item below is a place
where `mirage-web` is currently working around a missing endpoint, so each one
says what the workaround costs. Ordered by how much a fix unblocks.

---

## 1. CORS, or same-origin serving

`cmd/api/main.go` sets no `Access-Control-*` headers anywhere, so a browser on
another origin cannot call the API at all.

**Workaround:** the browser never calls the sensor. Every request goes through
Next.js route handlers (`src/lib/upstream.ts`), which also keeps
`MIRAGE_API_KEY` out of client code. That is the right shape regardless.

**Ask:** nothing, if this app runs on the sensor host or reaches it privately.
Add CORS only if something else needs direct browser access.

---

## 2. Filtering and sorting on `GET /api/sessions` — **biggest win**

The handler accepts `limit` (clamped 1–100) and `offset`, nothing else.
`SessionSummary` carries no attacker class, no severity, no bait count.

**Workaround:** `src/lib/corpus.ts` pulls the entire `GET /api/export` dump,
caches it for five minutes, and filters, sorts, facets and paginates in memory.
That works and it is what powers the session explorer, clusters and geography —
but it means every cold cache transfers the whole corpus, and the five-minute
window is the resolution at which "live" tops out.

**Ask:**

```
GET /api/sessions
  ?limit=       (existing)
  &offset=      (existing)
  &class=       automated_scanner | script_kiddie | manual_recon | apt
  &severity=    low | medium | high | critical
  &outcome=     clean_disconnect | timeout | connection_reset | auth_failed | active
  &ip=          exact or CIDR
  &cluster=     cluster id
  &technique=   MITRE id
  &since_ms=    &until_ms=
  &bait=        true | false
  &sort=        start_ms | duration_ms | command_count | severity   (default -start_ms)
```

Plus four fields on `SessionSummary`, all already columns on `sessions`:

```go
AttackerClass *string `json:"attacker_class"`
Severity      *string `json:"severity"`
BaitHitCount  int     `json:"bait_hit_count"`
ClusterID     *string `json:"cluster_id"`
```

`Severity` is also wanted on `ExportSession`, and for a sharper reason. The
export carries none, so `src/lib/corpus.ts severityOf` derives one from bait
and command counts — a third ladder, next to the ML pipeline's value and the
class-only fallback in `internal/store/read.go:474-487`. Against the fixture
corpus the derived and sensor severities disagree on 13% of sessions. The
console now shows both, labelled `derived` in the table and `sensor` in the
detail pane, but one severity on `ExportSession` would end the split outright.

Note also that `GET /api/export` is unpaginated while the API sets
`WriteTimeout: 15s` (`cmd/api/main.go`). Past that the server stops writing
mid-JSON and the client sees a parse error, not a timeout — so the export-dump
workaround has a hard corpus-size ceiling on the *server* side, independent of
anything this app can do about it. `src/lib/upstream.ts exportDump` aborts at
20s so the failure at least reports as an upstream timeout.

A `facets` count endpoint (or counts alongside the page) would let the filter
chips show totals without a second full scan.

---

## 3. Geo / ASN attribution

Nothing in the API or the `sessions` table carries country or ASN. Geo exists
only in `scripts/geo_lookup.py`, applied at dataset-export time.

**Workaround:** `src/lib/geo.ts` resolves addresses itself, streaming the same
pinned DB-IP Lite CSVs that ship in `data/geo/` and binary-walking them in one
sorted pass per file. Results are cached per address and the passes are
serialised so concurrent requests cannot thrash the files. It is accurate — it
reads the same tables the export script does — but a cold pass over the two
30MB files costs several seconds, and it only works where those CSVs are on
disk (`MIRAGE_GEO_DIR`).

**Ask:** attribute at ingest instead. Two nullable columns on `sessions`
(`country_code`, `asn`) populated from the same snapshots, exposed on
`SessionSummary`, plus:

```
GET /api/geo/summary
→ { countries: [{ code, sessions, unique_ips }],
    asns: [{ asn, name, sessions, unique_ips }] }
```

Aggregate only — the public surface must never receive per-session geo.

---

## 4. Runtime configuration — **largest piece of work**

Every flag the Control view shows is read with `os.Getenv` at process start (15
call sites). The API has exactly one mutating route,
`POST /api/llm-shell/active`.

**Workaround:** `src/lib/derived.ts` reports what *this* app's environment was
told and returns `writable: false`; the console renders every switch disabled
and `PATCH /api/console/config` answers 501 rather than accepting a change that
would evaporate.

This is worse than "the same variables, read in the wrong process". In
`docker-compose.yml` the flags are split across **four** services —
`mirage-core` owns the deception and LLM-shell toggles, `ml-worker` owns
`MIRAGE_STIX_ENABLED` (hardcoded `"1"`, not read from `.env`) and
`MIRAGE_INTEL_USE_LLM` (commented out entirely), `mirage-deception` owns the
checkpoint and the per-session and rate limits, and `mirage-api`, the only one
this app talks to, owns none of them. So the Control tab agrees with the sensor
only where mirage-web is deployed from the union of three services'
environments. The view now says so in as many words; it previously claimed the
switches showed "the sensor's real state".

One unit was simply wrong and is fixed: `MIRAGE_LLM_SHELL_GLOBAL_RATE_LIMIT`
was rendered as `/ hr`. It pairs with `MIRAGE_LLM_SHELL_RATE_WINDOW_S`, which
defaults to **60 seconds** (`ml/mirage/deception/completion.py:496-497`) — the
figure was off by sixty. `RuntimeConfig.limits` now carries the window and the
view prints both.

**Partially done (2026-09-05):** `deception_apply_actions` — the one that
matters, the shadow-mode switch — and `deception_enabled` are live. mirage-core
gained a `runtime_flags` Postgres table plus `GET/PUT /api/config`; `Runtime.PolicyEnabled`/`ApplyActions`
became `atomic.Bool` and a background poller
(`internal/server.watchRuntimeFlags`, every `MIRAGE_RUNTIME_FLAGS_POLL_SECONDS`,
default 3s) applies a console toggle to an already-running sensor process —
no restart, no redeploy, exactly as this section originally asked. `RuntimeConfig.writable`
is now `WritableConfigKey[]`, not a single boolean, since only these two of
the six switches on this tab are real — see mirage-core's DECISIONS.md entry
("Runtime flags: ...") and this repo's ("`RuntimeConfig.writable` became an
array...") for the full reasoning.

**Still open:** `llm_shell_enabled`, `stix_enabled`, `intel_use_llm`, and the
`limits` block are still env-only, each owned by a different container
(`mirage-core`, `ml-worker`, `mirage-deception`), with no read-through cache
or settings-table entry of their own yet. The Control tab's per-row disabled
state already reflects this precisely — extending the same
`runtime_flags`-table pattern to those is the natural next step whenever
that's worth doing.

---

## 5. Policy decisions

`commands.deception_action` is written per command and indexed
(`003_deception.sql`), but surfaces over HTTP only inside
`GET /api/export/commands`.

**Workaround:** `policySummary()` folds action counts out of one 500-row page of
the command export. That is a sample and it cannot produce latency or timeout
figures at all — those render as `—` rather than as invented numbers.

It used to label that sample a seven-day window, which no part of the request
supports: `GET /api/export/commands` is cursor-paginated with no time
parameter. `PolicySummary` now carries `sample_commands` — how many commands
the page actually held — and the view reads "Decisions in sample · of N
commands scanned". The `window_days` field is gone.

**Ask:**

```
GET /api/policy/summary?days=7
→ { window_days, total_decisions,
    actions: [{ name, count }],              // all five, zeros included
    recent:  [{ command, category, action, step, session_id, ts_ms }],
    shadow_mode, latency_p95_ms, timeouts, checkpoint }
```

---

## 6. The behavioural layer

`session_embeddings` holds trajectory geometry (`trajectory_straightness`,
`trajectory_convergence_step`, `intent_shift_count`, `timing_cv`,
`timing_median_ms`, `tool_signature`), and `ml/mirage/reid/` implements attacker
re-identification and campaign fingerprinting. The `enriched_sessions` view
already joins it. None of it reaches HTTP.

**Workaround:** `src/lib/behaviour.ts` re-derives what it can from the command
timestamps a session detail already returns — cadence, median gap, coefficient
of variation, sub-250ms fraction, a regex tool signature, bait escalation. It
is a reimplementation of the cheap half of the pipeline, and it disagrees with
the real model by construction. The trajectory geometry and the re-id
embeddings cannot be approximated at all, so the console simply does not show
them.

**Ask, in payoff order:**

```
GET /api/sessions/{id}/behaviour
→ { tool_signature, timing_label, timing_cv, timing_median_ms,
    trajectory: { path_length, mean_speed, total_curvature, straightness,
                  convergence_step },
    intent_shift_count, model_version }

GET /api/clusters
→ [{ cluster_id, sessions, unique_ips, dominant_class,
     first_seen_ms, last_seen_ms }]

GET /api/clusters/{id}
→ { members: [{ session_id, client_ip, similarity }], centroid_signature }
```

`enriched_sessions` already answers most of the first with a `SELECT`. The
console's Clusters view currently groups on `cluster_id` from the export, which
is the pipeline's own assignment rather than anything the re-id model produced.

---

## 7. Live updates

No WebSocket, no SSE. `GET /api/stats` is a full-corpus aggregate scan and
cannot be polled quickly.

**Workaround:** the Overview's arrivals feed polls `GET /api/sessions?limit=12`
every 15 seconds, and only while the operator turns it on. Stats are cached
60s, validity 300s (the sensor recomputes on a 10-minute ticker anyway),
sessions 10s.

**Ask, eventually:** `GET /api/stream` as SSE emitting `session.started`,
`session.ended`, `bait.hit`. Until then the current cadence is honest.

---



---

## Already there, and now used

Two things this document previously did not mention, found by reading
mirage-core rather than its docs:

- **`GET /api/sessions/{id}/report`** (`cmd/api/main.go`, `internal/api/report.go`)
  returns an `AttackerProfile` with a **non-nullable** severity — the resolved
  ML-or-fallback value — plus MITRE techniques, the LLM summary, recommended
  actions and the STIX bundle. The session detail pane calls it now. It is the
  only endpoint that exposes the severity resolution at all.

- **`GET /api/validity/accept-rate` (with `?days=`), `/fields`, `/campaign`,
  `/heartbeat`** exist as separate routes. This app only calls
  `/api/validity/summary`, which is a superset — fine, but the sensor switch in
  the console header refetches the whole summary to update one chart, and
  `/accept-rate?days=` would be the cheaper call.

## Still not asked for

- **Session deletion or mutation.** The corpus is research data; the console
  should never be able to alter it.
- **Anything returning credentials to an unauthenticated caller.** The public
  surface is sanitised server-side in `src/lib/sanitise.ts` and must stay that
  way.
