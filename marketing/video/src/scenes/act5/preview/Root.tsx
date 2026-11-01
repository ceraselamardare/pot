// Act 5 preview compositions at the real timeline durations (1920 × 1080, 60 fps).
import "../../../brand/fonts";
import React from "react";
import { Composition, Folder } from "remotion";
import { FPS } from "../../../motion/time";
import { scene } from "../../../data/timeline";
import { S13End } from "../S13End";
import { BrandDiff } from "./BrandDiff";

export const Act5PreviewRoot: React.FC = () => (
  <Folder name="Act5">
    <Composition id="S13-End" component={S13End} durationInFrames={scene("s13-end").duration} fps={FPS} width={1920} height={1080} />
    <Composition id="BrandDiff" component={BrandDiff} defaultProps={{ which: "file" as "file" | "lockup" | "svg" }} durationInFrames={1} fps={FPS} width={1920} height={1080} />
    {/* Layout check for the optional repo line (sample text, preview only). */}
    <Composition
      id="S13-End-Repo"
      component={S13End}
      defaultProps={{ repoUrl: "github.com/your-team/pot" }}
      durationInFrames={scene("s13-end").duration}
      fps={FPS}
      width={1920}
      height={1080}
    />
  </Folder>
);
