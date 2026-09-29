import "server-only";

import { countryName } from "./centroids";
import * as fx from "./fixtures";
import * as geo from "./geo";
import { collectPages } from "./paging";
import { exportPage, isLive } from "./upstream";
import type {
  ClusterSummary,
  ExportSession,
  GeoSummary,
  Protocol,
  SessionQuery,
  SessionRow,
  SessionsPage,
} from "./types";

const TTL_MS = 5 * 60 * 1000;
const GEO_IP_CAP = 4000;

const cache = new Map<Protocol, { at: number; sessions: ExportSession[] }>();
const inflightBy = new Map<Protocol, Promise<ExportSession[]>>();

const CORPUS_PAGE = 2000;
const CORPUS_MAX_PAGES = 500;

async function fetchCorpus(protocol: Protocol): Promise<ExportSession[]> {
  if (!isLive()) return protocol === "ssh" ? fx.exportSessions() : [];
  return collectPages(async (after) => {
    const body = await exportPage(CORPUS_PAGE, after, protocol);
    return { items: body.sessions, next: body.next_cursor ?? null };
  }, CORPUS_MAX_PAGES);
}

export async function corpus(protocol: Protocol = "ssh"): Promise<ExportSession[]> {
  const cached = cache.get(protocol);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.sessions;

  let inflight = inflightBy.get(protocol);
  if (!inflight) {
    inflight = fetchCorpus(protocol)
      .then((sessions) => {
        cache.set(protocol, { at: Date.now(), sessions });
        return sessions;
      })
      .finally(() => {
        inflightBy.delete(protocol);
      });
    inflightBy.set(protocol, inflight);
    // A refresh that fails must not reject whoever happens to be awaiting it
    // below; the catch here keeps the rejection from going unhandled when the
    // stale branch returns instead.
    inflight.catch(() => undefined);
  }

  // Stale-while-revalidate. Without this, the first request after the 5-minute
  // TTL pays the whole export download -- and on a configured sensor that is
  // the request that renders the console. Serving the previous corpus while
  // the refresh runs keeps that cost off the critical path; the data is
  // already a 5-minute approximation, so a few more seconds of staleness
  // changes nothing. Only a genuinely empty cache waits.
  if (cached) return cached.sessions;
  return inflight;
}

export function severityOf(s: ExportSession): "low" | "medium" | "high" | "critical" {
  if (s.bait_hit_count >= 2 || s.attacker_class === "apt") return "critical";
  if (s.bait_hit_count >= 1) return "high";
  if (s.command_count >= 5) return "high";
  if (s.command_count > 0) return "medium";
  return "low";
}

function toRow(s: ExportSession): SessionRow {
  return {
    session_id: s.session_id,
    client_ip: s.client_ip,
    ssh_banner: s.ssh_client_banner,
    outcome: s.outcome,
    start_ms: s.start_ms,
    duration_ms: s.duration_ms,
    command_count: s.command_count,
    bait_hit_count: s.bait_hit_count,
    attacker_class: s.attacker_class,
    classifier_confidence: s.classifier_confidence,
    cluster_id: s.cluster_id,
    mitre_techniques: s.mitre_techniques ?? [],
    severity: severityOf(s),
    auth_attempt_count: s.auth_attempt_count,
    top_username: s.top_username,
    country: null,
    asn: null,
    asn_name: null,
  };
}

const SEVERITY_ORDER = { low: 0, medium: 1, high: 2, critical: 3 };

