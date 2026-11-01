// Act 1, THE PROBLEM (builder A). One component per registry entry; each covers the timeline entries in its
// *_SCENES array and reads its length from src/data/timeline.ts. See ./README.md for beats, SFX and handoffs.
//   REGISTRY: { covers: S01_SCENES, component: S01Hook }, { covers: S02S03_SCENES, component: S02S03FrontChase },
//             { covers: S04_SCENES, component: S04Options }, { covers: S05_SCENES, component: S05Pivot }
export { S01Hook, S01_SCENES, S01_DURATION } from "./S01Hook";
export { S02S03FrontChase, S02S03_SCENES, S02S03_DURATION, FrontChaseVisual } from "./S02S03FrontChase";
export { S04Options, S04_SCENES, S04_DURATION } from "./S04Options";
export { S05Pivot, S05_SCENES, S05_DURATION, S05_END_BUBBLE, PUSH_RATIO } from "./S05Pivot";
