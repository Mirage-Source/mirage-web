import type { GeoSummary, HoneypotStats, ValiditySummary } from "./types";

export function maskIP(ip: string): string {
  if (ip.includes(":")) {
    const head = ip.split(":").slice(0, 2).join(":");
    return `${head}:…`;
  }
  const octets = ip.split(".");
  if (octets.length !== 4) return "…";
  return `${octets[0]}.${octets[1]}.x.x`;
}

export interface PublicStats {
  total_sessions: number;
  unique_ips: number;
  sessions_last_24h: number;
  sessions_last_7d: number;
  top_usernames: { username: string; count: number }[];
  ssh_banners: { banner: string; count: number }[];
  hourly_distribution: { hour: number; count: number }[];
  coordinated: {
    addresses: number;
    username: string;
    banner: string;
    window_start_ms: number;
    prefixes: string[];
  }[];
  // How many windows the sensor found, as opposed to how many are listed
  // above -- the list is capped, the count must not be.
  coordinated_total: number;
  // null when no accept-rate series is available. Never a constant: the
  // figure the public page prints has to be one the sensor measured.
  accept_rate: number | null;
  shell_reached: number | null;
}

// acceptRate comes from the validity summary, which the public page already
// fetches alongside stats. HoneypotStats itself carries no accept rate and no
// shell-reached count (internal/api/stats.go), which is why this used to be a
// hardcoded 0.0279 multiplied through -- an invented number on the one surface
// whose whole argument is that its numbers are not invented.
export function publicStats(s: HoneypotStats, acceptRate: number | null): PublicStats {
  const coordinated = s.coordinated_ips ?? [];

  return {
    total_sessions: s.total_sessions,
    unique_ips: s.unique_ips,
    sessions_last_24h: s.sessions_last_24h,
    sessions_last_7d: s.sessions_last_7d,
    top_usernames: s.top_usernames.slice(0, 6),
    ssh_banners: s.ssh_banners.slice(0, 6),
    hourly_distribution: s.hourly_distribution,
    coordinated_total: coordinated.length,
    coordinated: coordinated.slice(0, 6).map((g) => ({
      addresses: g.count,
      username: g.username,
      banner: g.ssh_client_banner,
      window_start_ms: g.window_start_ms,
      prefixes: Array.from(new Set(g.ips.map(maskIP))),
    })),
    accept_rate: acceptRate,
    shell_reached: acceptRate === null ? null : Math.round(s.total_sessions * acceptRate),
  };
}

export interface PublicValidity {
  sensor: string;
  computed_at: string;
  accept_rate: { date: string; rate: number; flagged: boolean }[];
  flagged_days: number;
  fields_varying: number;
  fields_total: number;
  campaign_sessions: number;
  aggregate_all: { total_sessions: number; zero_command_pct: number };
  aggregate_excluding: { total_sessions: number; zero_command_pct: number };
  heartbeat_gaps: number;
}

export function publicValidity(v: ValiditySummary): PublicValidity {
  return {
    sensor: v.sensor,
    computed_at: v.computed_at,
    accept_rate: v.accept_rate.map((d) => ({
      date: d.date,
      rate: d.rate,
      flagged: d.flagged,
    })),
    flagged_days: v.accept_rate_flagged_days,
    fields_varying: v.field_cardinality.filter((f) => !f.collapsed).length,
    fields_total: v.field_cardinality.length,
    campaign_sessions: v.campaign.total_campaign_sessions,
    aggregate_all: {
      total_sessions: v.campaign.aggregate_all.total_sessions,
      zero_command_pct: v.campaign.aggregate_all.zero_command_pct,
    },
    aggregate_excluding: {
      total_sessions: v.campaign.aggregate_excluding_campaign.total_sessions,
      zero_command_pct: v.campaign.aggregate_excluding_campaign.zero_command_pct,
    },
    heartbeat_gaps: v.heartbeat.gaps.length,
  };
}

export interface PublicGeo {
  countries: { code: string; name: string; sessions: number; ips: number }[];
  asns: { asn: number; name: string | null; sessions: number }[];
  resolved: number;
}

export function publicGeo(g: GeoSummary): PublicGeo | null {
  if (!g.available || g.countries.length === 0) return null;
  return {
    countries: g.countries.slice(0, 20),
    asns: g.asns.slice(0, 8).map((a) => ({ asn: a.asn, name: a.name, sessions: a.sessions })),
    resolved: g.resolved,
  };
}
