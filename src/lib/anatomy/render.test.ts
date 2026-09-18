import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { nearest, orbitCamera } from "./render.ts";

describe("orbitCamera", () => {
  const cam = { position: [10, 8, 20] as [number, number, number], target: [0, 2, -3] as [number, number, number] };
  const dist = (c: typeof cam) => Math.hypot(c.position[0] - c.target[0], c.position[1] - c.target[1], c.position[2] - c.target[2]);

  it("is the identity at zero", () => {
    const o = orbitCamera(cam, 0, 0);
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(o.position[i] - cam.position[i]) < 1e-9);
  });

  it("keeps the distance to the target under any swing", () => {
    for (const [y, p] of [[0.5, 0], [-1, 0.3], [2, -0.5], [0.1, 0.59]]) {
      assert.ok(Math.abs(dist(orbitCamera(cam, y, p)) - dist(cam)) < 1e-9, `${y},${p}`);
    }
  });

  it("never goes below the ground or straight overhead", () => {
    const low = orbitCamera(cam, 0, -5);
    const high = orbitCamera(cam, 0, 5);
    assert.ok(low.position[1] > cam.target[1]);
    assert.ok(Math.hypot(high.position[0] - cam.target[0], high.position[2] - cam.target[2]) > 1);
  });
});

describe("nearest", () => {
  const hits = [
    { key: "a", x: 100, y: 100, r: 20 },
    { key: "b", x: 300, y: 100, r: 4 },
  ];
  it("picks the object under the pointer", () => {
    assert.equal(nearest(hits, 110, 105), "a");
  });
  it("gives thin objects a minimum catch radius", () => {
    assert.equal(nearest(hits, 312, 108), "b");
  });
  it("returns null in empty space", () => {
    assert.equal(nearest(hits, 200, 300), null);
  });
  it("prefers the closer of two overlapping objects", () => {
    assert.equal(nearest([...hits, { key: "c", x: 118, y: 100, r: 30 }], 116, 100), "c");
  });
});
