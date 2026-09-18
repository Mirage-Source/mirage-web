// A wireframe world: nodes are hairline primitives in a right-handed space
// with y up, projected through a pinhole camera onto the canvas. Nothing here
// knows about React or the DOM.

import type { Camera, NodeKind, V3 } from "./types.ts";

export type Segment = [V3, V3];

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const lerp = (a: V3, b: V3, t: number): V3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

export interface View {
  position: V3;
  right: V3;
  up: V3;
  forward: V3;
  // Focal length in pixels for the vertical field of view.
  f: number;
  cx: number;
  cy: number;
}

const FOV_DEG = 34;

// `centre` is where the camera target lands on the canvas. The story panel
// sits bottom-left, so the scene is framed off-centre rather than the panel
// covering it.
export function viewOf(cam: Camera, w: number, h: number, centre: [number, number] = [w / 2, h / 2]): View {
  const forward = norm(sub(cam.target, cam.position));
  const right = norm(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  // Portrait viewports get a wider field so the same framing still fits.
  const aspect = w / h;
  const fov = (FOV_DEG * (aspect < 1 ? 1 + (1 - aspect) * 0.8 : 1) * Math.PI) / 180;
  return { position: cam.position, right, up, forward, f: h / 2 / Math.tan(fov / 2), cx: centre[0], cy: centre[1] };
}

export interface Projected {
  x: number;
  y: number;
  depth: number;
}

export function project(p: V3, v: View): Projected | null {
  const d = sub(p, v.position);
  const z = dot(d, v.forward);
  if (z < 0.05) return null;
  return {
    x: v.cx + (dot(d, v.right) * v.f) / z,
    y: v.cy - (dot(d, v.up) * v.f) / z,
    depth: z,
  };
}

// ── primitives ──────────────────────────────────────────────────────────────
// Each returns segments in world space for a node standing on the ground at
// `at`, scaled by `s`. Authored in unit-ish sizes; a figure is ~1.8 tall.

function box(c: V3, sx: number, sy: number, sz: number): Segment[] {
  const x0 = c[0] - sx / 2, x1 = c[0] + sx / 2;
  const y0 = c[1] - sy / 2, y1 = c[1] + sy / 2;
  const z0 = c[2] - sz / 2, z1 = c[2] + sz / 2;
  const p = (x: number, y: number, z: number): V3 => [x, y, z];
  return [
    [p(x0, y0, z0), p(x1, y0, z0)], [p(x1, y0, z0), p(x1, y0, z1)], [p(x1, y0, z1), p(x0, y0, z1)], [p(x0, y0, z1), p(x0, y0, z0)],
    [p(x0, y1, z0), p(x1, y1, z0)], [p(x1, y1, z0), p(x1, y1, z1)], [p(x1, y1, z1), p(x0, y1, z1)], [p(x0, y1, z1), p(x0, y1, z0)],
    [p(x0, y0, z0), p(x0, y1, z0)], [p(x1, y0, z0), p(x1, y1, z0)], [p(x1, y0, z1), p(x1, y1, z1)], [p(x0, y0, z1), p(x0, y1, z1)],
  ];
}

function ring(c: V3, r: number, axis: "x" | "y" | "z", n = 16): Segment[] {
  const pts: V3[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const u = Math.cos(a) * r, v = Math.sin(a) * r;
    pts.push(axis === "y" ? [c[0] + u, c[1], c[2] + v] : axis === "x" ? [c[0], c[1] + u, c[2] + v] : [c[0] + u, c[1] + v, c[2]]);
  }
  return pts.map((p, i) => [p, pts[(i + 1) % n]] as Segment);
}

function figure(at: V3, s: number, phoneHand: boolean): Segment[] {
  const [x, y, z] = at;
  const p = (dx: number, dy: number, dz: number): V3 => [x + dx * s, y + dy * s, z + dz * s];
  const segs: Segment[] = [
    ...ring(p(0, 1.62, 0), 0.16 * s, "z", 10),
    [p(0, 1.46, 0), p(0, 0.86, 0)],           // spine
    [p(0, 0.86, 0), p(-0.18, 0, 0)],          // legs
    [p(0, 0.86, 0), p(0.18, 0, 0)],
    [p(0, 1.4, 0), p(-0.26, 0.95, 0.05)],     // left arm down
  ];
  if (phoneHand) {
    segs.push([p(0, 1.4, 0), p(0.24, 1.08, 0.18)], [p(0.24, 1.08, 0.18), p(0.2, 1.3, 0.32)]);
  } else {
    segs.push([p(0, 1.4, 0), p(0.26, 0.95, 0.05)]);
  }
  return segs;
}

function seeded(n: number) {
  let s = n * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

export function primitive(kind: NodeKind, at: V3, s: number): Segment[] {
  const [x, y, z] = at;
  const c = (dx: number, dy: number, dz: number): V3 => [x + dx * s, y + dy * s, z + dz * s];
  switch (kind) {
    case "figure":
      return figure(at, s, true);
    case "attacker": {
      // A seated figure at a laptop: the laptop is the point.
      return [
        ...figure([x - 0.55 * s, y, z], s * 0.9, false),
        ...box(c(0.25, 0.35, 0), 0.9 * s, 0.7 * s, 0.6 * s),
        ...box(c(0.25, 0.73, 0), 0.62 * s, 0.03 * s, 0.42 * s),
        [c(0.25 - 0.31, 0.75, -0.21), c(0.25 - 0.31, 1.15, -0.32)],
        [c(0.25 + 0.31, 0.75, -0.21), c(0.25 + 0.31, 1.15, -0.32)],
        [c(0.25 - 0.31, 1.15, -0.32), c(0.25 + 0.31, 1.15, -0.32)],
      ];
    }
    case "phone":
      return [
        ...box(c(0, 0.5, 0), 0.5 * s, 1 * s, 0.06 * s),
        ...box(c(0, 0.52, 0.035), 0.4 * s, 0.8 * s, 0.001 * s).slice(0, 4),
      ];
    case "router":
      return [
        ...box(c(0, 0.16, 0), 1.3 * s, 0.32 * s, 0.9 * s),
        [c(-0.4, 0.32, -0.3), c(-0.5, 1.1, -0.35)],
        [c(0.4, 0.32, -0.3), c(0.5, 1.1, -0.35)],
      ];
    case "tower": {
      const h = 6 * s, b = 0.9 * s, t = 0.25 * s;
      const legs: Segment[] = [
        [c(-b, 0, -b), c(-t, h, -t)], [c(b, 0, -b), c(t, h, -t)],
        [c(b, 0, b), c(t, h, b / b * t)], [c(-b, 0, b), c(-t, h, t)],
      ];
      const braces: Segment[] = [];
      for (let i = 1; i <= 4; i++) {
        const k = i / 5;
        const w = b + (t - b) * k;
        const yy = h * k;
        braces.push([c(-w, yy, -w), c(w, yy, -w)], [c(w, yy, -w), c(w, yy, w)], [c(w, yy, w), c(-w, yy, w)], [c(-w, yy, w), c(-w, yy, -w)]);
      }
      return [...legs, ...braces, ...ring(c(0, h + 0.3, 0), 0.7 * s, "y", 12), ...ring(c(0, h + 0.9, 0), 0.45 * s, "y", 10), [c(0, h, 0), c(0, h + 1.3, 0)]];
    }
    case "globe": {
      const r = 2.2 * s;
      const cc = c(0, 2.2, 0);
      return [...ring(cc, r, "y", 20), ...ring(cc, r, "x", 20), ...ring(cc, r, "z", 20), ...ring([cc[0], cc[1] + r * 0.55, cc[2]], r * 0.83, "y", 16), ...ring([cc[0], cc[1] - r * 0.55, cc[2]], r * 0.83, "y", 16)];
    }
    case "server": {
      const segs = box(c(0, 0.9, 0), 1.1 * s, 1.8 * s, 1.1 * s);
      for (let i = 1; i <= 4; i++) segs.push([c(-0.55, i * 0.36, 0.55), c(0.55, i * 0.36, 0.55)]);
      return segs;
    }
    case "rack": {
      const segs = box(c(0, 1.3, 0), 1.4 * s, 2.6 * s, 1.0 * s);
      for (let i = 1; i <= 7; i++) segs.push([c(-0.7, i * 0.32, 0.5), c(0.7, i * 0.32, 0.5)]);
      return segs;
    }
    case "building": {
      const w = 7 * s, h = 5.4 * s, d = 4.5 * s;
      const segs = box(c(0, h / 2, 0), w, h, d);
      for (let i = 1; i < 4; i++) {
        const yy = (h * i) / 4;
        segs.push([c(-w / 2, yy, d / 2), c(w / 2, yy, d / 2)], [c(w / 2, yy, d / 2), c(w / 2, yy, -d / 2)]);
      }
      for (let i = 1; i < 7; i++) segs.push([c(-w / 2 + (w * i) / 7, 0.3, d / 2), c(-w / 2 + (w * i) / 7, h - 0.3, d / 2)]);
      segs.push(...box(c(0, h + 0.35, -0.9), 1.4 * s, 0.7 * s, 1.1 * s));
      return segs;
    }
    case "laptop":
      return [
        ...box(c(0, 0.03, 0), 1.2 * s, 0.06 * s, 0.8 * s),
        [c(-0.6, 0.06, -0.4), c(-0.6, 0.85, -0.62)], [c(0.6, 0.06, -0.4), c(0.6, 0.85, -0.62)], [c(-0.6, 0.85, -0.62), c(0.6, 0.85, -0.62)],
      ];
    case "swarm": {
      const rnd = seeded(7);
      const segs: Segment[] = [];
      for (let i = 0; i < 26; i++) {
        const a = rnd() * Math.PI * 2, r = 0.6 + rnd() * 3.2, yy = 0.2 + rnd() * 3;
        const p = c(Math.cos(a) * r, yy, Math.sin(a) * r);
        segs.push(...box(p, 0.22 * s, 0.22 * s, 0.22 * s).slice(0, 8));
      }
      return segs;
    }
    case "cards": {
      const segs: Segment[] = [];
      for (let i = 0; i < 4; i++) segs.push(...box(c(i * 0.12, 0.05 + i * 0.16, -i * 0.1), 1.5 * s, 0.05 * s, 1.0 * s));
      return segs;
    }
  }
}

// Where a flow attaches and where a label hangs: roughly the top of the thing.
export function anchor(kind: NodeKind, at: V3, s: number): V3 {
  const top: Record<NodeKind, number> = {
    figure: 1.85, attacker: 1.35, phone: 1.05, router: 1.15, tower: 7.4, globe: 4.5,
    server: 1.9, rack: 2.7, building: 5.9, laptop: 0.95, swarm: 3.4, cards: 0.8,
  };
  return [at[0], at[1] + top[kind] * s, at[2]];
}

export function centre(kind: NodeKind, at: V3, s: number): V3 {
  const a = anchor(kind, at, s);
  return [at[0], at[1] + (a[1] - at[1]) * 0.55, at[2]];
}
