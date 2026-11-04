// Builder C preview compositions: s07-create and s08-join at their real timeline durations (1920 × 1080, 60 fps),
// the two back to back (to check the s07 → s08 whip across the cut), and the measuring tool.
import "../../../brand/fonts";
import React from "react";
import { Composition, Folder, Series } from "remotion";
import { FPS } from "../../../motion/time";
import { scene } from "../../../data/timeline";
import { S07Create } from "../S07Create";
import { S08Join } from "../S08Join";
import { CMeasure } from "./Measure";
import { HandoffRef } from "./HandoffRef";

const W = 1920;
const H = 1080;
const D7 = scene("s07-create").duration;
const D8 = scene("s08-join").duration;

/** s07 then s08, cut exactly where the master timeline cuts (for checking the cross-cut whip and drift). */
const S07S08: React.FC = () => (
  <Series>
    <Series.Sequence durationInFrames={D7} premountFor={30}>
      <S07Create />
    </Series.Sequence>
    <Series.Sequence durationInFrames={D8} premountFor={30}>
      <S08Join />
    </Series.Sequence>
  </Series>
);

export const PreviewCRoot: React.FC = () => (
  <Folder name="BuilderC">
    <Composition id="S07Create" component={S07Create} durationInFrames={D7} fps={FPS} width={W} height={H} />
    <Composition id="S08Join" component={S08Join} durationInFrames={D8} fps={FPS} width={W} height={H} />
    <Composition id="S07S08" component={S07S08} durationInFrames={D7 + D8} fps={FPS} width={W} height={H} />
    <Composition id="S09HandoffRef" component={HandoffRef} durationInFrames={1} fps={FPS} width={W} height={H} />
    <Composition id="CMeasure" component={CMeasure} durationInFrames={1} fps={FPS} width={3120} height={4220} />
  </Folder>
);
