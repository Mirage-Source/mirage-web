// The anatomy page's content model.
//
// A scene is a small 3D world (nodes at positions, assets that live on nodes)
// plus a directed acyclic graph of steps. The reader walks a path through the
// graph by choosing; the picture on screen is derived by replaying the
// effects of every step on that path (see engine.ts). Nothing here is
// executable: captions are prose, effects are declarative.

export type V3 = [number, number, number];

export type NodeKind =
  | "figure"
  | "attacker"
  | "phone"
  | "router"
  | "tower"
  | "globe"
  | "server"
  | "rack"
  | "building"
  | "laptop"
  | "swarm"
  | "cards";

// hidden: not drawn. dim: present but out of the story. normal: the resting
// state. hot: the thing to look at right now. dark: switched off or cut off.
export type NodeState = "hidden" | "dim" | "normal" | "hot" | "dark";

export interface SceneNode {
  id: string;
  kind: NodeKind;
  at: V3;
  label?: string;
  initial?: NodeState;
  // Multiplies the primitive's authored size.
  scale?: number;
}

export interface Asset {
  id: string;
  label: string;
  // Node the asset lives on before anything happens.
  home: string;
}

export type Effect =
  | { type: "state"; node: string; state: NodeState }
  // A flow is a line of moving packets. `via` threads it through nodes.
  // Flows from the current step animate; earlier flows are kept as faint
  // ghosts only when `persist` is set.
  | { type: "flow"; from: string; to: string; via?: string[]; label?: string; persist?: boolean }
  // Moves an asset to live on another node.
  | { type: "move"; asset: string; to: string }
  // Copies an asset: the original stays, a copy lands on `to`. This is what
  // "stealing" data actually is, so most theft effects are copies.
  | { type: "copy"; asset: string; to: string }
  | { type: "camera"; look: string; zoom?: number };

export interface Choice {
  label: string;
  to: string;
}

export interface Step {
  id: string;
  title: string;
  caption: string;
  // "Behind the scenes" line in monospace. May carry {placeholders}; see
  // engine.fill. Rendered only when every placeholder can be filled.
  detail?: string;
  // A line that only makes sense with live sensor figures. Omitted, with an
  // honest note in its place, when the sensor is unreachable.
  live?: string;
  effects: Effect[];
  choices: Choice[];
  // Shown on terminal steps: what would have changed the outcome.
  lesson?: string;
}

export interface Camera {
  position: V3;
  target: V3;
}

export interface Scene {
  id: string;
  eyebrow: string;
  title: string;
  intro: string;
  root: string;
  cta: string;
  // Node the CTA button is anchored to on screen.
  ctaNode: string;
  camera: Camera;
  nodes: SceneNode[];
  assets: Asset[];
  steps: Record<string, Step>;
}

// Live figures the enterprise scene can cite. Null means the sensor could not
// be reached; the page then says so rather than inventing a number.
export interface LiveFacts {
  sessions_7d: number;
  sessions_24h: number;
  total_sessions: number;
  unique_ips: number;
  shell_reached: number | null;
  top_usernames: string[];
}
