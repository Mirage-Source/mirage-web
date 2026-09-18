// Procedural, lit versions of the wireframe primitives: "white clay at dusk".
// Every object is built from three.js primitives so a new scene needs no
// model file, and every mesh keeps a faint edge overlay so it still reads as
// a blueprint over the desert. Sizes match geometry.ts so anchors, camera
// framing and the framing measurement stay valid.

import * as THREE from "three";

import type { NodeKind } from "./types.ts";

export const CLAY = 0xe8e2d6;
export const CLAY_DARK = 0x3a332c;
const SCREEN = 0xfff4e0;

export interface Built {
  group: THREE.Group;
  // Everything whose opacity fades with node state and distance.
  materials: THREE.Material[];
  // Standard materials, for emissive glow on hot/hover.
  lit: THREE.MeshStandardMaterial[];
  // Emissive screens and status lights, for idle flicker.
  screens: THREE.MeshStandardMaterial[];
  // The swarm's instances, for idle drift and density.
  instanced: THREE.InstancedMesh | null;
}

// A little tooth on the clay so large flat faces do not read as vector-flat:
// a 64px noise tile as a bump map, shared by every material.
let grain: THREE.DataTexture | null = null;
function grainMap(): THREE.DataTexture {
  if (grain) return grain;
  const n = 64;
  const data = new Uint8Array(n * n);
  let seed = 1234;
  for (let i = 0; i < data.length; i++) {
    seed = (seed * 9301 + 49297) % 233280;
    data[i] = 96 + Math.floor((seed / 233280) * 64);
  }
  grain = new THREE.DataTexture(data, n, n, THREE.RedFormat);
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  grain.repeat.set(3, 3);
  grain.needsUpdate = true;
  return grain;
}

function clay(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: CLAY, roughness: 0.92, metalness: 0, transparent: true, bumpMap: grainMap(), bumpScale: 0.35,
  });
}
function screen(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x2a2520, emissive: SCREEN, emissiveIntensity: 0.55, roughness: 1, transparent: true,
  });
}
function edgeMat(): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
}

class Builder {
  group = new THREE.Group();
  materials: THREE.Material[] = [];
  lit: THREE.MeshStandardMaterial[] = [];
  screens: THREE.MeshStandardMaterial[] = [];
  instanced: THREE.InstancedMesh | null = null;
  constructor(private s: number) {}

  mesh(geom: THREE.BufferGeometry, x: number, y: number, z: number, mat = clay(), edges = true, rot?: [number, number, number]) {
    const m = new THREE.Mesh(geom, mat);
    m.position.set(x * this.s, y * this.s, z * this.s);
    m.scale.setScalar(this.s);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    this.group.add(m);
    this.materials.push(mat);
    if (mat instanceof THREE.MeshStandardMaterial) {
      if (mat.emissiveIntensity > 0 && mat.emissive.getHex() === SCREEN) this.screens.push(mat);
      else {
        this.lit.push(mat);
        m.castShadow = true;
        m.receiveShadow = true;
      }
    }
    if (edges) {
      const em = edgeMat();
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(geom, 25), em);
      e.position.copy(m.position);
      e.scale.copy(m.scale);
      if (rot) e.rotation.copy(m.rotation);
      this.group.add(e);
      this.materials.push(em);
    }
    return m;
  }
  box(w: number, h: number, d: number, x: number, y: number, z: number, mat?: THREE.MeshStandardMaterial, edges = true, rot?: [number, number, number]) {
    return this.mesh(new THREE.BoxGeometry(w, h, d), x, y, z, mat, edges, rot);
  }
  capsule(r: number, len: number, x: number, y: number, z: number, rot?: [number, number, number]) {
    return this.mesh(new THREE.CapsuleGeometry(r, len, 3, 8), x, y, z, clay(), false, rot);
  }
  ring(r: number, y: number, tube = 0.03, x = 0, z = 0, rot: [number, number, number] = [Math.PI / 2, 0, 0]) {
    return this.mesh(new THREE.TorusGeometry(r, tube, 6, 28), x, y, z, clay(), false, rot);
  }
  // Hairline circle, for globes: a line loop rather than a tube.
  circle(r: number, cx: number, cy: number, cz: number, axis: "x" | "y" | "z", n = 40) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const u = Math.cos(a) * r, v = Math.sin(a) * r;
      pts.push(
        axis === "y" ? new THREE.Vector3(cx + u, cy, cz + v)
        : axis === "x" ? new THREE.Vector3(cx, cy + u, cz + v)
        : new THREE.Vector3(cx + u, cy + v, cz),
      );
    }
    const m = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), m);
    line.scale.setScalar(this.s);
    this.group.add(line);
    this.materials.push(m);
  }
  done(): Built {
    return { group: this.group, materials: this.materials, lit: this.lit, screens: this.screens, instanced: this.instanced };
  }
}

