// Act 2 preview compositions at the real timeline durations (1920 × 1080, 60 fps).
import "../../../brand/fonts";
import React from "react";
import { Composition, Folder } from "remotion";
import { FPS } from "../../../motion/time";
import { scene } from "../../../data/timeline";
import { S06Reveal } from "../S06Reveal";
import { RevealHandoffNight } from "../S06Reveal";

/** s05's expected last frame (DOT_HANDOFF with all three dots ink-muted), for diffing against s06 frame 0. */
const HandoffRef: React.FC = () => <RevealHandoffNight middle="ink" />;

export const Act2PreviewRoot: React.FC = () => (
  <Folder name="Act2">
    <Composition id="S06-Reveal" component={S06Reveal} durationInFrames={scene("s06-reveal").duration} fps={FPS} width={1920} height={1080} />
    <Composition id="S06-HandoffRef" component={HandoffRef} durationInFrames={1} fps={FPS} width={1920} height={1080} />
  </Folder>
);
