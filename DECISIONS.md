# Decisions

Append-only. One entry per nontrivial choice.

---

## 2026-08-30 — Severity is shown twice, labelled, rather than reconciled

**Chose:** The sessions table keeps its own derived severity (`corpus.ts
severityOf`) and is labelled `derived`. The detail pane calls
`GET /api/sessions/{id}/report` and shows the sensor's severity, tagged
`sensor`. Both are on screen; neither pretends to be the other.

**Why:** mirage-core has an authoritative answer — `internal/store/read.go`
prefers the ML pipeline's `intelligence.severity` and falls back to a
class-only ladder — but it is not on `ExportSession`, which is what the whole
session explorer is built from. So the table cannot have it without an
N+1 fetch per page. The report endpoint already exists, already resolves the
ML-vs-fallback question, and is one request per *selected* session. Labelling
both is honest about a split that is real rather than papering over it.

**Alternative considered:** Rewrite `severityOf` to mirror mirage-core's
class-only ladder. Rejected because core *prefers* the ML value and the export
carries neither — mirroring the fallback would make the two agree in the cases
that don't matter and still disagree in the ones that do, but silently. Also
considered doing nothing but filing it in API-GAPS; rejected because the
contradiction is visible in the UI today.

**My answer before seeing yours:** Use `/report` in the pane, label the table
derived.

**Measured:** against the fixture corpus, 8 of 60 sampled sessions disagree
(13%) — e.g. `manual_recon`, 2 commands, 0 bait: derived `medium`, sensor
`high`.

---

## 2026-08-30 — Nonce CSP on /console and /login only

**Chose:** `src/proxy.ts` mints a per-request nonce and emits
`script-src 'self' 'nonce-…' 'strict-dynamic'` for `/console` and `/login`.
Every other path keeps a static policy with `'unsafe-inline'`. All CSP now
comes from `proxy.ts`; `next.config.mjs` no longer sets the header.

**Why:** A nonce must be unique per request, which requires dynamic rendering.
`/console` and `/login` are already `force-dynamic`, so the nonce is free
there — and they are the only surfaces that render operator data. The public
page is `revalidate = 300`; making it dynamic to harden a page with no
operator data on it would trade a real property for a notional one.

**Alternative considered:** Nonce everywhere. Rejected for the ISR loss above —
the public page is reachable by the people the sensor is watching, so serving
it dynamically on every hit is the wrong direction. Also considered leaving
`'unsafe-inline'` in place; rejected because the fix is documented and the
weakening was only ever meant to be temporary (commit 8a9773f).

**My answer before seeing yours:** Nonce on `/console` and `/login` only.

**Verified:** `/` stays `○ (Static)` in the build output; all 14 bootstrap
scripts on `/login` carry the nonce and it differs per request.

---

## 2026-08-30 — Read weak_credentials.txt instead of hardcoding it

**Chose:** `derived.ts weakCredentials()` reads the sensor's real
`config/weak_credentials.txt` (honouring `WEAK_CREDENTIALS_FILE`, then looking
next to the mirage-core checkout) and the Control tab renders it whole. When
the file is not reachable the panel says so and shows nothing.

**Why:** The file's own header declares it public bait data, so there is
nothing to protect. The previous hardcoded ten-pair list was wrong in both
directions: it listed `git:git`, which the sensor does not accept, and omitted
38 pairs that it does — while the surrounding copy claimed it *was* the
sensor's list.

**Alternative considered:** Drop the list and keep only the explanation.
Rejected because the list is genuinely useful to an operator and is safe to
show. Keeping it hardcoded but relabelled "illustrative" was rejected as the
worst option: it preserves a wrong list to avoid a file read.

**My answer before seeing yours:** Read the real file server-side.

---

## 2026-08-30 — Corpus cache serves stale while revalidating

**Chose:** `corpus()` returns the previous corpus while a refresh runs; only a
cold cache waits.

**Why:** The old code blocked on expiry, so the first request after the
five-minute TTL paid the whole `/api/export` download — and on a configured
sensor that is the request rendering the console. The data is already a
five-minute approximation; a few more seconds of staleness changes nothing,
while a multi-second stall on a dashboard load is very visible.

**Alternative considered:** A background refresh timer. Rejected as the wrong
lifecycle for a Next server that may have several workers and no guarantee any
of them stays warm.

