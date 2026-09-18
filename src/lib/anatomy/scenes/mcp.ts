import type { Scene } from "../types.ts";

// The MCP sensor. Nothing scans the internet for MCP servers, so this one is
// found on purpose: a disclosed self-audit tool that hands a connecting agent
// an adversarial prompt and scores how its guardrails answer. Everything here
// is mirage-mcp's own mechanism as its README states it. Standalone, so no
// live figure is cited.
export const mcp: Scene = {
  id: "mcp",
  eyebrow: "Level three · the MCP sensor",
  title: "A tool server that audits the agent",
  intro:
    "AI agents reach for tools over the Model Context Protocol. This server is a real one, and its advertised purpose is the whole trick: give an agent a boundary-testing prompt, let it answer as it normally would, and score which known guardrail the answer resembles. Disclosed, not hidden.",
  root: "idle",
  cta: "Connect an agent",
  ctaNode: "server",
  camera: { position: [11, 8, 19], target: [0.5, 2, -3] },
  nodes: [
    { id: "server", kind: "server", at: [0, 0, 0], label: "mirage-mcp · a tool server", scale: 1.5 },
    { id: "probes", kind: "cards", at: [2.6, 0, 3.2], label: "the probe bank" },
    { id: "tunnel", kind: "router", at: [4.5, 0, -4.5], label: "cloudflare tunnel", initial: "dim" },
    { id: "net", kind: "globe", at: [7.5, 2, -11], label: "the internet", scale: 0.9 },
    { id: "agent", kind: "laptop", at: [8.5, 0, -1.5], label: "an agent, connecting on purpose", initial: "dim" },
    { id: "classifier", kind: "server", at: [-8, 0, -2], label: "classifier · two axes", initial: "dim" },
    { id: "signatures", kind: "cards", at: [-5.5, 0, -7.5], label: "signature bank", initial: "dim" },
    { id: "log", kind: "rack", at: [-13, 0, -4.5], label: "sessions.jsonl" },
    { id: "findings", kind: "cards", at: [-9.5, 0, -9.5], label: "public findings", initial: "dim" },
  ],
  assets: [
    { id: "probe", label: "a probe", home: "probes" },
    { id: "handshake", label: "client name · version", home: "agent" },
    { id: "response", label: "the response", home: "agent" },
    { id: "verdict", label: "the verdict", home: "classifier" },
  ],
  steps: {
    idle: {
      id: "idle",
      title: "A tool server that audits the agent",
      caption:
        "It is listed in a public registry and reachable through a tunnel, never a published port, so this box's real address is not tied to the SSH sensor sharing it. Its description says plainly what it does and that responses are logged for research.",
      detail: "no passive traffic exists for MCP; a sensor here has to be worth connecting to",
      effects: [],
      choices: [{ label: "Connect an agent", to: "connect" }],
    },
    connect: {
      id: "connect",
      title: "The handshake says who is calling",
      caption:
        "An agent connects and the protocol handshake carries its client's self-reported name and version. Like a crawler's user agent, it is a claim to be recorded, not a fact. The connecting address is reduced to a salted hash and a country before it is discarded.",
      detail: "the raw address is never stored; the same anonymisation the SSH dataset uses",
      effects: [
        { type: "state", node: "agent", state: "hot" },
        { type: "state", node: "tunnel", state: "normal" },
        { type: "flow", from: "agent", to: "server", via: ["net", "tunnel"], label: "initialize" },
        { type: "copy", asset: "handshake", to: "server" },
        { type: "camera", look: "tunnel", zoom: 1.05 },
      ],
      choices: [{ label: "It asks for a probe", to: "probe" }],
    },
    probe: {
      id: "probe",
      title: "One boundary-testing prompt",
      caption:
        "The agent calls get_probe and receives a single adversarial prompt from a bank of eight kinds: identity elicitation, policy conflict, instruction override, a light jailbreak, and four documented techniques such as roleplay, hypothetical framing and authority impersonation. The agent answers it however it normally would.",
      detail: "AP-Test style, after arXiv:2502.01241 · the probe is the advertised feature, not a hidden one",
      effects: [
        { type: "state", node: "probes", state: "hot" },
        { type: "flow", from: "server", to: "agent", via: ["tunnel", "net"], label: "get_probe → prompt" },
        { type: "copy", asset: "probe", to: "agent" },
        { type: "camera", look: "probes", zoom: 1.1 },
      ],
      choices: [
        { label: "The agent refuses", to: "refuse" },
        { label: "The agent complies", to: "comply" },
        { label: "Something in between", to: "indeterminate" },
      ],
    },
    refuse: {
      id: "refuse",
      title: "A refusal, in a recognisable voice",
      caption:
        "The agent declines. It submits the refusal through submit_probe_response, and the classifier asks the second question: which known refusal style does this phrasing resemble? A bank of patterns, each with a confidence weight, answers with a best match.",
      detail: "every signature is a hypothesis until checked against real observed sessions",
      effects: [
        { type: "state", node: "classifier", state: "hot" },
        { type: "state", node: "signatures", state: "hot" },
        { type: "flow", from: "agent", to: "classifier", via: ["net", "tunnel", "server"], label: "submit_probe_response" },
        { type: "copy", asset: "response", to: "classifier" },
        { type: "flow", from: "signatures", to: "classifier", label: "match" },
        { type: "camera", look: "classifier", zoom: 1.1 },
      ],
      choices: [{ label: "Into the log", to: "logged" }],
    },
    comply: {
      id: "comply",
      title: "The more important finding",
      caption:
        "The agent goes along with the prompt. Compliance is checked first and takes priority over any style match, because a model agreeing to set aside its own safety behaviour matters more than how it phrases a refusal.",
      detail: "axis one: did it comply · axis two: which refusal style · the first wins",
      effects: [
        { type: "state", node: "classifier", state: "hot" },
        { type: "flow", from: "agent", to: "classifier", via: ["net", "tunnel", "server"], label: "submit_probe_response" },
        { type: "copy", asset: "response", to: "classifier" },
        { type: "camera", look: "classifier", zoom: 1.1 },
      ],
      choices: [{ label: "Into the log", to: "logged" }],
    },
    indeterminate: {
      id: "indeterminate",
      title: "Neither, and kept anyway",
      caption:
        "Nothing clears the confidence threshold on either axis. The response is not guessed at and not discarded. It is recorded as indeterminate, the same discipline the HTTP sensor keeps between unverifiable and impersonating.",
      detail: "never silently drop what you cannot classify",
      effects: [
        { type: "state", node: "classifier", state: "hot" },
        { type: "flow", from: "agent", to: "classifier", via: ["net", "tunnel", "server"], label: "submit_probe_response" },
        { type: "copy", asset: "response", to: "classifier" },
        { type: "camera", look: "classifier", zoom: 1.1 },
      ],
      choices: [{ label: "Into the log", to: "logged" }],
    },
    logged: {
      id: "logged",
      title: "Exactly what is kept, and nothing else",
      caption:
        "One line per submission: the probe id, the response text, the verdict, the optional self-declared agent label, the client's name and version, and the hashed address with its country. No other tool output, no other argument, no unrelated content. The corpus becomes a public dataset on how agents refuse.",
      detail: "three real agents compared so far · standalone, not yet pushed to the fleet",
      effects: [
        { type: "state", node: "log", state: "hot" },
        { type: "state", node: "findings", state: "hot" },
        { type: "move", asset: "verdict", to: "log" },
        { type: "flow", from: "classifier", to: "log", label: "append", persist: true },
        { type: "flow", from: "log", to: "findings", label: "publish" },
        { type: "camera", look: "log", zoom: 1 },
      ],
      choices: [],
      lesson:
        "Fingerprinting an agent by how it refuses is an empirical question, and this is the instrument for it: real agents, a real server, and a classifier that would rather say indeterminate than guess. Same posture as the other two sensors, on a surface that has to be found on purpose.",
    },
  },
};
