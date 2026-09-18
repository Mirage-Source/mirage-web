import type { Scene } from "../types.ts";

// The third rung is not another victim. It is the sensor itself: what MIRAGE
// is, and what actually happens when the automated traffic from the first two
// rungs reaches a machine that was put there to be reached. Every figure it
// cites is one this deployment measures. The inversion is the point: here the
// thing that moves is the record of the attacker, into a store the attacker
// cannot see.
export const ssh: Scene = {
  id: "ssh",
  eyebrow: "Level one · the SSH sensor",
  title: "A server that isn't there",
  intro:
    "Every hour, botnets try every address on the internet for a machine that answers on port 22. MIRAGE is one, on purpose: a convincing SSH server on infrastructure we own, that lets the weak passwords through so it can record what happens next. Watch one session arrive.",
  root: "idle",
  cta: "Watch a session arrive",
  ctaNode: "sensor",
  camera: { position: [11, 8, 19], target: [0.5, 2, -3] },
  nodes: [
    { id: "sensor", kind: "server", at: [0, 0, 0], label: "MIRAGE · a real SSH server", scale: 1.5 },
    { id: "net", kind: "globe", at: [7.5, 2, -11], label: "the internet", scale: 0.9 },
    { id: "botnet", kind: "swarm", at: [8, 0, -2.5], label: "a botnet", initial: "dim", scale: 0.7 },
    { id: "attacker", kind: "attacker", at: [8, 0, 2.5], label: "whoever bought the list", initial: "hidden" },
    { id: "store", kind: "rack", at: [-7, 0, -3], label: "session store · postgres" },
    { id: "worker", kind: "server", at: [-13, 0, 0.5], label: "enrichment", initial: "dim" },
    { id: "validity", kind: "server", at: [-6, 0, 6.5], label: "validity checks", initial: "dim" },
    { id: "dataset", kind: "cards", at: [-16, 0, -5], label: "weekly dataset", initial: "dim" },
  ],
  assets: [
    { id: "banner", label: "client banner", home: "botnet" },
    { id: "creds", label: "credential attempts", home: "botnet" },
    { id: "commands", label: "keystrokes", home: "attacker" },
    { id: "bait", label: "a bait file", home: "sensor" },
    { id: "record", label: "the session record", home: "sensor" },
  ],
  steps: {
    idle: {
      id: "idle",
      title: "A server that isn't there",
      caption:
        "It speaks the SSH handshake from the ground up and answers on port 22 like any other machine. It holds nothing real. Its only job is to be found, to accept the passwords a real server would refuse, and to write down everything that follows.",
      detail: "one sensor, one local postgres, deployed only on infrastructure we own",
      effects: [
        { type: "flow", from: "botnet", to: "sensor", via: ["net"], label: "is anyone there?", persist: true },
      ],
      choices: [{ label: "Watch a session arrive", to: "arrive" }],
    },
    arrive: {
      id: "arrive",
      title: "A connection lands",
      caption:
        "The first thing recorded is the client banner, the name the software announces itself by. It is self-reported and trivially forged, which is exactly why the same forged banner across hundreds of addresses in one window is worth noticing.",
      detail: "banner captured before a single password is tried",
      live: "This sensor has taken {sessions_7d} sessions in the last seven days, from {unique_ips} distinct addresses in all.",
      effects: [
        { type: "state", node: "botnet", state: "hot" },
        { type: "flow", from: "botnet", to: "sensor", via: ["net"], label: "SSH-2.0-…" },
        { type: "copy", asset: "banner", to: "sensor" },
        { type: "camera", look: "net", zoom: 1 },
      ],
      choices: [{ label: "Try the credential list", to: "stuff" }],
    },
    stuff: {
      id: "stuff",
      title: "The same list everyone carries",
      caption:
        "Thousands of username and password pairs from one public wordlist, fired in seconds. Each attempt meets a deliberate delay of up to three seconds, which does nothing to the attacker's success and everything to how much of their time the sensor holds.",
      detail: "MITRE T1110 · every attempt written down, accepted or not",
      live: "The usernames tried most often here are {top_usernames}, and the list barely changes from week to week.",
      effects: [
        { type: "flow", from: "botnet", to: "sensor", via: ["net"], label: "root · admin · test …" },
        { type: "copy", asset: "creds", to: "sensor" },
      ],
      choices: [
        { label: "Most are refused", to: "refused" },
        { label: "One pair is on the list", to: "accepted" },
      ],
    },
    refused: {
      id: "refused",
      title: "Refused, exactly like a real server",
      caption:
        "A pair that is not on the seeded weak-credential list is rejected the way a minimally hardened server rejects it. The attempt still happened, so it is still recorded. Most traffic ends here: only a small fraction of sessions ever type a command at all.",
      detail: "the refusal is a finding too; absence of a command is data, not a gap",
      effects: [
        { type: "flow", from: "sensor", to: "botnet", via: ["net"], label: "denied" },
        { type: "camera", look: "sensor", zoom: 1.1 },
      ],
      choices: [{ label: "Even this is kept", to: "captured" }],
    },
    accepted: {
      id: "accepted",
      title: "One pair is on the list",
      caption:
        "A weak pair from the seeded list is accepted, and the connection is let through into a stateful fake shell. To whoever is on the other end, they are now inside a Linux box. They are inside a recording.",
      detail: "the accept is deliberate; the shell is byte-by-byte, with a working directory that persists across the session",
      effects: [
        { type: "state", node: "attacker", state: "hot" },
        { type: "flow", from: "botnet", to: "sensor", via: ["net"], label: "root / 123 ✓" },
        { type: "camera", look: "sensor", zoom: 1.2 },
      ],
      choices: [{ label: "Inside the shell", to: "shell" }],
    },
    shell: {
      id: "shell",
      title: "The first thing they do is look around",
      caption:
        "Who am I, what is this machine, what can it reach. The same short reconnaissance, run by a program, in the same order almost every time. The fake filesystem answers consistently, and each keystroke and the pause before it is written down.",
      detail: "uname · whoami · ls · cat — command text and inter-command timing both captured",
      effects: [
        { type: "flow", from: "attacker", to: "sensor", label: "uname · whoami · ls" },
        { type: "copy", asset: "commands", to: "sensor" },
        { type: "camera", look: "attacker", zoom: 1.15 },
      ],
      choices: [
        { label: "Touch a file left out to be touched", to: "bait" },
        { label: "Reach for a payload", to: "egress" },
      ],
    },
    bait: {
      id: "bait",
      title: "A file left out to be found",
      caption:
        "The tree holds bait: a file named like credentials or a key, placed to be interesting. Opening it changes nothing the attacker can see, and fires a real, recorded trigger on the sensor. It marks this session as one that reached for something.",
      detail: "the bait hit is inlined on the session's row in the published command export",
      effects: [
        { type: "flow", from: "attacker", to: "sensor", label: "cat id_rsa" },
        { type: "copy", asset: "bait", to: "store" },
      ],
      choices: [{ label: "What happens to all of it", to: "captured" }],
    },
    egress: {
      id: "egress",
      title: "The one thing it will not do",
      caption:
        "The attacker tries to pull a payload with wget or curl. This is where the sensor stops being permissive: anything that could reach back out to the network returns command-not-found, always. It is both a dead end and a fingerprint, and it is the ethical line the whole project is built on.",
      detail: "no egress-capable tool ever runs; the sensor never touches an outside host",
      effects: [
        { type: "state", node: "attacker", state: "hot" },
        { type: "flow", from: "attacker", to: "sensor", label: "wget http://…" },
        { type: "flow", from: "sensor", to: "attacker", label: "command not found" },
        { type: "camera", look: "attacker", zoom: 1.1 },
      ],
      choices: [{ label: "What happens to all of it", to: "captured" }],
    },
    captured: {
      id: "captured",
      title: "The record, not the loot",
      caption:
        "Nothing left the machine, because there was nothing on it and no way out of it. What moves is the record of the session, into a store the attacker was never on the same side of. That inversion is what every sensor here is built around.",
      detail: "auth attempts, banner, every command and its timing, bait hits — one session row",
      effects: [
        { type: "state", node: "store", state: "hot" },
        { type: "move", asset: "record", to: "store" },
        { type: "flow", from: "sensor", to: "store", label: "session", persist: true },
        { type: "camera", look: "store", zoom: 1.05 },
      ],
      choices: [{ label: "Into the pipeline", to: "pipeline" }],
    },
    pipeline: {
      id: "pipeline",
      title: "Why the numbers can be trusted",
      caption:
        "A worker adds weak-label classification and MITRE technique mappings, and a versioned dataset is published every week. Four checks run against the corpus continuously, because the corpus is attacker-controlled by construction and has to be treated as suspect.",
      detail: "accept-rate drift · field-cardinality collapse · campaign-vs-aggregate · sensor heartbeat",
      live: "Across all time this sensor has recorded {total_sessions} sessions and {shell_reached} that reached a shell.",
      effects: [
        { type: "state", node: "store", state: "hot" },
        { type: "state", node: "worker", state: "hot" },
        { type: "state", node: "validity", state: "hot" },
        { type: "state", node: "dataset", state: "hot" },
        { type: "flow", from: "store", to: "worker", label: "enrich" },
        { type: "flow", from: "worker", to: "dataset", label: "publish", persist: true },
        { type: "flow", from: "store", to: "validity", label: "audit", persist: true },
        { type: "move", asset: "record", to: "dataset" },
        { type: "camera", look: "worker", zoom: 0.95 },
      ],
      choices: [],
      lesson:
        "One check exists so that a sensor going down never reads as attackers going quiet. Another separates a single flooding campaign from everyone else's behaviour, and both figures ship in every release. That discipline is the difference between a honeypot and a story about one. The figures on this page come from it.",
    },
  },
};
