import type { Scene, V3 } from "../types.ts";

import { crawl } from "./crawl.ts";
import { mcp } from "./mcp.ts";
import { ssh } from "./ssh.ts";

// The rungs of the ladder, in scroll order, each placed at its own offset in
// one shared world so the camera can travel between them.
export interface Rung {
  scene: Scene;
  offset: V3;
}

export const RUNGS: Rung[] = [
  { scene: ssh, offset: [0, 0, 0] },
  { scene: crawl, offset: [66, 0, -34] },
  { scene: mcp, offset: [132, 0, -68] },
];

// Future addition: the victim's side of the story, a person's phone and then a
// company, which the sensors above watch happen. Both scenes are written and
// validated (`phone.ts`, `enterprise.ts`); they are held back until the page
// has room for a five-rung ladder.
//
// import { enterprise } from "./enterprise.ts";
// import { phone } from "./phone.ts";
// { scene: phone, offset: [...] }, { scene: enterprise, offset: [...] },