export async function querySessions(q: SessionQuery): Promise<SessionsPage> {
  const all = await corpus(q.protocol ?? "ssh");
  const needle = q.search?.trim().toLowerCase() ?? "";

  let rows = all.filter((s) => {
    if (q.classes?.length && !q.classes.includes(s.attacker_class ?? "unclassified")) return false;
    if (q.outcomes?.length && !q.outcomes.includes(s.outcome)) return false;
    if (q.severities?.length && !q.severities.includes(severityOf(s))) return false;
    if (q.bait && s.bait_hit_count === 0) return false;
    if (q.shell && s.command_count === 0) return false;
    if (q.cluster && s.cluster_id !== q.cluster) return false;
    if (q.since_ms && s.start_ms < q.since_ms) return false;
    if (q.until_ms && s.start_ms > q.until_ms) return false;
    if (q.technique && !(s.mitre_techniques ?? []).includes(q.technique)) return false;
    if (needle) {
      const hay = `${s.session_id} ${s.client_ip} ${s.ssh_client_banner} ${s.attacker_class ?? ""} ${s.top_username ?? ""}`;
      if (!hay.toLowerCase().includes(needle)) return false;
    }
    return true;
  });

  const dir = q.order === "asc" ? 1 : -1;
  rows = rows.sort((a, b) => {
    switch (q.sort) {
      case "duration":
        return dir * ((a.duration_ms ?? 0) - (b.duration_ms ?? 0));
      case "commands":
        return dir * (a.command_count - b.command_count);
      case "bait":
        return dir * (a.bait_hit_count - b.bait_hit_count);
      case "severity":
        return dir * (SEVERITY_ORDER[severityOf(a)] - SEVERITY_ORDER[severityOf(b)]);
      default:
        return dir * (a.start_ms - b.start_ms);
    }
  });

  const limit = Math.min(Math.max(q.limit ?? 50, 1), 200);
  const offset = Math.max(q.offset ?? 0, 0);
  const page = rows.slice(offset, offset + limit).map(toRow);

  if (q.withGeo !== false && geo.geoAvailable()) {
    const located = await geo.resolve(page.map((r) => r.client_ip));
    for (const row of page) {
      const hit = located.get(row.client_ip);
      if (!hit) continue;
      row.country = hit.country;
      row.asn = hit.asn;
      row.asn_name = hit.asnName;
    }
  }

  return {
    total: rows.length,
    corpus_total: all.length,
    limit,
    offset,
    rows: page,
  };
}

export async function facets(protocol: Protocol = "ssh") {
  const all = await corpus(protocol);

  const classes = new Map<string, number>();
  const outcomes = new Map<string, number>();
  const severities = new Map<string, number>();
  const techniques = new Map<string, number>();

  for (const s of all) {
    const cls = s.attacker_class ?? "unclassified";
    classes.set(cls, (classes.get(cls) ?? 0) + 1);
    outcomes.set(s.outcome, (outcomes.get(s.outcome) ?? 0) + 1);
    const sev = severityOf(s);
    severities.set(sev, (severities.get(sev) ?? 0) + 1);
    for (const t of s.mitre_techniques ?? []) {
      techniques.set(t, (techniques.get(t) ?? 0) + 1);
    }
  }

  const rank = (m: Map<string, number>) =>
    [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

  return {
    classes: rank(classes),
    outcomes: rank(outcomes),
    severities: rank(severities),
    techniques: rank(techniques).slice(0, 12),
  };
}

export async function clusters(protocol: Protocol = "ssh"): Promise<ClusterSummary[]> {
  const all = await corpus(protocol);
  const groups = new Map<string, ExportSession[]>();

  for (const s of all) {
    if (!s.cluster_id) continue;
    const list = groups.get(s.cluster_id);
    if (list) list.push(s);
    else groups.set(s.cluster_id, [s]);
  }

  const out: ClusterSummary[] = [];

  for (const [id, members] of groups) {
    const ips = new Set(members.map((m) => m.client_ip));
    const banners = new Map<string, number>();
    const classes = new Map<string, number>();
    const usernames = new Map<string, number>();

    let commands = 0;
    let bait = 0;
    let first = Infinity;
    let last = -Infinity;

    for (const m of members) {
      banners.set(m.ssh_client_banner, (banners.get(m.ssh_client_banner) ?? 0) + 1);
      const cls = m.attacker_class ?? "unclassified";
      classes.set(cls, (classes.get(cls) ?? 0) + 1);
      if (m.top_username) usernames.set(m.top_username, (usernames.get(m.top_username) ?? 0) + 1);
      commands += m.command_count;
      bait += m.bait_hit_count;
      first = Math.min(first, m.start_ms);
      last = Math.max(last, m.start_ms);
    }

    const pick = (m: Map<string, number>) =>
      [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    out.push({
      cluster_id: id,
      sessions: members.length,
      unique_ips: ips.size,
      dominant_class: pick(classes),
      dominant_banner: pick(banners),
      top_username: pick(usernames),
      commands,
      bait_hits: bait,
      first_seen_ms: first,
      last_seen_ms: last,
      prefixes: Array.from(
        new Set([...ips].map((ip) => ip.split(".").slice(0, 2).join(".") + ".x.x")),
      ).slice(0, 6),
    });
  }

  return out.sort((a, b) => b.sessions - a.sessions);
}

// Sessions per address, and nothing else. The origins rollup is the one
// public path that needs the whole corpus, and holding 100k+ session objects
// resident is what pushed a 256MB container over its cap. So this walks the
// export in keyset pages and keeps only the counts: a few thousand entries.
const IP_TTL_MS = 15 * 60 * 1000;
const IP_PAGE = 2000;
const IP_MAX_PAGES = 500;
const ipCache = new Map<Protocol, { at: number; counts: Map<string, number> }>();
const ipInflightBy = new Map<Protocol, Promise<Map<string, number>>>();

async function countAddresses(protocol: Protocol): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!isLive()) {
    // Fixtures are small and already in memory; no paging to do.
    for (const s of await corpus(protocol)) counts.set(s.client_ip, (counts.get(s.client_ip) ?? 0) + 1);
    return counts;
  }
  let after: string | undefined;
  for (let page = 0; page < IP_MAX_PAGES; page++) {
    const body = await exportPage(IP_PAGE, after, protocol);
    for (const s of body.sessions) counts.set(s.client_ip, (counts.get(s.client_ip) ?? 0) + 1);
    if (!body.next_cursor || body.sessions.length === 0) break;
    after = body.next_cursor;
  }
  return counts;
}

