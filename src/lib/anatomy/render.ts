// The frame loop's brain. Holds the smoothed camera, per-node fade and asset
// motion between frames, and draws one frame of the whole world from a
// VisualState per rung. It is a class because it is stateful across frames;
// nothing in here touches React or the document.

import type { VisualState } from "./engine.ts";
import { add, anchor, centre, lerp, mul, primitive, project, sub, viewOf, type Projected, type Segment, type View } from "./geometry.ts";
import type { Rung } from "./scenes/index.ts";
import type { Camera, NodeState, SceneNode, V3 } from "./types.ts";

const ALPHA: Record<NodeState, number> = { hidden: 0, dim: 0.2, normal: 0.5, hot: 1, dark: 0.32 };
const NEAR = 0.05;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);

// Distance fade: things ~20 units away are crisp, ~110 away are gone. This is
// what lets both rungs live in one world without the far one cluttering.
const fade = (depth: number) => clamp01(1 - (depth - 22) / 90);

interface AssetAnim {
  from: V3;
  t0: number;
}

export interface Fonts {
  mono: string;
}

export interface FrameOut {
  // Screen position of the current rung's CTA anchor, or null if off-screen.
  cta: { x: number; y: number } | null;
}

// The camera a rung asks for right now: its authored camera, turned toward
// whatever the current step says to look at. Rotate toward the thing rather
// than slide toward it: the camera stays where it is and turns, then closes
// some of the distance for zoom.
export function cameraFor(rung: Rung, v: VisualState): Camera {
  const { scene, offset } = rung;
  let target = add(scene.camera.target, offset);
  let position = add(scene.camera.position, offset);
  if (v.camera) {
    const n = scene.nodes.find((x) => x.id === v.camera!.look)!;
    const look = add(centre(n.kind, n.at, n.scale ?? 1), offset);
    target = lerp(target, look, 0.6);
    position = add(target, mul(sub(position, target), 1 / v.camera.zoom));
  }
  return { position, target };
}

// Portrait screens see a much narrower slice of the world, so the camera
// backs off along its own arm to keep the whole scene in frame.
export function fitCamera(cam: Camera, w: number, h: number): Camera {
  const aspect = w / h;
  if (aspect >= 0.9) return cam;
  const back = 1 + (0.9 - aspect) * 2.6;
  return { position: add(cam.target, mul(sub(cam.position, cam.target), back)), target: cam.target };
}

export const viewCentre = (w: number, h: number): [number, number] =>
  w / h < 0.9 ? [w * 0.5, h * 0.36] : [w * 0.54, h * 0.46];

export class WorldRenderer {
  private rungs: Rung[];
  private visual: VisualState[];
  private nodeAlpha = new Map<string, number>();
  private assetAnim = new Map<string, AssetAnim>();
  private cam: Camera | null = null;
  private nodeIndex = new Map<string, { node: SceneNode; rung: number }>();
  private segCache = new Map<string, Segment[]>();
  private lastT = 0;

  constructor(rungs: Rung[], visual: VisualState[]) {
    this.rungs = rungs;
    this.visual = visual;
    rungs.forEach((r, i) => {
      for (const n of r.scene.nodes) this.nodeIndex.set(`${i}:${n.id}`, { node: n, rung: i });
    });
  }

  // Called when a rung's path changes. Diffs asset placement so new copies
  // fly in from where they came from.
  setVisual(rung: number, v: VisualState, now: number) {
    const prev = this.visual[rung];
    for (const [id, places] of Object.entries(v.assets)) {
      const before = prev.assets[id] ?? [];
      for (const p of places) {
        if (!before.some((b) => b.on === p.on)) {
          const origin = before[0]?.on ?? p.on;
          this.assetAnim.set(`${rung}:${id}:${p.on}`, { from: this.anchorOf(rung, origin), t0: now });
        }
      }
    }
    this.visual[rung] = v;
  }

  private world(rung: number, at: V3): V3 {
    return add(at, this.rungs[rung].offset);
  }

  private inActiveFlow(rung: number, id: string): boolean {
    return this.visual[rung].flows.some((f) => f.active && (f.from === id || f.to === id));
  }

  private nodeOf(rung: number, id: string): SceneNode {
    return this.nodeIndex.get(`${rung}:${id}`)!.node;
  }

