import type { Behaviour, SessionDetail } from "./types";

const TOOL_PATTERNS: [string, RegExp][] = [
  ["dropper", /^(wget|curl|tftp|ftpget|fetch)$/],
  ["miner", /(xmrig|minerd|cpuminer|stratum|nicehash)/],
  ["ddos_botnet", /(perl|\.sh$|busybox|tsunami|kaiten|mirai)/],
  ["persistence", /^(crontab|systemctl|chkconfig|rc\.local|useradd|usermod)$/],
  ["defense_evasion", /^(history|unset|shred|iptables|chattr)$/],
  ["credential_access", /(shadow|passwd|id_rsa|\.ssh|\.env|credentials)/],
  ["recon", /^(uname|whoami|id|w|last|ps|netstat|ss|ip|ifconfig|lscpu|nproc|free|df|cat)$/],
];

function toolSignature(commands: SessionDetail["commands"]): string {
  const scores = new Map<string, number>();

  for (const c of commands) {
    const line = [c.parsed_command, ...c.parsed_args].join(" ").toLowerCase();
    for (const [tool, pattern] of TOOL_PATTERNS) {
      if (pattern.test(c.parsed_command.toLowerCase()) || pattern.test(line)) {
        scores.set(tool, (scores.get(tool) ?? 0) + 1);
      }
    }
  }

  if (scores.size === 0) return commands.length > 0 ? "other" : "none";

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const priority = ["credential_access", "defense_evasion", "persistence", "miner", "ddos_botnet", "dropper"];
  for (const p of priority) {
    if (scores.has(p)) return p;
  }
  return ranked[0][0];
}

export function behaviourOf(session: SessionDetail): Behaviour {
  const delays = session.commands
    .map((c) => c.inter_command_delay_ms)
    .filter((d): d is number => typeof d === "number" && d >= 0);

  const n = delays.length;
  const mean = n > 0 ? delays.reduce((a, b) => a + b, 0) / n : null;

  const sorted = [...delays].sort((a, b) => a - b);
  const median =
    n === 0
      ? null
      : n % 2 === 1
        ? sorted[(n - 1) / 2]
        : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;

  const sd =
    n > 1 && mean !== null
      ? Math.sqrt(delays.reduce((a, d) => a + (d - mean) ** 2, 0) / (n - 1))
      : null;

  const cv = mean !== null && mean > 0 && sd !== null ? sd / mean : null;

  const superhuman = delays.filter((d) => d < 250).length;
  const fracSuperhuman = n > 0 ? superhuman / n : 0;

  let cadence: Behaviour["cadence"] = "unknown";
  if (n > 0) {
    if (fracSuperhuman >= 0.8) cadence = "superhuman";
    else if (cv !== null && cv < 0.35) cadence = "automated";
    else if (median !== null && median > 900) cadence = "human";
    else cadence = "mixed";
  }

  const first = session.commands[0]?.timestamp_ms ?? null;
  const last = session.commands.at(-1)?.timestamp_ms ?? null;
  const span = first !== null && last !== null ? last - first : 0;

  const distinct = new Set(session.commands.map((c) => c.parsed_command));
  const repeats = session.commands.length - distinct.size;

  const escalation = session.bait_events.reduce((max, b) => {
    const weight = b.access_type === "exfil_attempt" ? 3 : b.access_type === "copy" ? 2 : 1;
    return Math.max(max, weight);
  }, 0);

  return {
    command_count: session.commands.length,
    distinct_commands: distinct.size,
    repeat_commands: repeats,
    span_ms: span,
    median_delay_ms: median,
    mean_delay_ms: mean,
    delay_cv: cv,
    frac_superhuman: fracSuperhuman,
    cadence,
    tool_signature: toolSignature(session.commands),
    bait_escalation: escalation,
    auth_attempts: session.auth_attempts.length,
    unique_usernames: new Set(session.auth_attempts.map((a) => a.username)).size,
    delays,
  };
}