function figure(b: Builder, ox: number, seated: boolean, phoneHand: boolean) {
  // Proportions of a ~1.8 unit figure; y is up, feet at 0.
  b.mesh(new THREE.SphereGeometry(0.15, 14, 10), ox, seated ? 1.32 : 1.62, 0, clay(), false);
  b.capsule(0.05, 0.08, ox, seated ? 1.16 : 1.46, 0);                       // neck
  b.capsule(0.17, 0.42, ox, seated ? 0.86 : 1.13, 0);                       // torso
  const sy = seated ? 0.86 : 1.13;
  // arms
  b.capsule(0.055, 0.34, ox - 0.24, sy - 0.02, 0.02, [0, 0, 0.35]);
  if (phoneHand) {
    b.capsule(0.055, 0.2, ox + 0.2, sy + 0.02, 0.12, [0.5, 0, -0.7]);
    b.capsule(0.05, 0.18, ox + 0.24, sy + 0.16, 0.26, [-1.1, 0, -0.2]);
  } else if (seated) {
    b.capsule(0.055, 0.32, ox + 0.14, sy - 0.1, 0.24, [-1.2, 0, -0.3]);   // forward, on the desk
  } else {
    b.capsule(0.055, 0.34, ox + 0.24, sy - 0.02, 0.02, [0, 0, -0.35]);
  }
  // legs
  if (seated) {
    b.capsule(0.075, 0.3, ox - 0.1, 0.55, 0.22, [1.35, 0, 0]);
    b.capsule(0.075, 0.3, ox + 0.1, 0.55, 0.22, [1.35, 0, 0]);
    b.capsule(0.07, 0.34, ox - 0.1, 0.26, 0.4);
    b.capsule(0.07, 0.34, ox + 0.1, 0.26, 0.4);
  } else {
    b.capsule(0.075, 0.5, ox - 0.11, 0.38, 0, [0, 0, 0.08]);
    b.capsule(0.075, 0.5, ox + 0.11, 0.38, 0, [0, 0, -0.08]);
  }
}

