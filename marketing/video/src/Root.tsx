// Composition registry. Agents: add your compositions inside your own <Folder>, additively.
// Re-read this file right before editing; other agents edit it too.
import "./brand/fonts";
import React from "react";
import { Composition, Folder } from "remotion";
import { FPS } from "./motion/time";
import { BrandCheck } from "./BrandCheck";
import { Video, VIDEO_DURATION } from "./Video";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Folder name="Director">
        {/* The film. PotDemo = clean (README link); PotDemoCaptioned = burned-in captions (the X post). */}
        <Composition
          id="PotDemo"
          component={Video}
          defaultProps={{ captions: false, music: true, vo: true, repoUrl: "" }}
          durationInFrames={VIDEO_DURATION}
          fps={FPS}
          width={1920}
          height={1080}
        />
        <Composition
          id="PotDemoCaptioned"
          component={Video}
          defaultProps={{ captions: true, music: true, vo: true, repoUrl: "" }}
          durationInFrames={VIDEO_DURATION}
          fps={FPS}
          width={1920}
          height={1080}
        />
        <Composition id="BrandCheck" component={BrandCheck} durationInFrames={1} fps={FPS} width={1920} height={1080} />
      </Folder>
      {/* UI-KIT:START (owned by the UI-kit agent) */}
      <Folder name="UIKit">
        <Composition id="UiKitGallery" lazyComponent={() => import("./ui/preview/MainGallery")} durationInFrames={120} fps={FPS} width={1920} height={1080} />
      </Folder>
      {/* UI-KIT:END */}
      {/* MOTION-KIT:START (owned by the motion-kit agent) */}
      <Folder name="MotionKit">
        {/* ~13.7 s reel of the shared motion vocabulary. More demos: npx remotion studio src/motion/preview/index.ts */}
        <Composition
          id="MotionKitShowcase"
          lazyComponent={() => import("./motion/preview/Showcase")}
          durationInFrames={824}
          calculateMetadata={async () => ({ durationInFrames: (await import("./motion/preview/showcase-meta")).SHOWCASE_FRAMES })}
          fps={FPS}
          width={1920}
          height={1080}
        />
      </Folder>
      {/* MOTION-KIT:END */}
      {/* SCENES:START (scene agents add their compositions here) */}
      {/* SCENES:END */}
    </>
  );
};
