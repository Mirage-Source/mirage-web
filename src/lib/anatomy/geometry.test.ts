import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { primitive, project, viewOf } from "./geometry.ts";

const cam = { position: [0, 0, 10] as const, target: [0, 0, 0] as const };

describe("project", () => {
  it("puts the camera target at the view centre", () => {
    const view = viewOf({ position: [...cam.position], target: [...cam.target] }, 1000, 800, [500, 400]);
    const p = project([0, 0, 0], view)!;
    assert.ok(Math.abs(p.x - 500) < 1e-9 && Math.abs(p.y - 400) < 1e-9);
    assert.ok(Math.abs(p.depth - 10) < 1e-9);
  });

  it("maps +y to up on screen and +x to right", () => {
    const view = viewOf({ position: [...cam.position], target: [...cam.target] }, 1000, 800, [500, 400]);
    const up = project([0, 1, 0], view)!;
    const right = project([1, 0, 0], view)!;
    assert.ok(up.y < 400);
    assert.ok(right.x > 500);
  });

  it("shrinks with distance", () => {
    const view = viewOf({ position: [...cam.position], target: [...cam.target] }, 1000, 800, [500, 400]);
    const near = project([1, 0, 5], view)!;
    const far = project([1, 0, -5], view)!;
    assert.ok(near.x - 500 > far.x - 500);
  });

  it("returns null behind the camera", () => {
    const view = viewOf({ position: [...cam.position], target: [...cam.target] }, 1000, 800, [500, 400]);
    assert.equal(project([0, 0, 11], view), null);
  });
});

describe("primitive", () => {
  it("every kind yields segments that sit on or above the ground", () => {
    const kinds = ["figure", "attacker", "phone", "router", "tower", "globe", "server", "rack", "building", "laptop", "swarm", "cards"] as const;
    for (const k of kinds) {
      const segs = primitive(k, [0, 0, 0], 1);
      assert.ok(segs.length > 0, k);
      for (const [a, b] of segs) {
        assert.ok(a[1] >= -1e-9 && b[1] >= -1e-9, `${k} dips below ground`);
      }
    }
  });

  it("scales about the node's own footprint", () => {
    const one = primitive("server", [3, 0, 2], 1);
    const two = primitive("server", [3, 0, 2], 2);
    const top = (s: ReturnType<typeof primitive>) => Math.max(...s.flatMap(([a, b]) => [a[1], b[1]]));
    assert.ok(Math.abs(top(two) - 2 * top(one)) < 1e-9);
  });
});