export async function ipCounts(protocol: Protocol = "ssh"): Promise<Map<string, number>> {
  const cached = ipCache.get(protocol);
  if (cached && Date.now() - cached.at < IP_TTL_MS) return cached.counts;
  let inflight = ipInflightBy.get(protocol);
  if (!inflight) {
    inflight = countAddresses(protocol)
      .then((counts) => {
        ipCache.set(protocol, { at: Date.now(), counts });
        return counts;
      })
      .finally(() => {
        ipInflightBy.delete(protocol);
      });
    ipInflightBy.set(protocol, inflight);
    inflight.catch(() => undefined);
  }
  // Stale while revalidating, same policy as the corpus cache.
  if (cached) return cached.counts;
  return inflight;
}

export async function geography(protocol: Protocol = "ssh"): Promise<GeoSummary> {
  if (!geo.geoAvailable()) {
    return { available: false, countries: [], asns: [], resolved: 0, unresolved: 0 };
  }

  const perIP = await ipCounts(protocol);

  const ips = [...perIP.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, GEO_IP_CAP)
    .map(([ip]) => ip);

  const located = await geo.resolve(ips);

  const countries = new Map<string, { sessions: number; ips: number }>();
  const asns = new Map<number, { name: string | null; sessions: number; ips: number }>();

  let resolved = 0;
  let unresolved = 0;

  for (const ip of ips) {
    const sessions = perIP.get(ip) ?? 0;
    const hit = located.get(ip);

    if (hit?.country) {
      resolved += 1;
      const entry = countries.get(hit.country) ?? { sessions: 0, ips: 0 };
      entry.sessions += sessions;
      entry.ips += 1;
      countries.set(hit.country, entry);
    } else {
      unresolved += 1;
    }

    if (hit?.asn) {
      const entry = asns.get(hit.asn) ?? { name: hit.asnName, sessions: 0, ips: 0 };
      entry.sessions += sessions;
      entry.ips += 1;
      if (!entry.name && hit.asnName) entry.name = hit.asnName;
      asns.set(hit.asn, entry);
    }
  }

  return {
    available: true,
    resolved,
    unresolved,
    countries: [...countries.entries()]
      .map(([code, v]) => ({ code, name: countryName(code), ...v }))
      .sort((a, b) => b.sessions - a.sessions),
    asns: [...asns.entries()]
      .map(([asn, v]) => ({ asn, name: v.name, sessions: v.sessions, ips: v.ips }))
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 20),
  };
}

export function invalidateCorpus() {
  cache.clear();
}
