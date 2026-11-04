// UI-kit preview registry (its own entry: src/ui/preview/index.ts). Gallery stills at 1920 × 1080 and 1:1
// comparison screens at 390 × 844 (render the Cmp* ones with --scale=3 to diff against notes/screens/*.png).
import "../../brand/fonts";
import React from "react";
import { Composition, Folder } from "remotion";
import { FPS } from "../../motion/time";
import {
  CmpAdd1,
  CmpAdd2,
  CmpApproveOneOk,
  CmpAsk,
  CmpClose,
  CmpCloseApprove,
  CmpClosed,
  CmpCreateLean,
  CmpCreateRules,
  CmpInstant,
  CmpInvite,
  CmpPayInFeed,
  CmpPayInReady,
  CmpPot,
  CmpPotMore,
  CmpSettings,
  CmpSpend1,
  CmpSpend2,
  CmpSpendOneOk,
  CREATE_RULES_PAGE_H,
  SETTINGS_PAGE_H,
} from "./Compare";
import { GalleryChat, GalleryDecide, GalleryJoin, GalleryMisc, GalleryMore, GalleryMotion, GalleryNight, GalleryPieces, GallerySpend, GalleryStory } from "./Gallery";
import { Measure, MEASURE_COLS, MEASURE_ROWS } from "./Measure";

const gal = (id: string, C: React.FC, frames = 120) => (
  <Composition key={id} id={id} component={C} durationInFrames={frames} fps={FPS} width={1920} height={1080} />
);

const cmp = (id: string, C: React.FC<{ theme: "day" | "night" }>, theme: "day" | "night", height = 844) => (
  <Composition key={id} id={id} component={() => <C theme={theme} />} durationInFrames={1} fps={FPS} width={390} height={height} />
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
      {gal("UiGalleryMore", GalleryMore)}
      {gal("UiGalleryMotion", GalleryMotion)}
      {gal("UiGalleryMisc", GalleryMisc)}
    </Folder>
    <Folder name="UiTools">
      <Composition id="UiMeasure" component={Measure} durationInFrames={1} fps={FPS} width={390 * MEASURE_COLS} height={844 * MEASURE_ROWS} />
    </Folder>
    <Folder name="UiCompare">
      {cmp("CmpDayPot", CmpPot, "day")}
      {cmp("CmpNightPot", CmpPot, "night")}
      {cmp("CmpDayPotMore", CmpPotMore, "day")}
      {cmp("CmpNightPotMore", CmpPotMore, "night")}
      {cmp("CmpDayInstant", CmpInstant, "day")}
      {cmp("CmpNightInstant", CmpInstant, "night")}
      {cmp("CmpDaySettings", CmpSettings, "day", SETTINGS_PAGE_H)}
      {cmp("CmpDayAdd1", CmpAdd1, "day")}
      {cmp("CmpDayAdd2", CmpAdd2, "day")}
      {cmp("CmpDaySpend1", CmpSpend1, "day")}
      {cmp("CmpDaySpend2", CmpSpend2, "day")}
      {cmp("CmpDaySpendOneOk", CmpSpendOneOk, "day")}
      {cmp("CmpDayApproveOneOk", CmpApproveOneOk, "day")}
      {cmp("CmpDayClose", CmpClose, "day")}
      {cmp("CmpNightClose", CmpClose, "night")}
      {cmp("CmpDayCloseApprove", CmpCloseApprove, "day")}
      {cmp("CmpDayClosed", CmpClosed, "day")}
      {cmp("CmpNightClosed", CmpClosed, "night")}
      {cmp("CmpDayInvite", CmpInvite, "day")}
      {cmp("CmpNightInvite", CmpInvite, "night")}
      {cmp("CmpDayAsk", CmpAsk, "day")}
      {cmp("CmpDayPayInReady", CmpPayInReady, "day")}
      {cmp("CmpDayPayInFeed", CmpPayInFeed, "day")}
      {cmp("CmpDayCreateLean", CmpCreateLean, "day")}
      {cmp("CmpDayCreateRules", CmpCreateRules, "day", CREATE_RULES_PAGE_H)}
    </Folder>
  </>
);