**My answer before seeing yours:** n/a (not asked — judged mechanical).

---

## 2026-08-30 — Console tab lives in the URL fragment

**Chose:** `#overview`, `#sessions`, … via `history.replaceState`, read on
mount and on `hashchange`.

**Why:** A reload or a shared link lands back on the same view. The fragment
needs no server round-trip and no Suspense boundary, which `useSearchParams`
would have forced on the console shell.

**Alternative considered:** `useSearchParams` + `router.replace`. Rejected for
the Suspense requirement and because the tab is pure view state the server has
no interest in.

**My answer before seeing yours:** n/a (not asked — judged mechanical).

---

## 2026-09-05 — `RuntimeConfig.writable` became an array of keys, not one boolean

**Chose:** `writable: boolean` → `writable: WritableConfigKey[]`
(`src/lib/types.ts`), and the `Control` view's per-row `disabled` check
became `state.writable.includes(key)` instead of a single flag gating every
switch identically.

**Why:** mirage-core's new `GET/PUT /api/config` (docs/API-GAPS.md §4) only
ever makes `deception_enabled`/`deception_apply_actions` real — `llm_shell_enabled`,
`stix_enabled`, `intel_use_llm` stay env-only, owned by other containers, with
no plan to change that soon. A single `writable` boolean has no honest value
once only two of six switches are real: `true` would lie about the other
four, `false` would lie about these two. This was the direct, mechanical
consequence of that backend scoping decision (see mirage-core's DECISIONS.md,
"Runtime flags: Postgres table + poll, not LISTEN/NOTIFY or an admin port"),
not an independent choice made here.

**Alternative considered:** none seriously — a per-field capability list is
the only shape that can be honest about a partially-writable object.

**My answer before seeing yours:** n/a — mechanical follow-through on
mirage-core's scoping decision.

---

## 2026-09-05 — Containerize mirage-web instead of keeping it a bare systemd service

**Chose:** A `Dockerfile` (multi-stage, Next.js `output: "standalone"`,
non-root runner) plus this repo's own `docker-compose.yml`, joining
mirage-core's `mirage_net` network as `external` rather than folding this
service into mirage-core's compose file.

**Why:** The old setup reached mirage-api over `127.0.0.1:8080` (a
host-loopback hop through Docker's published port) and resolved geo CSVs via
a relative `../mirage-core/data/geo` guess that only worked because both
repos happened to be sibling checkouts on the VPS. Containerizing on the
shared network makes both dependencies explicit: `mirage-api:8080` by
service-name DNS, and an explicit bind-mount for the geo CSVs. Folding this
service directly into mirage-core's compose file was rejected because CI for
each repo only ever checks out that one repo — a cross-repo build context
would work by hand but break the moment either side's deploy workflow runs
in isolation.

**Alternative considered:** Keep the systemd service, add CI only for
build/typecheck plus an `npm ci && npm run build && systemctl restart`
deploy step. Rejected once containerizing was chosen as the direction — see
the question this was decided from.

**My answer before seeing yours:** n/a — asked and answered via
AskUserQuestion; the assistant's own recommendation was "yes, containerize
now" and that's what was picked.

---

## 2026-09-05 — Dedicated deploy-only SSH key for mirage-web CI, not reused from mirage-core or personal

**Chose:** Generated a fresh ed25519 keypair solely for `mirage-web`'s
`deploy.yml`, appended the public half to the VPS's `authorized_keys`, and
set it as this repo's own `DEPLOY_KEY`/`DEPLOY_HOST`/`DEPLOY_USER`/
`DEPLOY_PORT` secrets.

**Why:** mirage-core's `DEPLOY_KEY` secret is write-only once set (GitHub
never returns secret values via API or UI), so it could not be copied
across. Reusing the operator's personal `~/.ssh/id_ed25519` was considered
and rejected — a personal key granting root access is worse to have sitting
in a second repo's Actions secrets than a purpose-built key that does
nothing but this deploy.

**Alternative considered:** Reuse the personal key (rejected, see above);
provision a scoped, non-root deploy user on the VPS instead of `root`
(deferred — out of scope for this pass, matches mirage-core's own
`DEPLOY_USER=root` precedent for now).

**My answer before seeing yours:** n/a — user directed "might be a deploy
only [key], use another deploy only key" before an approach was proposed.
