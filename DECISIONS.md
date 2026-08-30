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
