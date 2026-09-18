import type { Scene } from "../types.ts";

// The HTTP sensor. A website that isn't one, whose policy files carry a
// beacon: an unlinked path that exists in exactly one file and nowhere else,
// so a request for it is proof, not inference, that the client read that
// file. Everything here is mirage-crawl's own mechanism as its README states
// it. The sensor runs standalone today and pushes nothing to the dashboard,
// so this scene cites no live figure.
export const crawl: Scene = {
  id: "crawl",
  eyebrow: "Level two · the HTTP sensor",
  title: "A website that isn't one",
  intro:
    "Crawlers say who they are and claim to read the rules. An access log cannot tell a crawler that read robots.txt and obeyed from one that never read it, or from one that read it to find things to take. mirage-crawl can, because it plants the evidence itself.",
  root: "idle",
  cta: "Watch a crawler arrive",
  ctaNode: "site",
  camera: { position: [11, 8, 19], target: [0.5, 2, -3] },
  nodes: [
    { id: "site", kind: "server", at: [0, 0, 0], blurb: "A Python server that generates a plausible site of projects and pages from a seed, with eighteen policy surfaces and no database.", label: "mirage-crawl · a site that isn't one", scale: 1.5 },
    { id: "policy", kind: "cards", at: [2.5, 0, 3.2], blurb: "The machine-readable rules: robots.txt, llms.txt, ai.txt, the W3C reservation file and more, each rendered per request.", label: "robots.txt · llms.txt · ai.txt" },
    { id: "beacon", kind: "cards", at: [-2.8, 0, 3.6], blurb: "A 26-character token in a Disallow line, appearing nowhere else. Fetching it proves the file was read.", label: "an unlinked path: the beacon", initial: "dim" },
    { id: "decoys", kind: "cards", at: [-3, 0, -5.5], blurb: "Endpoints dressed to look like exposed GPU and cluster infrastructure. Nothing behind them executes anything.", label: "decoys that look like GPUs", initial: "hidden" },
    { id: "net", kind: "globe", at: [7.5, 2, -11], blurb: "Where crawlers come from. Some announce a well-known name; the name is a claim.", label: "the internet", scale: 0.9 },
    { id: "crawler", kind: "laptop", at: [8, 0, -2.5], blurb: "An automated client with a user agent string. What it fetches, and in what order, is the evidence.", label: "a crawler, claiming a name", initial: "dim" },
    { id: "second", kind: "laptop", at: [9.5, 0, 3], blurb: "A different address fetching a token minted for the first one: the policy was read by one machine and crawled by another.", label: "a second machine", initial: "hidden" },
    { id: "verifier", kind: "server", at: [-8, 0, -2], blurb: "Reverse DNS, published address ranges, header order, capability probes and JA4: five checks the client does not control.", label: "verification", initial: "dim" },
    { id: "log", kind: "rack", at: [-13, 0, -4.5], blurb: "One event per visit with every verdict attached. Standalone for now; not yet pushed to the fleet.", label: "event log" },
    { id: "verdicts", kind: "cards", at: [-9, 0, 5], blurb: "compliant, defiant, miner; verified, impersonating, unverifiable. Each says only what the evidence supports.", label: "verdicts", initial: "dim" },
  ],
  assets: [
    { id: "token", label: "a beacon token", home: "site" },
    { id: "claim", label: "claimed identity", home: "crawler" },
    { id: "verdict", label: "the verdict", home: "verifier" },
  ],
  steps: {
    idle: {
      id: "idle",
      title: "A website that isn't one",
      caption:
        "A plausible site of projects and pages, generated from a seed so every page and its ETag are stable. It serves eighteen policy surfaces, from robots.txt to llms.txt to the W3C reservation file. It needs no database. It waits to be crawled.",
      detail: "standalone · no state but one signing key · deployed only on a host we own",
      effects: [{ type: "flow", from: "crawler", to: "site", via: ["net"], label: "GET /robots.txt", persist: true }],
      choices: [{ label: "Watch a crawler arrive", to: "arrive" }],
    },
    arrive: {
      id: "arrive",
      title: "The rules, with a secret in them",
      caption:
        "The crawler asks for robots.txt and gets the real rules, identical for everyone. One Disallow line names a path that appears in this file and nowhere else on the site. The path is a 26-character token that carries the time, the standard, and a hash of the address it was served to.",
      detail: "rendered per request; the substantive rules never differ between clients, only the opaque token does",
      effects: [
        { type: "state", node: "crawler", state: "hot" },
        { type: "state", node: "policy", state: "hot" },
        { type: "state", node: "beacon", state: "normal" },
        { type: "flow", from: "site", to: "crawler", via: ["net"], label: "Disallow: /…token…" },
        { type: "copy", asset: "token", to: "crawler" },
        { type: "camera", look: "policy", zoom: 1.1 },
      ],
      choices: [
        { label: "It obeys the policy", to: "compliant" },
        { label: "It crawls anyway", to: "defiant" },
        { label: "It mines the file for URLs", to: "miner" },
        { label: "It is not a crawler at all", to: "hunt" },
      ],
    },
    compliant: {
      id: "compliant",
      title: "Read, and obeyed",
      caption:
        "The crawler fetches pages, and never the beacon. Because the beacon was in a Disallow line and nothing links to it, not fetching it is evidence too: the client read the file and respected the distinction. A control beacon in an Allow line confirms it can follow the file when allowed.",
      detail: "verdict: compliant · the Allow-line control is what separates obeying from never having read it",
      effects: [
        { type: "flow", from: "crawler", to: "site", via: ["net"], label: "pages only" },
        { type: "camera", look: "site", zoom: 1.05 },
      ],
      choices: [{ label: "Is it who it says it is?", to: "verify" }],
    },
    defiant: {
      id: "defiant",
      title: "Read, and ignored",
      caption:
        "A request arrives for the beacon path. Nothing links to it, so the only way to know it exists is to have read the file that said not to fetch it. In an access log this client looks exactly like one that never read robots.txt. Here the difference is a fact.",
      detail: "verdict: defiant · proof, not inference",
      effects: [
        { type: "state", node: "beacon", state: "hot" },
        { type: "flow", from: "crawler", to: "beacon", via: ["net"], label: "GET the beacon" },
        { type: "copy", asset: "token", to: "site" },
        { type: "camera", look: "beacon", zoom: 1.1 },
      ],
      choices: [{ label: "But which machine fetched it?", to: "split" }],
    },
    miner: {
      id: "miner",
      title: "Read, to find things to take",
      caption:
        "It fetches the disallowed beacon and the allowed one. A client that takes both is not evaluating policy at all; it is scraping URLs out of the file. Its other requests look like ordinary crawling. Without a planted URL this behaviour is invisible.",
      detail: "verdict: miner · the specificity control makes mining distinguishable from compliance",
      effects: [
        { type: "state", node: "beacon", state: "hot" },
        { type: "flow", from: "crawler", to: "beacon", via: ["net"], label: "both beacons" },
        { type: "copy", asset: "token", to: "site" },
        { type: "camera", look: "beacon", zoom: 1.1 },
      ],
      choices: [{ label: "But which machine fetched it?", to: "split" }],
    },
    split: {
      id: "split",
      title: "One machine read, another crawled",
      caption:
        "The token remembers the address it was served to. If the address fetching it is different, one machine read the policy and handed the URLs to another. That comparison is a single operation with no lookup, and it is the one thing this sensor can see that nothing else can.",
      detail: "split-fleet detection: the token verifies itself, so it survives restarts, reinstalls and load balancers",
      effects: [
        { type: "state", node: "second", state: "hot" },
        { type: "flow", from: "crawler", to: "second", label: "the URLs", persist: true },
        { type: "flow", from: "second", to: "beacon", via: ["net"], label: "GET the beacon" },
        { type: "camera", look: "second", zoom: 1.05 },
      ],
      choices: [{ label: "Is it who it says it is?", to: "verify" }],
    },
    hunt: {
      id: "hunt",
      title: "Looking for GPUs, not pages",
      caption:
        "Some visitors are not crawling. They sweep for exposed cluster and GPU endpoints to take over for mining. The host is dressed to look exploitable so that reconnaissance shows itself. Nothing is ever executed and no packet ever leaves; the payloads are only read, for the wallet addresses in them.",
      detail: "those wallet addresses are the join key to the same actors seen dropping miners over SSH",
      effects: [
        { type: "state", node: "decoys", state: "hot" },
        { type: "flow", from: "crawler", to: "decoys", via: ["net"], label: "probe · payload" },
        { type: "camera", look: "decoys", zoom: 1.1 },
      ],
      choices: [{ label: "Into the log", to: "logged" }],
    },
    verify: {
      id: "verify",
      title: "Five ways to check a claim",
      caption:
        "The name in the user agent is a claim. Reverse-resolve the address and forward-resolve the name it gives; check the published address ranges; compare the header order against the client it says it is; see whether it ran the JavaScript and parsed the stylesheet a browser would; fingerprint the TLS stack.",
      detail: "FCrDNS · published ranges · header order · capability probes · JA4",
      effects: [
        { type: "state", node: "verifier", state: "hot" },
        { type: "flow", from: "crawler", to: "verifier", via: ["site"], label: "the claim" },
        { type: "copy", asset: "claim", to: "verifier" },
        { type: "camera", look: "verifier", zoom: 1.1 },
      ],
      choices: [
        { label: "Its address checks out", to: "verified" },
        { label: "Its own operator's records contradict it", to: "impersonating" },
        { label: "There is nothing to check against", to: "unverifiable" },
      ],
    },
    verified: {
      id: "verified",
      title: "It is who it says",
      caption:
        "The reverse name resolves back to the same address, or the address sits inside a range the operator publishes. The claim is confirmed by something the client does not control.",
      detail: "verdict: verified",
      effects: [
        { type: "state", node: "verdicts", state: "hot" },
        { type: "flow", from: "verifier", to: "verdicts", label: "verified" },
        { type: "move", asset: "verdict", to: "verdicts" },
      ],
      choices: [{ label: "Into the log", to: "logged" }],
    },
    impersonating: {
      id: "impersonating",
      title: "Lying about who it is",
      caption:
        "A client claiming to be a well-known crawler from outside every block that operator publishes, or claiming a browser while emitting headers in the order a programming language's HTTP library uses. Only a claim contradicted by the operator's own published mechanism earns this word.",
      detail: "verdict: impersonating · never inferred from an absence of evidence",
      effects: [
        { type: "state", node: "verdicts", state: "hot" },
        { type: "flow", from: "verifier", to: "verdicts", label: "impersonating" },
        { type: "move", asset: "verdict", to: "verdicts" },
      ],
      choices: [{ label: "Into the log", to: "logged" }],
    },
    unverifiable: {
      id: "unverifiable",
      title: "Cannot be confirmed, cannot be refuted",
      caption:
        "The operator publishes no ranges and no reverse names. Recording that as a failure would manufacture a finding. It is recorded as exactly what it is, and kept strictly apart from a proven lie.",
      detail: "verdict: unverifiable · a missing range file is safe; a stale one is the dangerous state",
      effects: [
        { type: "state", node: "verdicts", state: "hot" },
        { type: "flow", from: "verifier", to: "verdicts", label: "unverifiable" },
        { type: "move", asset: "verdict", to: "verdicts" },
      ],
      choices: [{ label: "Into the log", to: "logged" }],
    },
    logged: {
      id: "logged",
      title: "What an access log could never say",
      caption:
        "Every visit is written with its verdicts: what it read, whether it obeyed, whether the reader and the crawler were the same machine, whether it is who it claims, and how much of its traffic was waste. The sensor runs on its own for now; its corpus is not yet on this dashboard.",
      detail: "standalone · own event log · not yet pushed to the fleet",
      effects: [
        { type: "state", node: "log", state: "hot" },
        { type: "flow", from: "verdicts", to: "log", label: "event", persist: true },
        { type: "copy", asset: "verdict", to: "log" },
        { type: "camera", look: "log", zoom: 1 },
      ],
      choices: [],
      lesson:
        "The token proves the read, the control proves the intent, and the address hash proves the machine. Three facts an access log has to guess at, each captured rather than inferred, and each with a verdict that says nothing more than the evidence does.",
    },
  },
};
