import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolve, validate } from "./engine.ts";
import { RUNGS } from "./scenes/index.ts";

describe("shipped scenes", () => {
  for (const { scene } of RUNGS) {
    it(`${scene.id} validates`, () => {
      assert.deepEqual(validate(scene), []);
    });

    it(`${scene.id}: every path from the root resolves and ends in a lesson`, () => {
      const walk = (path: string[]) => {
        const v = resolve(scene, path);
        assert.ok(v);
        const step = scene.steps[path[path.length - 1]];
        if (step.choices.length === 0) assert.ok(step.lesson && step.lesson.length > 40);
        for (const c of step.choices) walk([...path, c.to]);
      };
      walk([scene.root]);
    });

    it(`${scene.id}: the root offers exactly the CTA`, () => {
      assert.deepEqual(scene.steps[scene.root].choices.map((c) => c.label), [scene.cta]);
    });
  }
});
