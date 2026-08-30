# mirage-web

Frontend for [MIRAGE](https://github.com/Mirage-Source/mirage-core) — a public
page and an operator console over the same sensor.

Next.js 16, React 19, TypeScript. No CSS framework, no chart library, no UI kit.

---

## Two surfaces, one app

| Route | Who | What it shows |
|---|---|---|
| `/` | anyone | Sanitised aggregates: corpus size, arrival rhythm, usernames, client banners, coordinated windows as prefixes, country and network origins, the four validity checks, dataset links |
| `/console` | operator only | Overview, session explorer, geography, clusters, command corpus, validity, deception policy, runtime control |
| `/login` | — | Operator sign-in |

The split is not cosmetic. `/` is reachable by the people the sensor is
watching, so three things never reach it: full source addresses (masked to a
`/16` prefix), passwords, and anything per-session. Redaction happens on the
server in `src/lib/sanitise.ts` — the public page never receives the unredacted
object, so there is nothing to un-redact in the browser.

---

## Why a server sits between the browser and the sensor

mirage-core's API puts one static `X-API-Key` on every route and ships no CORS
headers, so the browser can neither hold that key safely nor call the API
directly.

Every upstream call goes through `src/lib/upstream.ts`, which is `server-only`
and is the sole reader of `MIRAGE_API_KEY`. The browser talks exclusively to
this app's own routes under `/api/console/*`, gated by `src/proxy.ts`.
**Never prefix the upstream key with `NEXT_PUBLIC_`.**

---

## Running it

```bash
npm install
npm run dev
```

That is the whole setup. With no `MIRAGE_API_URL` configured the app serves a
generated corpus (`src/lib/fixtures.ts`) shaped exactly like the real wire
types — 648 sessions across 30 source networks, with commands, bait hits,
clusters and validity — so every view works with no sensor attached. The header
says `fixtures` when it is doing this.

To point at a real sensor, copy `.env.example` to `.env`:

```
MIRAGE_API_URL=http://127.0.0.1:8080
MIRAGE_API_KEY=<the sensor's API_KEY>
OPERATOR_PASSWORD=<generate one>
SESSION_SECRET=<generate one>
```

The Go API binds to `127.0.0.1:8080` in `docker-compose.yml`, so this app has
to run on the sensor host or reach it over a tunnel or private network.

A **configured** sensor that fails is never quietly replaced with fixtures —
the console renders the upstream error instead. An operator reading stale
numbers during an outage is the worst thing this app could do.

### Operator access

`/console` requires `OPERATOR_PASSWORD` and `SESSION_SECRET`. Sign-in issues an
HMAC-signed, httpOnly, 12-hour cookie; attempts are rate-limited per source
address. With neither set, development is allowed through so a fresh clone
runs, and **production is not** — an unconfigured deployment redirects to
`/login?reason=unconfigured` rather than serving the console open.

### Geo attribution

The sensor stores no country or ASN, so this app resolves addresses itself
against the pinned DB-IP Lite CSVs that ship with mirage-core in `data/geo/`.
It looks for them next to the repo by default; set `MIRAGE_GEO_DIR` to point
elsewhere. Without them the Geography view says so and the Origin column reads
`—`; nothing else changes.

Resolution streams each 30MB table once in a single sorted pass, caches per
address, and serialises passes so concurrent requests cannot thrash the files.
A cold pass costs a few seconds; everything after is cached.

---

## Layout

```
src/
  app/
    page.tsx                     public surface
    console/page.tsx             operator console (server-fetched)
    login/page.tsx               sign-in
    api/auth/                    sign in / out
    api/console/                 gated: sessions, session detail, commands,
                                 clusters, geo, validity, feed, providers, config
    globals.css                  the entire design system
  components/
    Mirage.tsx                   the landscape, the heat, the way in
    PublicView.tsx               public surface
    console/                     Console shell, Sessions, Geography,
                                 Clusters, Commands, views
    charts.tsx  ui.tsx           charts and shared primitives
  lib/
    upstream.ts                  the only reader of MIRAGE_API_KEY
    corpus.ts                    export-backed filtering, facets, clusters, geo rollup
    geo.ts                       DB-IP resolution
    behaviour.ts                 cadence and tool signature from command timing
    types.ts                     mirrors internal/api/*.go field-for-field
    sanitise.ts                  public-surface redaction
    derived.ts                   what the sensor has no endpoint for yet
    fixtures.ts                  offline corpus
    auth.ts                      operator session
    centroids.ts                 country centroids for the map
  proxy.ts                       gate on /console and /api/console
docs/API-GAPS.md                 what this needs from mirage-core
```

---

## The design

One landscape, white text, hairlines.

On load, MIRAGE stands on the horizon and the air is still. Then the heat
rises: the word bends, stretches, thins, and is gone — and the interface is
there in its place.

The shimmer is not a filter. The scene is painted to an offscreen canvas and
the visible canvas is rebuilt row by row each frame with a horizontal
displacement whose amplitude peaks at the horizon and decays with distance from
it, which is what an inferior mirage does to light. The wordmark is painted
*into* that buffer rather than layered over it, so the heat bends the letters
instead of passing behind them. It settles to an ambient level afterwards and
keeps breathing behind the data. `prefers-reduced-motion` stills it completely.
The entrance is driven by a timer rather than the frame loop, so a page that
never composites still reaches the interface.

Rules for anything added later:

- **The landscape is the only colour.** Everything drawn on top is white at
  some opacity. No accent hue, no second colour, no exceptions.
- **State is form, not hue.** Severity is four small bars filled by level, so
  `critical` reads at a glance with no red. Toggles are a line and a square.
- **No boxes.** Hairlines at 9–16% white, square corners, no fills, no shadows.
- **Archivo for interface text, DM Mono for data** — addresses, identifiers,
  counts, transcripts, environment variable names. Nothing else is monospaced.
- **Charts are hand-drawn SVG.** One hue, a handful of forms; a library would
  add weight and a second set of colour opinions.

---

## What is honest about it

Four things are shaped by endpoints that do not exist, and each says so in the
interface rather than hiding it:

- **Control is read-only.** Every flag there is an environment variable the
  sensor reads once at start-up. Switches show real state and stay disabled;
  `PATCH /api/console/config` answers 501.
- **Policy figures are a sample**, folded out of one page of the command
  export. Latency and timeouts render as `—`, not as invented numbers.
- **Filtering, clusters and geography are built on the full export dump**,
  cached five minutes, because no query endpoint exists.
- **Behaviour is re-derived** from command timing rather than read from
  `session_embeddings`, so it disagrees with the real model by construction.
  Trajectory geometry and re-id embeddings are not shown at all.

All four are in [docs/API-GAPS.md](docs/API-GAPS.md) with the request and
response shapes that would replace them.

---

## Scripts

```bash
npm run dev        # fixtures unless .env says otherwise
npm run build      # production build
npm run start      # serve the build
npm run typecheck  # tsc --noEmit
```
