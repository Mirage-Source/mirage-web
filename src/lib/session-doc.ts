import type { AuthAttempt, BaitEvent, Command, Intelligence, Protocol, SessionDetail, TelnetMeta } from "./types";

type Raw = Record<string, any>;

export const PROTOCOLS: Protocol[] = ["ssh", "telnet"];

export function parseProtocol(raw: string | null | undefined): Protocol {
  return raw === "telnet" ? "telnet" : "ssh";
}

export function normaliseSession(raw: Raw): SessionDetail {
  const network: Raw = raw.network ?? raw;
  const timing: Raw = raw.timing ?? raw;
  const commands: Command[] = raw.commands ?? [];
  const bait: BaitEvent[] = raw.bait_interactions ?? raw.bait_events ?? [];
  return {
    session_id: raw.session_id,
    schema_version: raw.schema_version,
    node_id: raw.node_id,
    protocol: raw.protocol ?? "ssh",
    client_ip: network.client_ip ?? "",
    client_port: network.client_port ?? 0,
    server_port: network.server_port ?? 0,
    ssh_client_banner: network.ssh_client_banner ?? "",
    start_ms: timing.start_ms,
    end_ms: timing.end_ms ?? null,
    duration_ms: timing.duration_ms ?? null,
    outcome: raw.outcome,
    command_count: raw.command_count ?? commands.length,
    bait_hit_count: raw.bait_hit_count ?? bait.length,
    auth_attempts: (raw.auth_attempts ?? []) as AuthAttempt[],
    commands,
    bait_events: bait,
    intelligence: raw.intelligence as Intelligence,
    telnet: (raw.telnet ?? null) as TelnetMeta | null,
  };
}

const TELNET_OPTIONS: Record<number, string> = {
  1: "ECHO", 3: "SGA", 5: "STATUS", 24: "TTYPE", 31: "NAWS", 32: "TSPEED",
  33: "LFLOW", 34: "LINEMODE", 35: "XDISPLOC", 36: "ENVIRON", 39: "NEW-ENVIRON",
};

export function telnetOptionName(code: number): string {
  return TELNET_OPTIONS[code] ?? String(code);
}

export function protocolQuery(protocol: Protocol, prefix: "?" | "&" = "?"): string {
  return protocol === "ssh" ? "" : `${prefix}protocol=${protocol}`;
}
