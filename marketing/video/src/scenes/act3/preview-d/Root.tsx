// Builder D preview registry: the two scenes at their real timeline durations (1920 × 1080, 60 fps), plus dev tools.
import "../../../brand/fonts";
import React from "react";
import { Composition, Folder } from "remotion";
import { FPS } from "../../../motion/time";
import { scene } from "../../../data/timeline";
import { S09Instant, S10Group } from "../d-index";
import { DMeasure } from "./Measure";
import { ZoomTest } from "./ZoomTest";
import { HandoffRef } from "./HandoffRef";

export const DPreviewRoot: React.FC = () => (
  <>
    <Folder name="BuilderD">
      <Composition id="S09Instant" component={S09Instant} durationInFrames={scene("s09-instant").duration} fps={FPS} width={1920} height={1080} />
      <Composition id="S10Group" component={S10Group} durationInFrames={scene("s10-group").duration} fps={FPS} width={1920} height={1080} />
    </Folder>
    <Folder name="BuilderD-Tools">
      <Composition id="DZoomTest" component={ZoomTest} defaultProps={{ scale: 2.2, cx: -380, cy: 404 }} durationInFrames={1} fps={FPS} width={1920} height={1080} />
      <Composition id="DRefS08End" component={HandoffRef} defaultProps={{ state: "s08end" as const }} durationInFrames={1} fps={FPS} width={1920} height={1080} />
      <Composition id="DRefS11Start" component={HandoffRef} defaultProps={{ state: "s11start" as const }} durationInFrames={1} fps={FPS} width={1920} height={1080} />
      <Composition id="DMeasure" component={DMeasure} durationInFrames={1} fps={FPS} width={4680} height={2532} />
    </Folder>
  </>
);