function seeded(n: number) {
  let s = n * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

export function buildShape(kind: NodeKind, s: number): Built {
  const b = new Builder(s);
  switch (kind) {
    case "figure":
      figure(b, 0, false, true);
      break;
    case "attacker": {
      figure(b, -0.55, true, false);
      b.box(0.9, 0.06, 0.6, 0.25, 0.68, 0);                                    // desk top
      b.box(0.06, 0.66, 0.06, -0.15, 0.34, -0.25, undefined, false);           // legs
      b.box(0.06, 0.66, 0.06, 0.65, 0.34, -0.25, undefined, false);
      b.box(0.06, 0.66, 0.06, -0.15, 0.34, 0.25, undefined, false);
      b.box(0.06, 0.66, 0.06, 0.65, 0.34, 0.25, undefined, false);
      b.box(0.62, 0.03, 0.42, 0.25, 0.73, 0);                                  // laptop base
      b.box(0.62, 0.42, 0.02, 0.25, 0.95, -0.22, undefined, true, [-0.28, 0, 0]);
      b.box(0.54, 0.34, 0.005, 0.25, 0.95, -0.205, screen(), false, [-0.28, 0, 0]);
      break;
    }
    case "phone":
      b.box(0.5, 1, 0.06, 0, 0.5, 0);
      b.box(0.42, 0.84, 0.005, 0, 0.52, 0.033, screen(), false);
      break;
    case "router":
      b.box(1.3, 0.32, 0.9, 0, 0.16, 0);
      b.mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.8, 8), -0.45, 0.72, -0.3, clay(), false, [0.12, 0, 0.12]);
      b.mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.8, 8), 0.45, 0.72, -0.3, clay(), false, [0.12, 0, -0.12]);
      b.box(0.08, 0.04, 0.02, -0.45, 0.2, 0.46, screen(), false);
      break;
    case "tower": {
      const h = 6, bb = 0.9, t = 0.25;
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
        const x0 = sx * bb, z0 = sz * bb, x1 = sx * t, z1 = sz * t;
        const len = Math.hypot(x1 - x0, h, z1 - z0);
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, len, 6), clay());
        leg.position.set(((x0 + x1) / 2) * s, (h / 2) * s, ((z0 + z1) / 2) * s);
        leg.scale.setScalar(s);
        leg.lookAt(new THREE.Vector3(x1 * s, h * s, z1 * s));
        leg.rotateX(Math.PI / 2);
        leg.castShadow = true;
        b.group.add(leg);
        b.materials.push(leg.material as THREE.Material);
        b.lit.push(leg.material as THREE.MeshStandardMaterial);
      }
      for (let i = 1; i <= 4; i++) {
        const k = i / 5, w = bb + (t - bb) * k;
        b.mesh(new THREE.BoxGeometry(w * 2, 0.04, w * 2), 0, h * k, 0, clay(), true);
      }
      b.ring(0.7, h + 0.3, 0.035);
      b.ring(0.45, h + 0.9, 0.03);
      b.mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.3, 6), 0, h + 0.65, 0, clay(), false);
      break;
    }
    case "globe": {
      const r = 2.2;
      const glass = new THREE.MeshStandardMaterial({ color: CLAY, roughness: 1, transparent: true, opacity: 0.16 });
      const sphere = b.mesh(new THREE.SphereGeometry(r, 28, 18), 0, 2.2, 0, glass, false);
      // Glass: no shadow, or the haze of the internet lands as a solid disc.
      sphere.castShadow = false;
      sphere.receiveShadow = false;
      b.circle(r, 0, 2.2, 0, "y");
      b.circle(r, 0, 2.2, 0, "x");
      b.circle(r, 0, 2.2, 0, "z");
      b.circle(r * 0.83, 0, 2.2 + r * 0.55, 0, "y");
      b.circle(r * 0.83, 0, 2.2 - r * 0.55, 0, "y");
      break;
    }
    case "server": {
      b.box(1.1, 1.8, 1.1, 0, 0.9, 0);
      const dark = new THREE.MeshStandardMaterial({ color: CLAY_DARK, roughness: 1, transparent: true });
      for (let i = 1; i <= 4; i++) b.box(0.9, 0.12, 0.04, 0, i * 0.36, 0.55, dark, false);
      for (let i = 1; i <= 4; i++) b.box(0.05, 0.05, 0.02, 0.38, i * 0.36 + 0.12, 0.56, screen(), false);
      break;
    }
    case "rack": {
      b.box(1.4, 2.6, 1.0, 0, 1.3, 0);
      const dark = new THREE.MeshStandardMaterial({ color: CLAY_DARK, roughness: 1, transparent: true });
      for (let i = 1; i <= 7; i++) b.box(1.2, 0.1, 0.04, 0, i * 0.32, 0.5, dark, false);
      break;
    }
    case "building": {
      const w = 7, h = 5.4, d = 4.5;
      b.box(w, h, d, 0, h / 2, 0);
      for (let f = 0; f < 4; f++) for (let c = 0; c < 6; c++) {
        b.box(0.5, 0.55, 0.01, -w / 2 + 0.85 + c * 1.06, 0.8 + f * 1.25, d / 2 + 0.006, screen(), false);
      }
      b.box(1.4, 0.7, 1.1, 0, h + 0.35, -0.9);
      break;
    }
    case "laptop":
      b.box(1.2, 0.06, 0.8, 0, 0.03, 0);
      b.box(1.2, 0.82, 0.03, 0, 0.45, -0.5, undefined, true, [-0.28, 0, 0]);
      b.box(1.06, 0.68, 0.005, 0, 0.45, -0.48, screen(), false, [-0.28, 0, 0]);
      break;
    case "swarm": {
      const rnd = seeded(7);
      const mat = clay();
      const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), mat, 26);
      const m = new THREE.Matrix4();
      for (let i = 0; i < 26; i++) {
        const a = rnd() * Math.PI * 2, r = 0.6 + rnd() * 3.2, yy = 0.2 + rnd() * 3;
        m.makeRotationY(a * 3);
        m.setPosition(Math.cos(a) * r * s, yy * s, Math.sin(a) * r * s);
        inst.setMatrixAt(i, m);
      }
      inst.scale.setScalar(s);
      inst.castShadow = true;
      b.group.add(inst);
      b.materials.push(mat);
      b.lit.push(mat);
      b.instanced = inst;
      break;
    }
    case "cards":
      for (let i = 0; i < 4; i++) b.box(1.5, 0.05, 1.0, i * 0.12, 0.05 + i * 0.16, -i * 0.1);
      break;
  }
  return b.done();
}
