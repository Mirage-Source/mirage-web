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

**Ask:** a settings table, a read-through cache in the Go core and the Python
services, and:

```
GET  /api/config  → { deception_enabled, deception_apply_actions,
                      llm_shell_enabled, stix_enabled, intel_use_llm,
                      limits: {...}, updated_at, updated_by }
PUT  /api/config  ← partial object; applies on the next connection, no restart
```

`deception_apply_actions` is the one that matters — it is the shadow-mode
switch, and flipping it from the console with an audit line is most of the
value of that whole view.

---

## 5. Policy decisions

`commands.deception_action` is written per command and indexed
(`003_deception.sql`), but surfaces over HTTP only inside
`GET /api/export/commands`.

**Workaround:** `policySummary()` folds action counts out of one 500-row page of
the command export. That is a sample, not the seven-day window it labels, and
it cannot produce latency or timeout figures at all — those render as `—`
rather than as invented numbers.

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

## Not asked for

- **Session deletion or mutation.** The corpus is research data; the console
  should never be able to alter it.
- **Anything returning credentials to an unauthenticated caller.** The public
  surface is sanitised server-side in `src/lib/sanitise.ts` and must stay that
  way.
