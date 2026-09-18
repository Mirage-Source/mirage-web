// The lit renderer: three.js scene of procedural clay objects, with labels
// and asset lists drawn on a 2D overlay canvas so text stays crisp. Same
// scene data, same camera math and same interaction surface as the hairline
// renderer in render.ts; only the picture differs.

import * as THREE from "three";

import type { VisualState } from "./engine.ts";
import { add, anchor, centre, lerp } from "./geometry.ts";
import { layoutLabels, type LabelIn } from "./labels.ts";
import { cameraFor, fitCamera, flightCamera, nearest, orbitCamera, viewCentre, type Hit } from "./render.ts";
import type { Fonts, FrameOut, Renderer } from "./renderer.ts";
import type { Rung } from "./scenes/index.ts";
import { CLAY, CLAY_DARK, buildShape, type Built } from "./shapes3d.ts";
import type { Camera, NodeState, SceneNode, V3 } from "./types.ts";

const ALPHA: Record<NodeState, number> = { hidden: 0, dim: 0.22, normal: 1, hot: 1, dark: 0.85 };
const FOV_DEG = 34;
const FOG = 0x5e5248;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
const fade = (depth: number) => clamp01(1 - (depth - 22) / 90);
const v3 = (p: V3) => new THREE.Vector3(p[0], p[1], p[2]);

interface NodeObj {
  key: string;
  rung: number;
  node: SceneNode;
  built: Built;
  alpha: number;
  base: V3;
  centre: V3;
  radius: number;
  ring: THREE.Mesh;
  previewRing: THREE.Mesh;
  // For the entrance: when the object last became visible.
  wasVisible: boolean;
  enterT0: number;
  swarmBase: THREE.Matrix4[] | null;
}

interface Packet {
  head: THREE.Mesh;
  tail: THREE.Mesh[];
  lastS: number;
}

interface FlowObj {
  line: THREE.Line;
  lineMat: THREE.LineBasicMaterial;
  packets: Packet[];
  curve: THREE.CatmullRomCurve3;
  active: boolean;
  label?: string;
}

interface AssetObj {
  mesh: THREE.Object3D;
  mats: THREE.Material[];
  from: V3 | null;
  t0: number;
  slot: number;
  on: string;
  copy: boolean;
  label: string;
}

interface Flash {
  mesh: THREE.Mesh;
  t0: number;
}

