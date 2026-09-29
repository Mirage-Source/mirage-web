import "server-only";

import * as fx from "./fixtures";
import { normaliseSession, normaliseStats } from "./session-doc";
import type {
  ExportCommandsResponse,
  ExportResponse,
  HoneypotStats,
  LLMProviderListing,
  Protocol,
  SensorList,
  SessionDetail,
  SessionReport,
  SessionsResponse,
  ValiditySummary,
} from "./types";

const BASE = process.env.MIRAGE_API_URL?.replace(/\/+$/, "") ?? "";
const KEY = process.env.MIRAGE_API_KEY ?? "";

export const isLive = (): boolean => BASE !== "" && KEY !== "";

export class UpstreamError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    message: string,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

interface GetOptions {
  revalidate?: number;
  timeoutMs?: number;
}

async function get<T>(path: string, opts: GetOptions = {}): Promise<T> {
  const { revalidate = 30, timeoutMs = 10_000 } = opts;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { "X-API-Key": KEY },
      signal: controller.signal,
      next: revalidate > 0 ? { revalidate } : undefined,
      cache: revalidate > 0 ? undefined : "no-store",
    });

    if (!res.ok) {
      throw new UpstreamError(
        res.status,
        path,
        res.status === 401
          ? "The sensor rejected MIRAGE_API_KEY."
          : `The sensor returned ${res.status} for ${path}.`,
      );
    }

    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof UpstreamError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new UpstreamError(504, path, `The sensor did not answer ${path} in time.`);
    }
    throw new UpstreamError(
      502,
      path,
      `Could not reach the sensor at ${BASE || "(unset)"}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  } finally {
    clearTimeout(timer);
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "X-API-Key": KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new UpstreamError(res.status, path, text.trim() || `The sensor returned ${res.status}.`);
  }

  return (await res.json()) as T;
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PUT",
    headers: { "X-API-Key": KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new UpstreamError(res.status, path, text.trim() || `The sensor returned ${res.status}.`);
  }

  return (await res.json()) as T;
}

function withProtocol(path: string, protocol: Protocol): string {
  if (protocol === "ssh") return path;
  return `${path}${path.includes("?") ? "&" : "?"}protocol=${protocol}`;
}

async function orFixture<T>(live: () => Promise<T>, offline: () => T): Promise<T> {
  if (!isLive()) return offline();
  return live();
}

export function stats(protocol: Protocol = "ssh"): Promise<HoneypotStats> {
  return orFixture(
    async () =>
      normaliseStats(await get<Record<string, unknown>>(withProtocol("/api/stats", protocol), { revalidate: 60, timeoutMs: 20_000 })),
    () => fx.stats,
  );
}

export function sessions(limit = 50, offset = 0, protocol: Protocol = "ssh"): Promise<SessionsResponse> {
  const l = Math.min(Math.max(limit, 1), 100);
  const o = Math.max(offset, 0);
  return orFixture(
    () => get<SessionsResponse>(withProtocol(`/api/sessions?limit=${l}&offset=${o}`, protocol), { revalidate: 10 }),
    () => fx.sessionsPage(l, o),
  );
}

export function feed(limit = 25, protocol: Protocol = "ssh"): Promise<SessionsResponse> {
  const l = Math.min(Math.max(limit, 1), 100);
  return orFixture(
    async () => {
      const page = await get<SessionsResponse>(withProtocol(`/api/sessions?limit=${l}&offset=0`, protocol), { revalidate: 0 });
      return { ...page, sessions: page.sessions ?? [] };
    },
    () => fx.feed(l),
  );
}

export async function session(id: string): Promise<SessionDetail> {
  const raw = await orFixture<Record<string, unknown>>(
    () => get<Record<string, unknown>>(`/api/sessions/${encodeURIComponent(id)}`, { revalidate: 0 }),
    () => fx.session(id) as unknown as Record<string, unknown>,
  );
  return normaliseSession(raw);
}

// The full corpus dump. Deliberately routed through get() rather than a bare
// fetch in corpus.ts: this is the one endpoint with no pagination, and the Go
// API sets WriteTimeout: 15s (cmd/api/main.go), so past that it stops writing
// mid-JSON and the client sees a parse error rather than a timeout. A 20s
// abort makes the failure legible as an upstream timeout instead.
export function exportDump(protocol: Protocol = "ssh"): Promise<ExportResponse> {
  return get<ExportResponse>(withProtocol("/api/export", protocol), { revalidate: 0, timeoutMs: 20_000 });
}

// One keyset page of the export. Pages are what a memory-capped process can
// afford: the full dump above is tens of megabytes of JSON parsed at once.
export function exportPage(limit: number, after?: string, protocol: Protocol = "ssh"): Promise<ExportResponse> {
  const q = new URLSearchParams({ limit: String(limit) });
  if (after) q.set("after", after);
  if (protocol !== "ssh") q.set("protocol", protocol);
  return get<ExportResponse>(`/api/export?${q.toString()}`, { revalidate: 0, timeoutMs: 20_000 });
}

// The only endpoint that returns an authoritative severity. Sessions that
// predate the intelligence tables can still 404 or 500 here, so callers treat
// a failure as "no report", not as a failed session load.
export function sessionReport(id: string): Promise<SessionReport> {
  return orFixture(
    () => get<SessionReport>(`/api/sessions/${encodeURIComponent(id)}/report`, { revalidate: 0 }),
    () => fx.sessionReport(id),
  );
}

export function validity(sensor?: string): Promise<ValiditySummary> {
  const q = sensor ? `?sensor=${encodeURIComponent(sensor)}` : "";
  return orFixture(
    () => get<ValiditySummary>(`/api/validity/summary${q}`, { revalidate: 300 }),
    () => fx.validity(sensor),
  );
}

export function sensors(): Promise<SensorList> {
  return orFixture(() => get<SensorList>("/api/sensors", { revalidate: 3600 }), () => fx.sensors);
}

export function commandExport(after?: string, limit = 100, protocol: Protocol = "ssh"): Promise<ExportCommandsResponse> {
  const params = new URLSearchParams({ limit: String(Math.min(Math.max(limit, 1), 500)) });
  if (after) params.set("after", after);
  if (protocol !== "ssh") params.set("protocol", protocol);
  return orFixture(
    () => get<ExportCommandsResponse>(`/api/export/commands?${params}`, { revalidate: 60 }),
    () => fx.commandExport(after, limit),
  );
}

export function providers(): Promise<LLMProviderListing> {
  return orFixture(
    () => get<LLMProviderListing>("/api/llm-shell/providers", { revalidate: 0 }),
    () => fx.providers,
  );
}

// The sensor's own view of the two dashboard-writable flags -- mirage-api's
// GET /api/config, not to be confused with derived.ts's runtimeConfig(),
// which merges this with the env-only fields the sensor's process doesn't
// own. Never falls back to a fixture on failure the way get() normally
// would: derived.ts needs to know a fetch failed so it can report `writable:
// []` truthfully rather than silently showing fixture data as if it came
// from a reachable sensor.
interface SensorConfig {
  deception_enabled: boolean;
  deception_apply_actions: boolean;
  updated_at: string | null;
  updated_by: string | null;
}

export function sensorConfig(): Promise<SensorConfig> {
  return get<SensorConfig>("/api/config", { revalidate: 0 });
}

export function updateSensorConfig(
  patch: Partial<Pick<SensorConfig, "deception_enabled" | "deception_apply_actions">>,
): Promise<SensorConfig> {
  return put<SensorConfig>("/api/config", { ...patch, updated_by: "console" });
}

export function setActiveProvider(name: string): Promise<LLMProviderListing> {
  return orFixture(
    () => post<LLMProviderListing>("/api/llm-shell/active", { name }),
    () => {
      try {
        return fx.setActiveProvider(name);
      } catch {
        throw new UpstreamError(400, "/api/llm-shell/active", "unknown provider");
      }
    },
  );
}
