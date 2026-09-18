import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fill, resolve, validate } from "./engine.ts";
import type { LiveFacts, Scene } from "./types.ts";

const scene: Scene = {
  id: "t",
  eyebrow: "",
  title: "",
  intro: "",
  root: "idle",
  cta: "go",
  ctaNode: "a",
  camera: { position: [0, 0, 10], target: [0, 0, 0] },
  nodes: [
    { id: "a", kind: "phone", at: [0, 0, 0] },
    { id: "b", kind: "server", at: [5, 0, 0] },
    { id: "x", kind: "attacker", at: [9, 0, 0], initial: "hidden" },
  ],
  assets: [
    { id: "codes", label: "codes", home: "a" },
    { id: "photos", label: "photos", home: "a" },
  ],
  steps: {
    idle: { id: "idle", title: "", caption: "", effects: [], choices: [{ label: "go", to: "one" }] },
    one: {
      id: "one",
      title: "",
      caption: "",
      effects: [
        { type: "state", node: "x", state: "hot" },
        { type: "flow", from: "x", to: "a", persist: true },
        { type: "flow", from: "a", to: "b" },
      ],
      choices: [
        { label: "l", to: "two" },
        { label: "r", to: "alt" },
      ],
    },
    two: {
      id: "two",
      title: "",
      caption: "",
      effects: [
        { type: "copy", asset: "codes", to: "x" },
        { type: "flow", from: "a", to: "x" },
        { type: "camera", look: "x", zoom: 1.4 },
      ],
      choices: [{ label: "end", to: "end" }],
    },
    alt: {
      id: "alt",
      title: "",
      caption: "",
      effects: [{ type: "move", asset: "photos", to: "b" }],
      choices: [{ label: "end", to: "end" }],
    },
    end: { id: "end", title: "", caption: "", effects: [], choices: [], lesson: "" },
  },
};

describe("resolve", () => {
  it("at the root nothing has happened", () => {
    const v = resolve(scene, ["idle"]);
    assert.equal(v.nodes.a, "normal");
    assert.equal(v.nodes.x, "hidden");
    assert.deepEqual(v.assets, { codes: [{ on: "a", copy: false }], photos: [{ on: "a", copy: false }] });
    assert.deepEqual(v.flows, []);
    assert.equal(v.camera, null);
  });

  it("replays state along the path and animates only the last step's flows", () => {
    const v = resolve(scene, ["idle", "one", "two"]);
    assert.equal(v.nodes.x, "hot");
    // step one's persistent flow is a ghost; its non-persistent one is gone.
    assert.deepEqual(
      v.flows.map((f) => [f.from, f.to, f.active]),
      [
        ["x", "a", false],
        ["a", "x", true],
      ],
    );
    assert.deepEqual(v.camera, { look: "x", zoom: 1.4 });
  });

  it("copy keeps the original and adds a copy; move relocates", () => {
    const two = resolve(scene, ["idle", "one", "two"]);
    assert.deepEqual(two.assets.codes, [
      { on: "a", copy: false },
      { on: "x", copy: true },
    ]);
    const alt = resolve(scene, ["idle", "one", "alt"]);
    assert.deepEqual(alt.assets.photos, [{ on: "b", copy: false }]);
  });

  it("copying to the same node twice does not duplicate", () => {
    const s: Scene = {
      ...scene,
      steps: {
        ...scene.steps,
        two: { ...scene.steps.two, effects: [{ type: "copy", asset: "codes", to: "x" }, { type: "copy", asset: "codes", to: "x" }] },
      },
    };
    assert.equal(resolve(s, ["idle", "one", "two"]).assets.codes.length, 2);
  });

  it("rejects a path that does not follow the graph", () => {
    assert.throws(() => resolve(scene, ["idle", "two"]), /not a choice/);
    assert.throws(() => resolve(scene, ["one"]), /root/);
  });
});

describe("validate", () => {
  it("accepts the fixture", () => {
    assert.deepEqual(validate(scene), []);
  });

  it("reports dangling references", () => {
    const bad: Scene = {
      ...scene,
      steps: { ...scene.steps, alt: { ...scene.steps.alt, choices: [{ label: "?", to: "nope" }] } },
    };
    assert.match(validate(bad).join("\n"), /alt -> nope/);
  });

  it("reports unreachable steps", () => {
    const bad: Scene = {
      ...scene,
      steps: { ...scene.steps, orphan: { id: "orphan", title: "", caption: "", effects: [], choices: [] } },
    };
    assert.match(validate(bad).join("\n"), /unreachable: orphan/);
  });

  it("reports cycles", () => {
    const bad: Scene = {
      ...scene,
      steps: { ...scene.steps, end: { ...scene.steps.end, choices: [{ label: "again", to: "one" }] } },
    };
    assert.match(validate(bad).join("\n"), /cycle/);
  });

  it("reports effects that name unknown nodes or assets", () => {
    const bad: Scene = {
      ...scene,
      steps: {
        ...scene.steps,
        alt: { ...scene.steps.alt, effects: [{ type: "move", asset: "ghost", to: "b" }, { type: "state", node: "zz", state: "hot" }] },
      },
    };
    const out = validate(bad).join("\n");
    assert.match(out, /asset ghost/);
    assert.match(out, /node zz/);
  });

  it("requires terminal steps to carry a lesson and non-terminal ones not to", () => {
    const bad: Scene = {
      ...scene,
      steps: { ...scene.steps, end: { ...scene.steps.end, lesson: undefined } },
    };
    assert.match(validate(bad).join("\n"), /end has no lesson/);
  });
});

describe("fill", () => {
  const facts: LiveFacts = {
    sessions_7d: 12345,
    sessions_24h: 900,
    total_sessions: 1000000,
    unique_ips: 4321,
    shell_reached: null,
    top_usernames: ["root", "admin", "ubuntu"],
  };

  it("substitutes formatted numbers and joins lists", () => {
    assert.equal(fill("{sessions_7d} in a week, tried {top_usernames}", facts), "12,345 in a week, tried root, admin, ubuntu");
  });

  it("returns null when a needed fact is missing or facts are absent", () => {
    assert.equal(fill("{shell_reached} shells", facts), null);
    assert.equal(fill("{sessions_7d}", null), null);
  });

  it("passes plain text through even without facts", () => {
    assert.equal(fill("no numbers here", null), "no numbers here");
  });
});