export class WorldRenderer3D implements Renderer {
  private rungs: Rung[];
  private visual: VisualState[];
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV_DEG, 1, 0.1, 500);
  private gl: THREE.WebGLRenderer | null = null;
  private overlay: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private W = 1;
  private H = 1;
  private DPR = 1;
  private nodes = new Map<string, NodeObj>();
  private flows: FlowObj[][] = [];
  private assets = new Map<string, AssetObj>();
  private flashes: Flash[] = [];
  private cam: Camera | null = null;
  private lastT = 0;
  private orbit = { yaw: 0, pitch: 0 };
  private dragging = false;
  private hover: string | null = null;
  private focus: string | null = null;
  private preview = new Set<string>();
  private hits = new Map<string, Hit>();
  private activity = 0.5;
  private sun = new THREE.DirectionalLight(0xffe2bf, 3.2);
  private ringGeom = new THREE.TorusGeometry(1, 0.025, 6, 40);
  private packetGeom = new THREE.SphereGeometry(0.1, 8, 6);
  private packetMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
  private flashGeom = new THREE.RingGeometry(0.27, 0.3, 28);
  private assetGeom = new THREE.BoxGeometry(0.26, 0.26, 0.26);
  private tmp = new THREE.Vector3();
  private gridMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uCentre: { value: new THREE.Vector3() }, uRadius: { value: 46 } },
    vertexShader: `
      varying vec3 vPos;
      void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform vec3 uCentre; uniform float uRadius; varying vec3 vPos;
      void main() {
        float d = distance(vPos.xz, uCentre.xz);
        float a = 0.11 * (1.0 - smoothstep(uRadius * 0.35, uRadius, d));
        gl_FragColor = vec4(1.0, 1.0, 1.0, a);
      }`,
  });
  // A grid that lives under the scene the camera is looking at and fades out
  // around it, rather than an infinite one that piles up on the horizon.
  private grid = (() => {
    const pts: number[] = [];
    for (let x = -60; x <= 200; x += 5) pts.push(x, 0, -110, x, 0, 60);
    for (let z = -110; z <= 60; z += 5) pts.push(-60, 0, z, 200, 0, z);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return new THREE.LineSegments(g, this.gridMat);
  })();

  constructor(rungs: Rung[], visuals: VisualState[]) {
    this.rungs = rungs;
    this.visual = visuals.slice();
    this.flows = rungs.map(() => []);

    // Dusk: a warm key light from low on the camera's side, so the faces the
    // reader sees are the lit ones, a cool sky fill, and a faint rim from
    // behind so silhouettes separate from the sand. The key casts the one
    // shadow map; its frustum follows the camera target each frame.
    this.scene.add(new THREE.HemisphereLight(0xcfd6d8, 0x5a4634, 0.55));
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.near = 5;
    this.sun.shadow.camera.far = 220;
    this.sun.shadow.camera.left = this.sun.shadow.camera.bottom = -34;
    this.sun.shadow.camera.right = this.sun.shadow.camera.top = 34;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    const rim = new THREE.DirectionalLight(0xdde6ea, 0.9);
    rim.position.set(-50, 30, -50);
    this.scene.add(rim);

    // Haze: far things go the colour of the dusk as well as fading out.
    this.scene.fog = new THREE.Fog(FOG, 30, 165);

    // The ground exists only to catch shadows.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(600, 600),
      new THREE.ShadowMaterial({ color: 0x120e0a, opacity: 0.38, transparent: true }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(70, -0.005, -30);
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.scene.add(this.grid);

    rungs.forEach((r, ri) => {
      for (const n of r.scene.nodes) this.addNode(ri, n);
      this.applyStates(ri);
      this.rebuildFlows(ri);
      this.rebuildAssets(ri, null, 0);
    });
  }

  // ── setup ──
  attach(container: HTMLElement) {
    const gl = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    gl.setClearColor(0x000000, 0);
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.35;
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    Object.assign(gl.domElement.style, { position: "absolute", inset: "0", display: "block" });
    container.appendChild(gl.domElement);
    this.gl = gl;
    const overlay = document.createElement("canvas");
    Object.assign(overlay.style, { position: "absolute", inset: "0", display: "block", pointerEvents: "none" });
    container.appendChild(overlay);
    this.overlay = overlay;
    this.ctx = overlay.getContext("2d");
  }

  resize(w: number, h: number, dpr: number) {
    this.W = w;
    this.H = h;
    this.DPR = Math.min(dpr, 2);
    if (this.gl) {
      // The GPU pays per pixel; text does not. 1.5x is indistinguishable from
      // 2x for lit clay and half the fill cost.
      this.gl.setPixelRatio(Math.min(dpr, 1.5));
      this.gl.setSize(w, h, false);
      Object.assign(this.gl.domElement.style, { width: `${w}px`, height: `${h}px` });
    }
    if (this.overlay) {
      this.overlay.width = Math.round(w * this.DPR);
      this.overlay.height = Math.round(h * this.DPR);
      Object.assign(this.overlay.style, { width: `${w}px`, height: `${h}px` });
    }
  }

  dispose() {
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = (m as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    this.gl?.dispose();
    this.gl?.domElement.remove();
    this.overlay?.remove();
  }

  // ── reader-driven state (same surface as the 2D renderer) ──
  nudgeOrbit(dyaw: number, dpitch: number) {
    this.orbit.yaw = Math.max(-1.2, Math.min(1.2, this.orbit.yaw + dyaw));
    this.orbit.pitch = Math.max(-0.6, Math.min(0.6, this.orbit.pitch + dpitch));
  }
  setDragging(on: boolean) { this.dragging = on; }
  setHover(key: string | null) { this.hover = key; }
  setFocus(key: string | null) { this.focus = key; }
  getFocus() { return this.focus; }
  setPreview(keys: Iterable<string>) { this.preview = new Set(keys); }
  hitTest(x: number, y: number) { return nearest(this.hits.values(), x, y); }
  setActivity(level: number) {
    this.activity = clamp01(level);
    this.rungs.forEach((_, ri) => this.rebuildFlows(ri));
  }

  setVisual(rung: number, v: VisualState, now: number) {
    const prev = this.visual[rung];
    this.visual[rung] = v;
    this.applyStates(rung);
    this.rebuildFlows(rung);
    this.rebuildAssets(rung, prev, now);
  }

  // ── scene construction ──
  private world(rung: number, p: V3): V3 {
    return add(p, this.rungs[rung].offset);
  }
  private anchorOf(rung: number, id: string): V3 {
    const n = this.rungs[rung].scene.nodes.find((x) => x.id === id)!;
    return this.world(rung, anchor(n.kind, n.at, n.scale ?? 1));
  }

  private addNode(rung: number, n: SceneNode) {
    const s = n.scale ?? 1;
    const built = buildShape(n.kind, s);
    const at = this.world(rung, n.at);
    built.group.position.set(at[0], at[1], at[2]);
    for (const m of built.materials) m.userData.base = (m as THREE.Material & { opacity: number }).opacity;
    this.scene.add(built.group);

    const box = new THREE.Box3().setFromObject(built.group);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const c = centre(n.kind, n.at, s);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, fog: false });
    const ring = new THREE.Mesh(this.ringGeom, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(at[0], at[1] + 0.02, at[2]);
    this.scene.add(ring);
    const pMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, fog: false });
    const previewRing = new THREE.Mesh(this.ringGeom, pMat);
    previewRing.rotation.x = Math.PI / 2;
    previewRing.position.set(at[0], at[1] + 0.02, at[2]);
    previewRing.scale.setScalar(1.35 * Math.max(1, s));
    this.scene.add(previewRing);

    let swarmBase: THREE.Matrix4[] | null = null;
    if (built.instanced) {
      swarmBase = [];
      for (let i = 0; i < built.instanced.count; i++) {
        const m = new THREE.Matrix4();
        built.instanced.getMatrixAt(i, m);
        swarmBase.push(m);
      }
    }

    this.nodes.set(`${rung}:${n.id}`, {
      key: `${rung}:${n.id}`, rung, node: n, built, alpha: 0, base: at,
      centre: this.world(rung, c), radius: Math.max(sphere.radius, 0.6), ring, previewRing,
      wasVisible: false, enterT0: -1e9, swarmBase,
    });
  }

  private applyStates(rung: number) {
    const v = this.visual[rung];
    for (const n of this.rungs[rung].scene.nodes) {
      const o = this.nodes.get(`${rung}:${n.id}`)!;
      const dark = v.nodes[n.id] === "dark";
      for (const m of o.built.lit) m.color.set(dark ? CLAY_DARK : CLAY);
    }
  }

  private rebuildFlows(rung: number) {
    for (const f of this.flows[rung]) {
      this.scene.remove(f.line);
      f.line.geometry.dispose();
      f.lineMat.dispose();
      for (const p of f.packets) {
        this.scene.remove(p.head);
        for (const g of p.tail) {
          this.scene.remove(g);
          (g.material as THREE.Material).dispose();
        }
      }
    }
    const perFlow = 1 + Math.round(this.activity * 3);
    const out: FlowObj[] = [];
    for (const flow of this.visual[rung].flows) {
      const ids = [flow.from, ...flow.via, flow.to];
      const pts = ids.map((id, i) => {
        const a = this.anchorOf(rung, id);
        return v3(i === 0 || i === ids.length - 1 ? a : add(a, [0, 0.8, 0]));
      });
      const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.4);
      const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: flow.active ? 0.55 : 0.12 });
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(40)), lineMat);
      this.scene.add(line);
      const packets: Packet[] = [];
      if (flow.active) {
        for (let k = 0; k < perFlow; k++) {
          const head = new THREE.Mesh(this.packetGeom, this.packetMat);
          this.scene.add(head);
          const tail: THREE.Mesh[] = [];
          for (let j = 0; j < 4; j++) {
            const g = new THREE.Mesh(this.packetGeom, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 - j * 0.1, fog: false }));
            g.scale.setScalar(0.85 - j * 0.17);
            this.scene.add(g);
            tail.push(g);
          }
          packets.push({ head, tail, lastS: 0 });
        }
      }
      out.push({ line, lineMat, packets, curve, active: flow.active, label: flow.label });
    }
    this.flows[rung] = out;
  }

  private rebuildAssets(rung: number, prev: VisualState | null, now: number) {
    const v = this.visual[rung];
    const scene = this.rungs[rung].scene;
    const seen = new Set<string>();
    const slots = new Map<string, number>();
    for (const asset of scene.assets) {
      for (const place of v.assets[asset.id] ?? []) {
        const key = `${rung}:${asset.id}:${place.on}`;
        seen.add(key);
        const slot = slots.get(place.on) ?? 0;
        slots.set(place.on, slot + 1);
        let a = this.assets.get(key);
        if (!a) {
          const mats: THREE.Material[] = [];
          let mesh: THREE.Object3D;
          if (place.copy) {
            const em = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
            mesh = new THREE.LineSegments(new THREE.EdgesGeometry(this.assetGeom), em);
            mats.push(em);
          } else {
            const mm = new THREE.MeshStandardMaterial({ color: CLAY, roughness: 0.9, transparent: true });
            const mm3 = new THREE.Mesh(this.assetGeom, mm);
            mm3.castShadow = true;
            mesh = mm3;
            mats.push(mm);
          }
          this.scene.add(mesh);
          const before = prev?.assets[asset.id]?.[0]?.on;
          a = { mesh, mats, from: before && before !== place.on ? this.anchorOf(rung, before) : null, t0: now, slot, on: place.on, copy: place.copy, label: asset.label };
          this.assets.set(key, a);
        }
        a.slot = slot;
      }
    }
    for (const [key, a] of this.assets) {
      if (key.startsWith(`${rung}:`) && !seen.has(key)) {
        this.scene.remove(a.mesh);
        a.mats.forEach((m) => m.dispose());
        this.assets.delete(key);
      }
    }
  }

  private flash(at: THREE.Vector3, t: number) {
    let f = this.flashes.find((x) => !x.mesh.visible);
    if (!f) {
      if (this.flashes.length >= 10) return;
      const mesh = new THREE.Mesh(this.flashGeom, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide, fog: false, depthWrite: false }));
      this.scene.add(mesh);
      f = { mesh, t0: t };
      this.flashes.push(f);
    }
    f.t0 = t;
    f.mesh.position.copy(at);
    f.mesh.visible = true;
  }

  // ── per frame ──
  private project(p: V3): { x: number; y: number; depth: number } | null {
    this.tmp.set(p[0], p[1], p[2]);
    const depth = this.tmp.distanceTo(this.camera.position);
    this.tmp.project(this.camera);
    if (this.tmp.z > 1 || this.tmp.z < -1) return null;
    return { x: ((this.tmp.x + 1) / 2) * this.W, y: ((1 - this.tmp.y) / 2) * this.H, depth };
  }

  frame(t: number, progress: number, reduced: boolean, fonts: Fonts): FrameOut {
    const gl = this.gl, ctx = this.ctx;
    if (!gl || !ctx) return { cta: null, hover: null };
    const dt = this.lastT ? Math.min(64, t - this.lastT) : 16;
    this.lastT = t;
    const W = this.W, H = this.H;

    // ── camera: identical policy to the 2D renderer ──
    const i = Math.min(this.rungs.length - 1, Math.floor(progress));
    const frac = progress - i;
    const travel = i < this.rungs.length - 1 ? clamp01((frac - 0.55) / 0.42) : 0;
    const goalFor = (ri: number) => {
      const v = this.visual[ri];
      if (this.focus && this.focus.startsWith(`${ri}:`)) {
        return cameraFor(this.rungs[ri], { ...v, camera: { look: this.focus.slice(this.focus.indexOf(":") + 1), zoom: 1.2 } });
      }
      return cameraFor(this.rungs[ri], v);
    };
    const a = goalFor(i);
    let goal = a;
    if (travel > 0) goal = flightCamera(a, goalFor(i + 1), travel);
    if (!this.dragging) {
      const k = reduced ? 1 : 1 - Math.exp(-dt / 900);
      this.orbit.yaw -= this.orbit.yaw * k;
      this.orbit.pitch -= this.orbit.pitch * k;
      if (Math.abs(this.orbit.yaw) < 1e-4) this.orbit.yaw = 0;
      if (Math.abs(this.orbit.pitch) < 1e-4) this.orbit.pitch = 0;
    }
    const sway = reduced ? 0 : Math.sin(t / 5200) * 0.035;
    if (sway || this.orbit.yaw || this.orbit.pitch) goal = orbitCamera(goal, sway + this.orbit.yaw, this.orbit.pitch);
    if (!this.cam || reduced) this.cam = goal;
    else {
      const k = 1 - Math.exp(-dt / 260);
      this.cam = { position: lerp(this.cam.position, goal.position, k), target: lerp(this.cam.target, goal.target, k) };
    }
    const cam = fitCamera(this.cam, W, H);
    const aspect = W / H;
    const portrait = aspect < 0.9;
    this.camera.fov = FOV_DEG * (aspect < 1 ? 1 + (1 - aspect) * 0.8 : 1);
    this.camera.aspect = aspect;
    this.camera.position.set(cam.position[0], cam.position[1], cam.position[2]);
    this.camera.lookAt(cam.target[0], cam.target[1], cam.target[2]);
    const [cx, cy] = viewCentre(W, H);
    this.camera.setViewOffset(W, H, W / 2 - cx, H / 2 - cy, W, H);
    this.camera.updateProjectionMatrix();
    (this.gridMat.uniforms.uCentre.value as THREE.Vector3).set(cam.target[0], 0, cam.target[2]);
    // The shadow frustum rides with the target so it always covers the
    // scene in view at full resolution.
    this.sun.target.position.set(cam.target[0], 0, cam.target[2]);
    this.sun.position.set(cam.target[0] + 45, 38, cam.target[2] + 60);

    // ── nodes: fade toward state, glow when hot, entrance, idle life ──
    this.hits.clear();
    const labels: LabelIn[] = [];
    let hoverOut: FrameOut["hover"] = null;
    const pulse = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(t / 700);
    for (const o of this.nodes.values()) {
      const state = this.visual[o.rung].nodes[o.node.id];
      const hovered = this.hover === o.key || this.focus === o.key;
      const want = hovered ? 1 : ALPHA[state];
      o.alpha = reduced ? want : o.alpha + (want - o.alpha) * (1 - Math.exp(-dt / 420));
      const depth = this.tmp.set(o.centre[0], o.centre[1], o.centre[2]).distanceTo(this.camera.position);
      const f = fade(depth);
      const vis = o.alpha * f;
      const visible = vis > 0.01;
      if (visible && !o.wasVisible && want > 0.3) o.enterT0 = t;
      o.wasVisible = visible;
      o.built.group.visible = visible;
      o.ring.visible = false;
      o.previewRing.visible = false;
      if (!visible) continue;
      for (const m of o.built.materials) (m as THREE.Material & { opacity: number }).opacity = (m.userData.base as number) * vis;
      const hot = state === "hot";
      const glow = hovered ? 0.22 : hot ? 0.1 + pulse * 0.16 : 0;
      for (const m of o.built.lit) {
        m.emissive.set(0xffffff);
        m.emissiveIntensity = glow;
      }
      // Entrance: rise out of the ground and grow, briefly.
      const e = reduced ? 1 : easeOut(clamp01((t - o.enterT0) / 750));
      o.built.group.position.set(o.base[0], o.base[1] - (1 - e) * 1.4, o.base[2]);
      o.built.group.scale.setScalar(0.7 + 0.3 * e);
      // Idle life, all cheap: screens breathe and flicker, the globe turns,
      // the swarm drifts.
      if (!reduced) {
        o.built.screens.forEach((m, k) => {
          const breathe = 0.85 + 0.15 * Math.sin(t / 900 + k * 1.7);
          const flick = Math.sin(t / 143 + k * 5.1) * Math.sin(t / 61 + k) > 0.92 ? 0.55 : 1;
          m.emissiveIntensity = (hot ? 0.8 : 0.55) * breathe * flick;
        });
        if (o.node.kind === "globe") o.built.group.rotation.y = t * 0.00005;
        if (o.built.instanced && o.swarmBase) {
          const inst = o.built.instanced;
          const density = Math.max(6, Math.round(o.swarmBase.length * (0.35 + 0.65 * this.activity)));
          inst.count = density;
          const m = new THREE.Matrix4();
          for (let k = 0; k < density; k++) {
            m.copy(o.swarmBase[k]);
            const el = m.elements;
            el[13] = o.swarmBase[k].elements[13] + Math.sin(t / 900 + k * 1.3) * 0.14;
            inst.setMatrixAt(k, m);
          }
          inst.instanceMatrix.needsUpdate = true;
        }
      }
      if (hot) {
        o.ring.visible = true;
        o.ring.scale.setScalar((0.9 + pulse * 0.5) * Math.max(1, o.node.scale ?? 1));
        (o.ring.material as THREE.MeshBasicMaterial).opacity = 0.45 * f * (1 - pulse * 0.6);
      }
      if (this.preview.has(o.key)) {
        o.previewRing.visible = true;
        (o.previewRing.material as THREE.MeshBasicMaterial).opacity = 0.55 * f;
      }
      const p = this.project(o.centre);
      if (p) {
        const fpx = (H / 2) / Math.tan((this.camera.fov * Math.PI) / 360);
        const r = (o.radius * fpx) / depth;
        if (o.alpha > 0.15 && f > 0.25) {
          this.hits.set(o.key, { key: o.key, x: p.x, y: p.y, r });
          if (this.hover === o.key) hoverOut = { x: p.x + r + 8, y: p.y, label: o.node.label ?? o.node.id, blurb: o.node.blurb ?? "" };
        }
        const inFlow = this.visual[o.rung].flows.some((fl) => fl.active && (fl.from === o.node.id || fl.to === o.node.id));
        if (o.node.label && (!portrait || hot || inFlow)) {
          const top = this.project(add(o.centre, [0, o.radius * 1.05, 0]));
          if (top) {
            ctx.font = `500 10px ${fonts.mono}`;
            const text = o.node.label.toUpperCase();
            labels.push({ x: top.x, y: top.y - 14, w: ctx.measureText(text).width, h: 12, text, alpha: Math.min(1, o.alpha * 1.1) * f, ax: top.x, ay: top.y - 4 });
          }
        }
      }
    }

    // ── flows: packets with tails, and a flash where they land ──
    const flowLabels: { x: number; y: number; text: string; alpha: number }[] = [];
    const period = 1700 / (0.6 + this.activity);
    this.flows.forEach((list) => {
      for (const fl of list) {
        const mid = fl.curve.getPointAt(0.5);
        const depth = mid.distanceTo(this.camera.position);
        const f = fade(depth);
        fl.lineMat.opacity = (fl.active ? 0.55 : 0.12) * f;
        const n = fl.packets.length;
        fl.packets.forEach((p, k) => {
          const s = reduced ? 0.5 : (t / period + k / n) % 1;
          if (!reduced && s < p.lastS && f > 0.1) this.flash(fl.curve.getPointAt(1), t);
          p.lastS = s;
          p.head.position.copy(fl.curve.getPointAt(s));
          p.head.visible = f > 0.05;
          p.tail.forEach((g, j) => {
            const sj = s - (j + 1) * 0.022;
            g.visible = !reduced && sj > 0 && f > 0.05;
            if (g.visible) g.position.copy(fl.curve.getPointAt(sj));
          });
        });
        if (fl.active && fl.label) {
          const m = this.project([mid.x, mid.y, mid.z]);
          if (m) flowLabels.push({ x: m.x, y: m.y + 7, text: fl.label, alpha: 0.7 * f });
        }
      }
    });
    for (const fx of this.flashes) {
      if (!fx.mesh.visible) continue;
      const k = clamp01((t - fx.t0) / 450);
      if (k >= 1) { fx.mesh.visible = false; continue; }
      fx.mesh.scale.setScalar(0.5 + easeOut(k) * 1.6);
      (fx.mesh.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - k) * (1 - k);
      fx.mesh.lookAt(this.camera.position);
    }

    // ── assets: a small column beside the object they live on ──
    const assetLabels: { x: number; y: number; text: string; alpha: number }[] = [];
    for (const [key, a] of this.assets) {
      const rung = Number(key.slice(0, key.indexOf(":")));
      const onObj = this.nodes.get(`${rung}:${a.on}`);
      const side = onObj ? Math.min(onObj.radius, 1.6) + 0.35 : 1.2;
      const base = onObj ? onObj.centre : this.anchorOf(rung, a.on);
      const dest = add(base, [side, -0.3 + a.slot * 0.42, 0.4]);
      let pos = dest;
      if (a.from && !reduced) {
        const k = easeOut(clamp01((t - a.t0) / 1500));
        if (k >= 1) a.from = null;
        else pos = add(lerp(a.from, dest, k), [0, Math.sin(k * Math.PI) * 2.2, 0]);
      }
      a.mesh.position.set(pos[0], pos[1], pos[2]);
      const depth = a.mesh.position.distanceTo(this.camera.position);
      const f = fade(depth);
      const vis = (onObj ? Math.max(onObj.alpha, a.copy ? 1 : 0) : 1) * f;
      a.mesh.visible = vis > 0.02;
      for (const m of a.mats) (m as THREE.Material & { opacity: number }).opacity = vis * (a.copy ? 0.9 : 1);
      if (a.mesh.visible && (!portrait || a.copy || this.visual[rung].nodes[a.on] === "hot")) {
        const p = this.project(pos);
        if (p) assetLabels.push({ x: p.x + 10, y: p.y, text: a.label, alpha: 0.62 * vis });
      }
    }

    gl.render(this.scene, this.camera);

    // ── overlay text ──
    ctx.setTransform(this.DPR, 0, 0, this.DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.font = `400 10px ${fonts.mono}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    for (const l of assetLabels) {
      ctx.fillStyle = `rgba(255,255,255,${l.alpha.toFixed(3)})`;
      ctx.fillText(l.text, l.x, l.y);
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const l of flowLabels) {
      ctx.fillStyle = `rgba(255,255,255,${l.alpha.toFixed(3)})`;
      ctx.fillText(l.text, l.x, l.y);
    }
    ctx.font = `500 10px ${fonts.mono}`;
    ctx.textBaseline = "bottom";
    ctx.lineWidth = 1;
    for (const l of layoutLabels(labels)) {
      ctx.fillStyle = `rgba(255,255,255,${(l.alpha * 0.9).toFixed(3)})`;
      ctx.fillText(l.text, l.x, l.y);
      if (l.moved) {
        ctx.strokeStyle = `rgba(255,255,255,${(l.alpha * 0.4).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(l.x, l.y + 2);
        ctx.lineTo(l.ax, l.ay);
        ctx.stroke();
      }
    }

    const arrived = travel >= 1 - 1e-6;
    const ci = arrived ? i + 1 : i;
    const ctaP = this.project(this.anchorOf(ci, this.rungs[ci].scene.ctaNode));
    return { cta: ctaP && (travel === 0 || arrived) ? { x: ctaP.x, y: ctaP.y } : null, hover: hoverOut };
  }
}
