# Running the dashboard

Node 20+ (developed on 24). Nothing else — no database, no Docker, no sensor
required to start.

---

## Fastest path: see it working in 2 minutes

```bash
npm install
npm run build
npm run start
```

Open **http://localhost:3000**.

This runs the production build. Use it whenever you just want to *look* at the
dashboard — it starts in under a second and pages render in ~300ms.

With no `.env` at all it serves a generated corpus of 648 sessions with real
commands, bait hits, clusters and validity data, so every screen works before
the sensor is wired up. The header says `fixtures` when it is doing this.

**Do not use `npm run dev` to demo it.** Dev mode compiles on every request and
the first load of `/` can take 30–60s. `npm run dev` is for editing code, where
hot reload is worth that cost.

---

## Two surfaces

| URL | Who | Needs a password |
|---|---|---|
| `/` | anyone | no |
| `/console` | operators | yes |

Without `OPERATOR_PASSWORD` set, `/console` is **open in development** and
**blocked in production** (redirects to `/login?reason=unconfigured`). That is
deliberate — an ungated console showing raw credentials and transcripts is a
worse default than an app that refuses to serve it.

So for the fast path above you will hit the gate. Either:

```bash
# quick look
OPERATOR_PASSWORD=whatever SESSION_SECRET=whatever-long-string npm run start
```

or use `npm run dev`, where the console is open.

---

## Wiring it to the live sensor

```bash
cp .env.example .env
```

Fill in four values:

```
MIRAGE_API_URL=http://127.0.0.1:8080
MIRAGE_API_KEY=<the same value as API_KEY in mirage-core's .env>
OPERATOR_PASSWORD=<generate one>
SESSION_SECRET=<generate one>
```

Generate the two secrets:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

Then `npm run build && npm run start` again.

### Where this has to run

`mirage-api` publishes to `127.0.0.1:8080` in `docker-compose.yml`, so this app
must reach that address. Three options, in order of preference:

1. **On the sensor host.** Simplest. Nothing else to configure.
2. **Over an SSH tunnel** for local work:
   `ssh -N -L 8080:127.0.0.1:8080 user@sensor` — then the default
   `MIRAGE_API_URL` works as-is.
3. **On the compose network**, as another service with
   `MIRAGE_API_URL=http://mirage-api:8080`.

**You do not need to add CORS.** The browser never talks to the Go API — every
upstream call goes through this app's server, which is also the only thing that
ever reads `MIRAGE_API_KEY`. The key never reaches client-side JavaScript, and
must never be prefixed `NEXT_PUBLIC_`.

### Geo attribution

The sensor stores no country or ASN, so this app resolves addresses itself
against the pinned DB-IP Lite CSVs already in `mirage-core/data/geo/`. It looks
for them relative to this folder by default; if the two repos are not siblings:

```
MIRAGE_GEO_DIR=/opt/mirage-core/data/geo
```

Without them the Geography tab says so and the Origin column reads `—`.
Nothing else changes. The first lookup streams both 30MB files once (~2s) and
caches per address after that.

---

## Deploying it

```bash
npm ci
npm run build
npm run start          # binds 0.0.0.0:3000
```

Put it behind the same reverse proxy as everything else and terminate TLS
there. `PORT=3001 npm run start` to move it.

If you prefer it in compose, a minimal service:

```yaml
  mirage-web:
    build: ./mirage-web
    env_file: .env
    environment:
      MIRAGE_API_URL: "http://mirage-api:8080"
    ports:
      - "127.0.0.1:3000:3000"
    depends_on:
      - mirage-api
    restart: unless-stopped
```

with a two-stage Dockerfile (`npm ci && npm run build`, then `npm run start`).
There is no Dockerfile in this repo yet — say the word and I'll add one.

---

## Behaviour worth knowing

- **A configured sensor that fails is never masked with fixtures.** The console
  renders the upstream error instead. Stale numbers during an outage would be
  the worst thing this app could do.
- **Control is read-only** and says so, because there is nothing upstream to
  write to. See `docs/API-GAPS.md`.
- Caching: stats 60s, sessions 10s, validity 300s (the sensor recomputes on a
  10-minute ticker anyway), the session export 5 minutes.

---

## Commands

```bash
npm run dev        # editing — hot reload, slow first paint
npm run build      # production build
npm run start      # serve the build
npm run typecheck  # tsc --noEmit
```

## What to read next

- `README.md` — architecture, the public/console split, design rules
- `docs/API-GAPS.md` — the five endpoints that would let this drop its
  workarounds, with request and response shapes