  private anchorOf(rung: number, id: string): V3 {
    const n = this.nodeOf(rung, id);
    return this.world(rung, anchor(n.kind, n.at, n.scale ?? 1));
  }

  private segmentsOf(rung: number, n: SceneNode): Segment[] {
    const key = `${rung}:${n.id}`;
    let s = this.segCache.get(key);
    if (!s) {
      s = primitive(n.kind, this.world(rung, n.at), n.scale ?? 1);
      this.segCache.set(key, s);
    }
    return s;
  }

  private goalFor(rung: number): Camera {
    return cameraFor(this.rungs[rung], this.visual[rung]);
  }

  frame(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    t: number,
    progress: number,
    reduced: boolean,
    fonts: Fonts,
  ): FrameOut {
    const dt = this.lastT ? Math.min(64, t - this.lastT) : 16;
    this.lastT = t;

    // ── camera ──
    const i = Math.min(this.rungs.length - 1, Math.floor(progress));
    const frac = progress - i;
    const travel = i < this.rungs.length - 1 ? clamp01((frac - 0.55) / 0.42) : 0;
    const a = this.goalFor(i);
    let goal = a;
    if (travel > 0) {
      const b = this.goalFor(i + 1);
      const e = easeInOut(travel);
      // Lift the camera through the middle of the journey so the travel reads
      // as a pull-back and descent rather than a slide.
      const lift: V3 = [0, Math.sin(e * Math.PI) * 24, Math.sin(e * Math.PI) * 18];
      goal = { position: add(lerp(a.position, b.position, e), lift), target: lerp(a.target, b.target, e) };
    }
    if (!reduced) {
      const sway = Math.sin(t / 5200) * 0.035;
      const arm = sub(goal.position, goal.target);
      const rot: V3 = [arm[0] * Math.cos(sway) - arm[2] * Math.sin(sway), arm[1], arm[0] * Math.sin(sway) + arm[2] * Math.cos(sway)];
      goal = { position: add(goal.target, rot), target: goal.target };
    }
    if (!this.cam || reduced) this.cam = goal;
    else {
      const k = 1 - Math.exp(-dt / 260);
      this.cam = { position: lerp(this.cam.position, goal.position, k), target: lerp(this.cam.target, goal.target, k) };
    }
    const portrait = w / h < 0.9;
    const view = viewOf(fitCamera(this.cam, w, h), w, h, viewCentre(w, h));

    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    this.ground(ctx, view);

    // ── nodes ──
    const labels: { p: Projected; text: string; alpha: number }[] = [];
    this.rungs.forEach((r, ri) => {
      const v = this.visual[ri];
      for (const n of r.scene.nodes) {
        const key = `${ri}:${n.id}`;
        const want = ALPHA[v.nodes[n.id]];
        const have = this.nodeAlpha.get(key) ?? want;
        const alpha = reduced ? want : have + (want - have) * (1 - Math.exp(-dt / 420));
        this.nodeAlpha.set(key, alpha);
        if (alpha < 0.01) continue;
        const dark = v.nodes[n.id] === "dark";
        const hot = v.nodes[n.id] === "hot";
        ctx.setLineDash(dark ? [2, 4] : []);
        ctx.lineWidth = 1;
        let depthSum = 0, count = 0;
        for (const [p0, p1] of this.segmentsOf(ri, n)) {
          const s = this.clip(p0, p1, view);
          if (!s) continue;
          const d = (s[0].depth + s[1].depth) / 2;
          depthSum += d;
          count++;
          ctx.strokeStyle = `rgba(255,255,255,${(alpha * fade(d)).toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(s[0].x, s[0].y);
          ctx.lineTo(s[1].x, s[1].y);
          ctx.stroke();
        }
        ctx.setLineDash([]);
        if (count === 0) continue;
        const f = fade(depthSum / count);
        if (hot && !reduced) {
          // A breathing ring on the ground under whatever matters right now.
          const base = this.world(ri, n.at);
          const pulse = 0.5 + 0.5 * Math.sin(t / 700);
          this.ringOnGround(ctx, base, 0.9 + pulse * 0.5, view, 0.35 * f * (1 - pulse * 0.6));
        }
        if (n.label && (!portrait || hot || this.inActiveFlow(ri, n.id))) {
          // A phone screen has no room for every name; it gets the ones the
          // current step is about.
          const ap = project(this.anchorOf(ri, n.id), view);
          if (ap) labels.push({ p: ap, text: n.label, alpha: Math.min(1, alpha * 1.1) * f });
        }
      }
    });

    // ── flows ──
    this.rungs.forEach((r, ri) => {
      for (const flow of this.visual[ri].flows) {
        const pts = [flow.from, ...flow.via, flow.to].map((id) => this.anchorOf(ri, id));
        this.flow(ctx, pts, flow.active, flow.label, t, view, reduced, fonts);
      }
    });

    // ── assets ──
    this.rungs.forEach((r, ri) => {
      const v = this.visual[ri];
      const slots = new Map<string, number>();
      for (const asset of r.scene.assets) {
        for (const place of v.assets[asset.id] ?? []) {
          const slot = slots.get(place.on) ?? 0;
          slots.set(place.on, slot + 1);
          const nodeAlpha = this.nodeAlpha.get(`${ri}:${place.on}`) ?? 0;
          if (nodeAlpha < 0.05 && !place.copy) continue;
          const dest = this.anchorOf(ri, place.on);
          const anim = this.assetAnim.get(`${ri}:${asset.id}:${place.on}`);
          let pos = dest;
          let k = 1;
          if (anim && !reduced) {
            k = easeOut(clamp01((t - anim.t0) / 1500));
            if (k >= 1) this.assetAnim.delete(`${ri}:${asset.id}:${place.on}`);
            else pos = add(lerp(anim.from, dest, k), [0, Math.sin(k * Math.PI) * 2.2, 0]);
          }
          const p = project(pos, view);
          if (!p) continue;
          const f = fade(p.depth);
          // The list hangs below and to the right of the anchor so it never
          // runs into the label that sits above it.
          const x = p.x + 14 * k;
          const y = p.y + 8 + slot * 13 * k;
          const alpha = (0.85 * f).toFixed(3);
          ctx.setLineDash([]);
          ctx.lineWidth = 1;
          if (place.copy) {
            ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
            ctx.strokeRect(x - 2, y - 2, 4, 4);
          } else {
            ctx.fillStyle = `rgba(255,255,255,${alpha})`;
            ctx.fillRect(x - 2, y - 2, 4, 4);
          }
          // On a phone only the assets in play get names: what is stolen,
          // and what sits on the node the step is about.
          if (portrait && !place.copy && v.nodes[place.on] !== "hot") continue;
          ctx.font = `400 10px ${fonts.mono}`;
          ctx.textBaseline = "middle";
          ctx.textAlign = "left";
          ctx.fillStyle = `rgba(255,255,255,${(0.62 * f).toFixed(3)})`;
          ctx.fillText(asset.label, x + 8, y);
        }
      }
    });

    // ── labels last, over everything ──
    ctx.font = `500 10px ${fonts.mono}`;
    ctx.textBaseline = "bottom";
    ctx.textAlign = "center";
    for (const l of labels) {
      ctx.fillStyle = `rgba(255,255,255,${(l.alpha * 0.9).toFixed(3)})`;
      ctx.fillText(l.text.toUpperCase(), l.p.x, l.p.y - 8);
    }

    // The button belongs to whichever rung the panel is showing: this one
    // until the flight is over half done, the next one after. It is hidden
    // mid-flight and shown at either end, so a scroll that stops a fraction
    // short of a rung still gets its button.
    const arrived = travel >= 1 - 1e-6;
    const ci = arrived ? i + 1 : i;
    const ctaP = project(this.anchorOf(ci, this.rungs[ci].scene.ctaNode), view);
    return { cta: ctaP && (travel === 0 || arrived) ? { x: ctaP.x, y: ctaP.y } : null };
  }

  // Clip a world segment to the near plane, then project. Long ground lines
  // cross behind the camera all the time; dropping them whole leaves holes.
  private clip(a: V3, b: V3, v: View): [Projected, Projected] | null {
    const da = sub(a, v.position), db = sub(b, v.position);
    const za = da[0] * v.forward[0] + da[1] * v.forward[1] + da[2] * v.forward[2];
    const zb = db[0] * v.forward[0] + db[1] * v.forward[1] + db[2] * v.forward[2];
    if (za < NEAR && zb < NEAR) return null;
    let p0 = a, p1 = b;
    if (za < NEAR) p0 = lerp(a, b, (NEAR - za) / (zb - za));
    if (zb < NEAR) p1 = lerp(a, b, (NEAR - za) / (zb - za));
    const s0 = project(p0, v), s1 = project(p1, v);
    return s0 && s1 ? [s0, s1] : null;
  }

  private ground(ctx: CanvasRenderingContext2D, view: View) {
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    const step = 5;
    for (let x = -40; x <= 140; x += step) {
      const s = this.clip([x, 0, -70], [x, 0, 40], view);
      if (!s) continue;
      const d = Math.min(s[0].depth, s[1].depth);
      ctx.strokeStyle = `rgba(255,255,255,${(0.11 * fade(d)).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(s[0].x, s[0].y);
      ctx.lineTo(s[1].x, s[1].y);
      ctx.stroke();
    }
    for (let z = -70; z <= 40; z += step) {
      const s = this.clip([-40, 0, z], [140, 0, z], view);
      if (!s) continue;
      const d = Math.min(s[0].depth, s[1].depth);
      ctx.strokeStyle = `rgba(255,255,255,${(0.11 * fade(d)).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(s[0].x, s[0].y);
      ctx.lineTo(s[1].x, s[1].y);
      ctx.stroke();
    }
  }

  private ringOnGround(ctx: CanvasRenderingContext2D, c: V3, r: number, view: View, alpha: number) {
    ctx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
    ctx.beginPath();
    let first = true;
    for (let k = 0; k <= 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const p = project([c[0] + Math.cos(a) * r, c[1] + 0.01, c[2] + Math.sin(a) * r], view);
      if (!p) return;
      if (first) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
      first = false;
    }
    ctx.stroke();
  }

  private flow(
    ctx: CanvasRenderingContext2D,
    pts: V3[],
    active: boolean,
    label: string | undefined,
    t: number,
    view: View,
    reduced: boolean,
    fonts: Fonts,
  ) {
    // Lift the line a little above the anchors so it reads as travelling
    // between things rather than through them.
    const lifted = pts.map((p, i) => (i === 0 || i === pts.length - 1 ? p : add(p, [0, 0.8, 0])));
    const proj = lifted.map((p) => project(p, view));
    if (proj.some((p) => !p)) return;
    const sp = proj as Projected[];
    const depth = sp.reduce((s, p) => s + p.depth, 0) / sp.length;
    const f = fade(depth);
    ctx.lineWidth = 1;
    if (active) {
      ctx.setLineDash([3, 7]);
      ctx.lineDashOffset = reduced ? 0 : -((t * 0.035) % 10);
      ctx.strokeStyle = `rgba(255,255,255,${(0.75 * f).toFixed(3)})`;
    } else {
      ctx.setLineDash([]);
      ctx.strokeStyle = `rgba(255,255,255,${(0.14 * f).toFixed(3)})`;
    }
    ctx.beginPath();
    ctx.moveTo(sp[0].x, sp[0].y);
    for (let i = 1; i < sp.length; i++) ctx.lineTo(sp[i].x, sp[i].y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;

    if (!active) return;

    // Packets: two dots running the polyline by 3D arc length.
    const lens: number[] = [];
    let total = 0;
    for (let i = 1; i < lifted.length; i++) {
      const d = sub(lifted[i], lifted[i - 1]);
      const l = Math.hypot(d[0], d[1], d[2]);
      lens.push(l);
      total += l;
    }
    const at = (s: number): V3 => {
      let dist = s * total;
      for (let i = 0; i < lens.length; i++) {
        if (dist <= lens[i] || i === lens.length - 1) return lerp(lifted[i], lifted[i + 1], lens[i] ? dist / lens[i] : 0);
        dist -= lens[i];
      }
      return lifted[lifted.length - 1];
    };
    const packets = reduced ? [0.5] : [(t / 1700) % 1, (t / 1700 + 0.5) % 1];
    for (const s of packets) {
      const p = project(at(s), view);
      if (!p) continue;
      ctx.fillStyle = `rgba(255,255,255,${(0.95 * f).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    if (label) {
      const m = project(at(0.5), view);
      if (m) {
        // Below the line: node labels live above their anchors, so a flow
        // label above its line is the one that collides with them.
        ctx.font = `400 10px ${fonts.mono}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = `rgba(255,255,255,${(0.7 * f).toFixed(3)})`;
        ctx.fillText(label, m.x, m.y + 7);
      }
    }
  }
}
