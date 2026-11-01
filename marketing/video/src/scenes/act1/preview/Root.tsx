// Act 1 preview compositions: one per component at 1920 × 1080, 60 fps, with the timeline's real durations,
// plus the whole act back to back (A1-Act1) to check the seams.
import "../../../brand/fonts";
import React from "react";
import { Composition, Folder } from "remotion";
import { FPS } from "../../../motion/time";
import { S01Hook, S01_DURATION } from "../S01Hook";
import { S02S03FrontChase, S02S03_DURATION } from "../S02S03FrontChase";
import { S04Options, S04_DURATION } from "../S04Options";
import { S05Pivot, S05_DURATION } from "../S05Pivot";
import { Act1, ACT1_DURATION } from "./Act1";

export const Act1PreviewRoot: React.FC = () => (
  <Folder name="Act1">
    <Composition id="A1-S01Hook" component={S01Hook} durationInFrames={S01_DURATION} fps={FPS} width={1920} height={1080} />
    <Composition id="A1-S02S03FrontChase" component={S02S03FrontChase} durationInFrames={S02S03_DURATION} fps={FPS} width={1920} height={1080} />
    <Composition id="A1-S04Options" component={S04Options} durationInFrames={S04_DURATION} fps={FPS} width={1920} height={1080} />
    <Composition id="A1-S05Pivot" component={S05Pivot} durationInFrames={S05_DURATION} fps={FPS} width={1920} height={1080} />
    <Composition id="A1-Act1" component={Act1} durationInFrames={ACT1_DURATION} fps={FPS} width={1920} height={1080} />
  </Folder>
);
