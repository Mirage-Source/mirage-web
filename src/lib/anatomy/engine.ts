// Pure functions over a Scene. No DOM, no React: this is the part that is
// tested, and the renderer is a function of what it returns.

import type { Effect, LiveFacts, NodeState, Scene, Step } from "./types.ts";

export interface AssetPlace {
  on: string;
  copy: boolean;
}

export interface FlowView {
  from: string;
  to: string;
  via: string[];
  label?: string;
  active: boolean;
}

export interface VisualState {
  nodes: Record<string, NodeState>;
  // Every place each asset currently exists. The original is `copy: false`.
  assets: Record<string, AssetPlace[]>;
  flows: FlowView[];
  camera: { look: string; zoom: number } | null;
}

function initial(scene: Scene): VisualState {
  const nodes: Record<string, NodeState> = {};
  for (const n of scene.nodes) nodes[n.id] = n.initial ?? "normal";
  const assets: Record<string, AssetPlace[]> = {};
  for (const a of scene.assets) assets[a.id] = [{ on: a.home, copy: false }];
  return { nodes, assets, flows: [], camera: null };
}

function apply(v: VisualState, e: Effect, active: boolean): void {
  switch (e.type) {
    case "state":
      v.nodes[e.node] = e.state;
      return;
    case "flow":
      v.flows.push({ from: e.from, to: e.to, via: e.via ?? [], label: e.label, active });
      return;
    case "move":
      v.assets[e.asset] = [{ on: e.to, copy: false }];
      return;
    case "copy": {
      const places = v.assets[e.asset];
      if (!places.some((p) => p.on === e.to)) places.push({ on: e.to, copy: true });
      return;
    }
    case "camera":
      v.camera = { look: e.look, zoom: e.zoom ?? 1 };
      return;
  }
}

// Replay the effects of every step on `path`, in order. The path must start
// at the scene's root and each step must be a choice of the one before it;
// anything else is a bug in the caller, not a state to render.
export function resolve(scene: Scene, path: string[]): VisualState {
  if (path[0] !== scene.root) throw new Error(`path must start at root ${scene.root}`);
  const v = initial(scene);
  for (let i = 0; i < path.length; i++) {
    const step = scene.steps[path[i]];
    if (!step) throw new Error(`unknown step ${path[i]}`);
    if (i > 0) {
      const prev = scene.steps[path[i - 1]];
      if (!prev.choices.some((c) => c.to === step.id)) {
        throw new Error(`${step.id} is not a choice of ${prev.id}`);
      }
    }
    const last = i === path.length - 1;
    // Only the current step's flows animate. Earlier flows survive as ghosts
    // if they were authored to, and are otherwise dropped.
    if (!last) {
      for (const e of step.effects) {
        if (e.type === "flow") {
          if (e.persist) apply(v, e, false);
        } else apply(v, e, true);
      }
    } else {
      for (const e of step.effects) apply(v, e, true);
    }
  }
  return v;
}

// Every way a scene can be wrong that a type checker cannot see.
export function validate(scene: Scene): string[] {
  const errors: string[] = [];
  const nodes = new Set(scene.nodes.map((n) => n.id));
  const assets = new Set(scene.assets.map((a) => a.id));
  const steps = scene.steps;

  if (!steps[scene.root]) errors.push(`root ${scene.root} is not a step`);
  if (!nodes.has(scene.ctaNode)) errors.push(`ctaNode ${scene.ctaNode} is not a node`);

  for (const [key, s] of Object.entries(steps)) {
    if (s.id !== key) errors.push(`step ${key} has id ${s.id}`);
    for (const c of s.choices) {
      if (!steps[c.to]) errors.push(`dangling choice ${s.id} -> ${c.to}`);
    }
    for (const e of s.effects) {
      const refs: string[] =
        e.type === "flow" ? [e.from, e.to, ...(e.via ?? [])]
        : e.type === "state" ? [e.node]
        : e.type === "camera" ? [e.look]
        : [e.to];
      for (const r of refs) if (!nodes.has(r)) errors.push(`step ${s.id} names unknown node ${r}`);
      if ((e.type === "move" || e.type === "copy") && !assets.has(e.asset)) {
        errors.push(`step ${s.id} names unknown asset ${e.asset}`);
      }
    }
    if (s.choices.length === 0 && s.lesson === undefined) errors.push(`terminal step ${s.id} has no lesson`);
    if (s.choices.length > 0 && s.lesson !== undefined) errors.push(`non-terminal step ${s.id} has a lesson`);
  }

  // Reachability and cycles in one depth-first walk from the root.
  const seen = new Set<string>();
  const onStack = new Set<string>();
  const walk = (id: string, trail: string[]) => {
    if (onStack.has(id)) {
      errors.push(`cycle: ${[...trail, id].join(" -> ")}`);
      return;
    }
    if (seen.has(id) || !steps[id]) return;
    seen.add(id);
    onStack.add(id);
    for (const c of steps[id].choices) walk(c.to, [...trail, id]);
    onStack.delete(id);
  };
  if (steps[scene.root]) walk(scene.root, []);
  for (const id of Object.keys(steps)) if (!seen.has(id)) errors.push(`unreachable: ${id}`);

  return errors;
}

const FACT_KEYS: (keyof LiveFacts)[] = [
  "sessions_7d",
  "sessions_24h",
  "total_sessions",
  "unique_ips",
  "shell_reached",
  "top_usernames",
];

// Substitute {fact} placeholders. Returns null if any placeholder cannot be
// filled: a sentence with a hole in it is worse than no sentence.
export function fill(template: string, facts: LiveFacts | null): string | null {
  let missing = false;
  const out = template.replace(/\{(\w+)\}/g, (_, key: string) => {
    if (!facts || !FACT_KEYS.includes(key as keyof LiveFacts)) {
      missing = true;
      return "";
    }
    const v = facts[key as keyof LiveFacts];
    if (v === null || v === undefined) {
      missing = true;
      return "";
    }
    if (Array.isArray(v)) return v.join(", ");
    return v.toLocaleString("en-US");
  });
  return missing ? null : out;
}

export const stepOf = (scene: Scene, id: string): Step => scene.steps[id];
