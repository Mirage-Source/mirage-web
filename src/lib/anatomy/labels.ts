// Label layout for the overlay: labels are placed above their anchors and,
// where two would overlap, the later one is pushed up until it clears. A
// label that moved far enough gets a leader line back to what it names.

export interface LabelIn {
  x: number;      // anchor x on screen (label is centred here)
  y: number;      // baseline y: the label sits above this
  w: number;      // measured text width
  h: number;      // line height
  text: string;
  alpha: number;
  // Where the leader line should point if the label moves.
  ax: number;
  ay: number;
}

export interface LabelOut extends LabelIn {
  moved: boolean;
}

const GAP = 3;

export function layoutLabels(items: LabelIn[]): LabelOut[] {
  // Top of screen first, so pushes only ever go up and never cascade back.
  const order = items.map((it, i) => ({ it, i })).sort((a, b) => a.it.y - b.it.y);
  const placed: { l: number; r: number; t: number; b: number }[] = [];
  const out: LabelOut[] = new Array(items.length);
  for (const { it, i } of order) {
    let y = it.y;
    const l = it.x - it.w / 2, r = it.x + it.w / 2;
    for (let guard = 0; guard < 16; guard++) {
      const t = y - it.h, b = y;
      const hit = placed.find((p) => l < p.r + GAP && r > p.l - GAP && t < p.b + GAP && b > p.t - GAP);
      if (!hit) break;
      y = hit.t - GAP;
    }
    placed.push({ l, r, t: y - it.h, b: y });
    out[i] = { ...it, y, moved: it.y - y > 6 };
  }
  return out;
}

// The flight between two rungs: rise, hold at the apex where both scenes are
// in view, then descend. `mix` is how far along the target has moved and
// `lift` how high the camera is above the straight path, both in 0..1.
export function travelCurve(x: number): { mix: number; lift: number } {
  const c = Math.max(0, Math.min(1, x));
  const ease = (v: number) => (v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2);
  const smooth = (a: number, b: number, v: number) => {
    const u = Math.max(0, Math.min(1, (v - a) / (b - a)));
    return u * u * (3 - 2 * u);
  };
  let mix: number;
  if (c < 0.42) mix = ease(c / 0.42) * 0.5;
  else if (c < 0.58) mix = 0.5;
  else mix = 0.5 + 0.5 * ease((c - 0.58) / 0.42);
  const lift = smooth(0, 0.4, c) * (1 - smooth(0.6, 1, c));
  return { mix, lift };
}
