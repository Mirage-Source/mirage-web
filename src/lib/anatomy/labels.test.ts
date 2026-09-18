import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { layoutLabels, travelCurve } from "./labels.ts";

const L = (x: number, y: number, w = 80, text = "a") => ({ x, y, w, h: 12, text, alpha: 1, ax: x, ay: y + 20 });

describe("layoutLabels", () => {
  it("leaves non-overlapping labels alone", () => {
    const out = layoutLabels([L(100, 100), L(300, 100), L(100, 200)]);
    assert.deepEqual(out.map((o) => [o.y, o.moved]), [[100, false], [100, false], [200, false]]);
  });
  it("pushes the lower of two overlapping labels up until it clears", () => {
    const [a, b] = layoutLabels([L(100, 100), L(110, 104)]);
    assert.equal(a.y, 100);
    assert.ok(b.y <= a.y - 12 - 3, `${b.y}`);
    assert.equal(b.moved, true);
  });
  it("keeps input order in the output", () => {
    const out = layoutLabels([L(100, 300, 80, "low"), L(100, 100, 80, "high")]);
    assert.equal(out[0].text, "low");
    assert.equal(out[1].text, "high");
  });
  it("stacks three labels without any two overlapping", () => {
    const out = layoutLabels([L(100, 100), L(100, 100), L(100, 100)]);
    const ys = out.map((o) => o.y).sort((a, b) => a - b);
    assert.ok(ys[1] - ys[0] >= 12 && ys[2] - ys[1] >= 12);
  });
});

describe("travelCurve", () => {
  it("starts at rest and ends arrived, with no lift at either end", () => {
    assert.deepEqual(travelCurve(0), { mix: 0, lift: 0 });
    const end = travelCurve(1);
    assert.ok(Math.abs(end.mix - 1) < 1e-9 && end.lift < 1e-9);
  });
  it("holds the midpoint at the apex", () => {
    for (const x of [0.42, 0.5, 0.58]) {
      const { mix, lift } = travelCurve(x);
      assert.equal(mix, 0.5);
      assert.ok(lift > 0.99, `${x}: ${lift}`);
    }
  });
  it("is monotonic in mix", () => {
    let last = -1;
    for (let x = 0; x <= 1.0001; x += 0.01) {
      const { mix } = travelCurve(x);
      assert.ok(mix >= last - 1e-12);
      last = mix;
    }
  });
});
