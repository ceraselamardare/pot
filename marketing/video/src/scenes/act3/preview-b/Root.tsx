// Builder B preview composition: s10b-more at its real timeline duration (1920 × 1080, 60 fps).
import "../../../brand/fonts";
import React from "react";
import { Composition, Folder } from "remotion";
import { FPS } from "../../../motion/time";
import { scene } from "../../../data/timeline";
import { S10bMore } from "../S10bMore";
import { HandoffRef } from "./HandoffRef";

export const PreviewBRoot: React.FC = () => (
  <Folder name="BuilderB">
    <Composition id="S10bMore" component={S10bMore} durationInFrames={scene("s10b-more").duration} fps={FPS} width={1920} height={1080} />
    {/* The handoff state from the spec at a global frame: 3150 = s10b f0, 3509 = s10b's last frame. */}
    <Composition id="S10bHandoffRef" component={HandoffRef} defaultProps={{ globalFrame: 3150 }} durationInFrames={1} fps={FPS} width={1920} height={1080} />
  </Folder>
);
