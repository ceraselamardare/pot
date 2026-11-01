// UI-kit preview registry (its own entry: src/ui/preview/index.ts). Gallery stills at 1920 × 1080 and 1:1
// comparison screens at 390 × 844 (render the Cmp* ones with --scale=3 to diff against notes/screens/*.png).
import "../../brand/fonts";
import React from "react";
import { Composition, Folder } from "remotion";
import { FPS } from "../../motion/time";
import { CmpClose, CmpCloseApprove, CmpClosed, CmpInstant, CmpInvite, CmpLivePot, CmpPot, CmpRules } from "./Compare";
import { GalleryChat, GalleryDecide, GalleryJoin, GalleryMisc, GalleryMotion, GalleryNight, GalleryPieces, GallerySpend, GalleryStory } from "./Gallery";
import { Measure } from "./Measure";

const gal = (id: string, C: React.FC, frames = 120) => (
  <Composition key={id} id={id} component={C} durationInFrames={frames} fps={FPS} width={1920} height={1080} />
);

const cmp = (id: string, C: React.FC<{ theme: "day" | "night" }>, theme: "day" | "night") => (
  <Composition key={id} id={id} component={() => <C theme={theme} />} durationInFrames={1} fps={FPS} width={390} height={844} />
);

export const UiPreviewRoot: React.FC = () => (
  <>
    <Folder name="UiGallery">
      {gal("UiGalleryStory", () => <GalleryStory theme="day" />)}
      {gal("UiGalleryJoin", () => <GalleryJoin theme="day" />)}
      {gal("UiGallerySpend", () => <GallerySpend theme="day" />)}
      {gal("UiGalleryDecide", () => <GalleryDecide theme="day" />)}
      {gal("UiGalleryChat", GalleryChat)}
      {gal("UiGalleryNight", GalleryNight)}
      {gal("UiGalleryPieces", GalleryPieces)}
      {gal("UiGalleryMotion", GalleryMotion)}
      {gal("UiGalleryMisc", GalleryMisc)}
    </Folder>
    <Folder name="UiTools">
      <Composition id="UiMeasure" component={Measure} durationInFrames={1} fps={FPS} width={3120} height={1688} />
    </Folder>
    <Folder name="UiCompare">
      {cmp("CmpDayPot", CmpPot, "day")}
      {cmp("CmpDayLivePot", CmpLivePot, "day")}
      {cmp("CmpNightPot", CmpPot, "night")}
      {cmp("CmpDayInstant", CmpInstant, "day")}
      {cmp("CmpNightInstant", CmpInstant, "night")}
      {cmp("CmpDayRules", CmpRules, "day")}
      {cmp("CmpDayClose", CmpClose, "day")}
      {cmp("CmpNightClose", CmpClose, "night")}
      {cmp("CmpDayCloseApprove", CmpCloseApprove, "day")}
      {cmp("CmpDayClosed", CmpClosed, "day")}
      {cmp("CmpNightClosed", CmpClosed, "night")}
      {cmp("CmpDayInvite", CmpInvite, "day")}
      {cmp("CmpNightInvite", CmpInvite, "night")}
    </Folder>
  </>
);
