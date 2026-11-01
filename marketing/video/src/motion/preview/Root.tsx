// Motion-kit preview harness (own entry point; does not touch the main Root).
//   npx remotion studio src/motion/preview/index.ts
//   npx remotion still src/motion/preview/index.ts MK-Kinetic out/stills/motion/kinetic.png --frame=60 --scale=0.5
import "../../brand/fonts";
import React from "react";
import { Composition, Folder } from "remotion";
import { FPS } from "../time";
import { KineticDemo, KINETIC_FRAMES } from "./KineticDemo";
import { MoneyDemo, MONEY_FRAMES } from "./MoneyDemo";
import { TransitionsDemo, TRANSITIONS_FRAMES } from "./TransitionsDemo";
import { CameraDemo, CAMERA_FRAMES } from "./CameraDemo";
import { EffectsDemo, EFFECTS_FRAMES } from "./EffectsDemo";
import { MotionKitShowcase, SHOWCASE_FRAMES } from "./Showcase";
import { InSceneDemo, IN_SCENE_FRAMES } from "./InSceneDemo";

const W = 1920;
const H = 1080;

export const MotionPreviewRoot: React.FC = () => (
  <Folder name="MotionKit">
    <Composition id="MK-Showcase" component={MotionKitShowcase} durationInFrames={SHOWCASE_FRAMES} fps={FPS} width={W} height={H} />
    <Composition id="MK-Kinetic" component={KineticDemo} durationInFrames={KINETIC_FRAMES} fps={FPS} width={W} height={H} />
    <Composition id="MK-Money" component={MoneyDemo} durationInFrames={MONEY_FRAMES} fps={FPS} width={W} height={H} />
    <Composition id="MK-Transitions" component={TransitionsDemo} durationInFrames={TRANSITIONS_FRAMES} fps={FPS} width={W} height={H} />
    <Composition id="MK-Camera" component={CameraDemo} durationInFrames={CAMERA_FRAMES} fps={FPS} width={W} height={H} />
    <Composition id="MK-Effects" component={EffectsDemo} durationInFrames={EFFECTS_FRAMES} fps={FPS} width={W} height={H} />
    <Composition id="MK-InScene" component={InSceneDemo} durationInFrames={IN_SCENE_FRAMES} fps={FPS} width={W} height={H} />
  </Folder>
);
